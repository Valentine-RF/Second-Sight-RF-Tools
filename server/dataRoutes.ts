/**
 * Express routes for serving raw signal data files with HTTP Range support
 * Enables streaming of large .sigmf-data files without loading entire file into memory
 */

import { Router } from 'express';
import { getSignalCaptureById } from './db';
import { getSampleSize } from './sigmf';

export const dataRouter = Router();

export type ParsedRange = { start: number; end: number };
type RangeError = { error: string };

/**
 * Parse an HTTP byte range header and clamp to the file size.
 * Returns null when no range is provided, a ParsedRange on success,
 * or a RangeError for invalid requests (caller should return 416).
 */
export function parseByteRange(rangeHeader: string | undefined, fileSize: number): ParsedRange | RangeError | null {
  if (!rangeHeader) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return { error: 'Invalid Range format' };
  }

  const startStr = match[1];
  const endStr = match[2];

  // Suffix byte-range-spec (e.g., bytes=-500)
  if (!startStr && endStr) {
    const suffixLength = Number.parseInt(endStr, 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) {
      return { error: 'Invalid Range values' };
    }
    const start = Math.max(fileSize - suffixLength, 0);
    return { start, end: fileSize - 1 };
  }

  const start = Number.parseInt(startStr, 10);
  if (Number.isNaN(start) || start < 0 || start >= fileSize) {
    return { error: 'Range start out of bounds' };
  }

  const end = endStr ? Number.parseInt(endStr, 10) : fileSize - 1;
  if (Number.isNaN(end) || end < start) {
    return { error: 'Range end out of bounds' };
  }

  return { start, end: Math.min(end, fileSize - 1) };
}

function setSampleHeaders(res: any, datatype: string | null, fileSize: number, range: ParsedRange | null) {
  try {
    if (!datatype) return;
    const sampleSize = getSampleSize(datatype);
    const bytes = range ? range.end - range.start + 1 : fileSize;
    const sampleStart = range ? Math.floor(range.start / sampleSize) : 0;
    const sampleCount = Math.floor(bytes / sampleSize);
    res.setHeader('X-Sample-Start', sampleStart.toString());
    res.setHeader('X-Sample-Count', sampleCount.toString());
  } catch (error) {
    console.warn('[DataRoute] Unable to set sample headers:', error);
  }
}

/**
 * DEBUG: GET /api/captures/debug/list
 * List all captures for debugging
 */
dataRouter.get('/captures/debug/list', async (req, res) => {
  try {
    const db = await import('./db');
    const captures = await db.getUserSignalCaptures(1); // Test user ID
    res.json(captures);
  } catch (error) {
    console.error('Debug list error:', error);
    res.status(500).json({ error: 'Failed to list captures' });
  }
});

/**
 * GET /api/captures/:id/data
 * 
 * Proxies requests to S3 data file with Range header support
 * This enables the frontend streaming pipeline to fetch chunks of IQ data
 */
dataRouter.get('/captures/:id/data', async (req, res) => {
  try {
    const captureId = parseInt(req.params.id);
    console.log('[DataRoute] Fetching data for capture ID:', captureId);
    
    if (isNaN(captureId)) {
      return res.status(400).json({ error: 'Invalid capture ID' });
    }
    
    // Fetch capture metadata from database
    const capture = await getSignalCaptureById(captureId);
    
    if (!capture) {
      return res.status(404).json({ error: 'Capture not found' });
    }
    
    // PHASE 1: Try local file first (fastest)
    if (capture.localDataPath) {
      const { fileExists, readLocalFileStream, getFileStats } = await import('./localStorage');
      
      if (await fileExists(capture.localDataPath)) {
        console.log('[DataRoute] Serving from local storage:', capture.localDataPath);
        
        const stats = await getFileStats(capture.localDataPath);
        const fileSize = capture.dataFileSize ?? stats.size;

        if (capture.dataFileSize && capture.dataFileSize !== stats.size) {
          console.warn('[DataRoute] File size mismatch between DB and disk', { dbSize: capture.dataFileSize, diskSize: stats.size });
          res.setHeader('X-File-Size-Mismatch', 'true');
        }

        // Parse and validate Range header
        const rangeResult = parseByteRange(req.headers.range as string | undefined, fileSize);
        if (rangeResult && 'error' in rangeResult) {
          res.status(416);
          res.setHeader('Content-Range', `bytes */${fileSize}`);
          return res.json({ error: rangeResult.error });
        }

        const range = rangeResult as ParsedRange | null;

        if (range) {
          res.status(206); // Partial Content
          res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${fileSize}`);
          res.setHeader('Content-Length', range.end - range.start + 1);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
          setSampleHeaders(res, capture.datatype ?? null, fileSize, range);

          const stream = await readLocalFileStream(capture.localDataPath, { start: range.start, end: range.end });
          stream.pipe(res);
        } else {
          // Full file
          res.status(200);
          res.setHeader('Content-Length', fileSize);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
          setSampleHeaders(res, capture.datatype ?? null, fileSize, null);

          const stream = await readLocalFileStream(capture.localDataPath);
          stream.pipe(res);
        }
        return;
      }
    }
    
    // PHASE 2: Fall back to S3 if local file missing
    if (capture.dataFileUrl) {
      console.warn('[DataRoute] Local file missing, using S3:', capture.localDataPath);
      
      const headers: Record<string, string> = {};
      let validatedRange: ParsedRange | null = null;

      if (req.headers.range && capture.dataFileSize) {
        const rangeResult = parseByteRange(req.headers.range as string, capture.dataFileSize);
        if (rangeResult && 'error' in rangeResult) {
          res.status(416);
          res.setHeader('Content-Range', `bytes */${capture.dataFileSize}`);
          return res.json({ error: rangeResult.error });
        }
        validatedRange = rangeResult as ParsedRange | null;
      }

      if (req.headers.range) {
        headers['Range'] = req.headers.range as string;
      }

      const s3Response = await fetch(capture.dataFileUrl, { headers });
      res.status(s3Response.status);

      const contentType = s3Response.headers.get('content-type');
      const contentLength = s3Response.headers.get('content-length');
      const contentRange = s3Response.headers.get('content-range');
      const acceptRanges = s3Response.headers.get('accept-ranges');

      if (contentType) res.setHeader('Content-Type', contentType);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      setSampleHeaders(res, capture.datatype ?? null, capture.dataFileSize ?? Number(contentLength ?? 0), validatedRange);

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      
      if (s3Response.body) {
        const reader = s3Response.body.getReader();
        const pump = async () => {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(value);
          pump();
        };
        pump();
      } else {
        res.end();
      }
      return;
    }
    
    // PHASE 3: No data available
    return res.status(404).json({ error: 'Data file not found (neither local nor S3)' });
    
  } catch (error) {
    console.error('Error serving signal data:', error);
    res.status(500).json({ error: 'Failed to fetch signal data' });
  }
});

/**
 * GET /api/captures/:id/metadata
 * 
 * Proxies requests to S3 metadata file
 */
dataRouter.get('/captures/:id/metadata', async (req, res) => {
  try {
    const captureId = parseInt(req.params.id);
    
    if (isNaN(captureId)) {
      return res.status(400).json({ error: 'Invalid capture ID' });
    }
    
    const capture = await getSignalCaptureById(captureId);
    
    if (!capture) {
      return res.status(404).json({ error: 'Capture not found' });
    }
    
    if (!capture.metaFileUrl) {
      return res.status(404).json({ error: 'Metadata file URL not available' });
    }
    
    // Fetch metadata from S3
    const s3Response = await fetch(capture.metaFileUrl);
    const metadata = await s3Response.text();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(metadata);
    
  } catch (error) {
    console.error('Error serving metadata:', error);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});
