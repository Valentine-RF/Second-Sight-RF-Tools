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
    
    if (!capture.dataFileUrl) {
      return res.status(404).json({ error: 'Data file URL not available' });
    }
    
    // Forward Range header to S3 if present
    const headers: Record<string, string> = {};
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }
    
    // Fetch from S3 with Range support
    const s3Response = await fetch(capture.dataFileUrl, { headers });
    
    // Forward status code (200 for full file, 206 for partial content)
    res.status(s3Response.status);
    
    // Forward relevant headers
    const contentType = s3Response.headers.get('content-type');
    const contentLength = s3Response.headers.get('content-length');
    const contentRange = s3Response.headers.get('content-range');
    const acceptRanges = s3Response.headers.get('accept-ranges');
    
    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    
    // Enable CORS for frontend access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    
    // Stream response body
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
