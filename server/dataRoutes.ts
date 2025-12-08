/**
 * Express routes for serving raw signal data files with HTTP Range support
 * Enables streaming of large .sigmf-data files without loading entire file into memory
 */

import { Router } from 'express';
import { getSignalCaptureById } from './db';

export const dataRouter = Router();

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
        const fileSize = stats.size;
        
        // Parse Range header
        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          
          res.status(206); // Partial Content
          res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
          res.setHeader('Content-Length', end - start + 1);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
          
          const stream = await readLocalFileStream(capture.localDataPath, { start, end });
          stream.pipe(res);
        } else {
          // Full file
          res.status(200);
          res.setHeader('Content-Length', fileSize);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
          
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
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
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
