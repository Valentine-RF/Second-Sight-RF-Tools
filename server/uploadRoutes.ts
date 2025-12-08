import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { storagePut } from './storage';
import { createSignalCapture } from './db';
import { parseSigMFMetadata } from './sigmf';
import { isValidDatatype, validateFileSize, generateSigMFMetadata, type RawIQMetadata } from './sigmfGenerator';

const router = Router();

// Configure multer for memory storage (files stored in RAM temporarily)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10GB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept .sigmf-meta, .sigmf-data, .iq, .dat, .bin files
    const allowedExtensions = ['.sigmf-meta', '.sigmf-data', '.iq', '.dat', '.bin'];
    const hasAllowedExt = allowedExtensions.some(ext => file.originalname.endsWith(ext));
    
    if (hasAllowedExt) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedExtensions.join(', ')}`));
    }
  },
});

/**
 * POST /api/upload/sigmf
 * Upload SigMF files (.sigmf-meta and .sigmf-data)
 * 
 * Expects multipart/form-data with:
 * - metaFile: .sigmf-meta file
 * - dataFile: .sigmf-data file
 * - name: capture name (optional)
 * - description: capture description (optional)
 */
router.post('/sigmf', upload.fields([
  { name: 'metaFile', maxCount: 1 },
  { name: 'dataFile', maxCount: 1 },
]), async (req, res) => {
  try {
    // Verify user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const metaFile = files.metaFile?.[0];
    const dataFile = files.dataFile?.[0];

    if (!metaFile || !dataFile) {
      return res.status(400).json({ error: 'Both metaFile and dataFile are required' });
    }

    // Parse SigMF metadata
    const metadataJson = metaFile.buffer.toString('utf-8');
    const metadata = parseSigMFMetadata(metadataJson);

    // Generate unique file keys for S3
    const fileId = nanoid();
    const metaFileKey = `${req.user.id}/signals/${fileId}.sigmf-meta`;
    const dataFileKey = `${req.user.id}/signals/${fileId}.sigmf-data`;

    // Upload metadata file to S3
    const metaResult = await storagePut(
      metaFileKey,
      metaFile.buffer,
      'application/json'
    );

    // Upload data file to S3
    const dataResult = await storagePut(
      dataFileKey,
      dataFile.buffer,
      'application/octet-stream'
    );

    // Create database record
    const capture = await createSignalCapture({
      userId: req.user.id,
      name: req.body.name || metaFile.originalname.replace('.sigmf-meta', ''),
      description: req.body.description || null,
      metaFileKey,
      metaFileUrl: metaResult.url,
      dataFileKey,
      dataFileUrl: dataResult.url,
      datatype: metadata.global['core:datatype'],
      sampleRate: metadata.global['core:sample_rate'],
      hardware: metadata.global['core:hw'] || null,
      author: metadata.global['core:author'] || null,
      sha512: metadata.global['core:sha512'] || null,
      dataFileSize: dataFile.size,
      status: 'ready',
    });

    res.json({
      success: true,
      captureId: capture.id,
      metaFileUrl: metaResult.url,
      dataFileUrl: dataResult.url,
    });
  } catch (error) {
    console.error('[Upload] SigMF upload failed:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * POST /api/upload/raw-iq
 * Upload raw IQ file with manual metadata parameters
 * 
 * Expects multipart/form-data with:
 * - dataFile: raw IQ file (.iq, .dat, .bin)
 * - name: capture name
 * - datatype: SigMF datatype (e.g., cf32_le, ci16_le, cu8)
 * - sampleRate: sample rate in Hz
 * - centerFrequency: center frequency in Hz (optional)
 * - hardware: hardware description (optional)
 * - author: author name (optional)
 * - description: capture description (optional)
 */
router.post('/raw-iq', upload.single('dataFile'), async (req, res) => {
  try {
    // Verify user is authenticated
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const dataFile = req.file;
    if (!dataFile) {
      return res.status(400).json({ error: 'dataFile is required' });
    }

    // Validate required parameters
    const { name, datatype, sampleRate } = req.body;
    if (!name || !datatype || !sampleRate) {
      return res.status(400).json({ 
        error: 'Missing required parameters: name, datatype, sampleRate' 
      });
    }

    // Validate datatype
    if (!isValidDatatype(datatype)) {
      return res.status(400).json({ 
        error: `Invalid datatype: ${datatype}. Must be a valid SigMF datatype (e.g., cf32_le, ci16_le, cu8)` 
      });
    }

    // Validate file size matches datatype
    if (!validateFileSize(dataFile.size, datatype)) {
      return res.status(400).json({ 
        error: `File size ${dataFile.size} bytes is not a valid multiple of sample size for datatype ${datatype}` 
      });
    }

    // Generate SigMF metadata
    const metadataParams: RawIQMetadata = {
      name,
      description: req.body.description,
      datatype,
      sampleRate: parseFloat(sampleRate),
      centerFrequency: req.body.centerFrequency ? parseFloat(req.body.centerFrequency) : undefined,
      hardware: req.body.hardware,
      author: req.body.author || req.user.name || undefined,
    };

    const metadataJson = generateSigMFMetadata(metadataParams);

    // Generate unique file ID
    const fileId = nanoid();
    const localMetaPath = `signals/${req.user.id}/${fileId}.sigmf-meta`;
    const localDataPath = `signals/${req.user.id}/${fileId}.sigmf-data`;

    // PHASE 1: Write to local storage (REQUIRED)
    const { writeLocalFile } = await import('./localStorage');
    await writeLocalFile(localMetaPath, metadataJson);
    await writeLocalFile(localDataPath, dataFile.buffer);
    console.log(`[Upload] Local files written: ${localDataPath}`);

    // PHASE 2: Optional S3 sync
    let s3MetaUrl: string | null = null;
    let s3DataUrl: string | null = null;
    let s3SyncStatus: 'none' | 'pending' | 'synced' | 'failed' = 'none';

    if (process.env.ENABLE_S3_SYNC === 'true') {
      console.log(`[Upload] S3 sync enabled, uploading...`);
      s3SyncStatus = 'pending';
      try {
        const metaFileKey = `${req.user.id}/signals/${fileId}.sigmf-meta`;
        const dataFileKey = `${req.user.id}/signals/${fileId}.sigmf-data`;
        
        const [metaResult, dataResult] = await Promise.all([
          storagePut(metaFileKey, metadataJson, 'application/json'),
          storagePut(dataFileKey, dataFile.buffer, 'application/octet-stream'),
        ]);
        
        s3MetaUrl = metaResult.url;
        s3DataUrl = dataResult.url;
        s3SyncStatus = 'synced';
        console.log(`[Upload] S3 sync complete`);
      } catch (error) {
        console.warn('[Upload] S3 sync failed (continuing with local only):', error);
        s3SyncStatus = 'failed';
      }
    }

    // PHASE 3: Create database record
    const capture = await createSignalCapture({
      userId: req.user.id,
      name,
      description: req.body.description || null,
      localMetaPath,
      localDataPath,
      metaFileKey: s3MetaUrl ? `${req.user.id}/signals/${fileId}.sigmf-meta` : null,
      metaFileUrl: s3MetaUrl,
      dataFileKey: s3DataUrl ? `${req.user.id}/signals/${fileId}.sigmf-data` : null,
      dataFileUrl: s3DataUrl,
      s3SyncStatus,
      datatype,
      sampleRate: parseFloat(sampleRate),
      hardware: req.body.hardware || null,
      author: req.body.author || req.user.name || null,
      sha512: null,
      dataFileSize: dataFile.size,
      status: 'ready',
    });

    res.json({
      success: true,
      captureId: capture.id,
      name,
      localDataPath,
      s3DataUrl,
      s3SyncStatus,
      dataFileSize: dataFile.size,
    });
  } catch (error) {
    console.error('[Upload] Raw IQ upload failed:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * POST /api/upload/progress
 * Track upload progress (called by client during upload)
 * 
 * This is a placeholder for future implementation of upload progress tracking
 * using streaming or chunked uploads.
 */
router.post('/progress', (req, res) => {
  res.json({ message: 'Progress tracking not yet implemented' });
});

export { router as uploadRouter };
