import { Router, Request, Response } from 'express';
import { getDb } from './db';
import { apiKeys } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Rate limiting store (in-memory, consider Redis for production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Middleware to validate API key and check rate limits
 */
async function validateApiKey(req: Request, res: Response, next: Function) {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'Missing API key',
      message: 'Include X-API-Key header with your API key',
    });
  }
  
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: 'Database unavailable' });
    }
    
    // Find API key in database
    const result = await db.select()
      .from(apiKeys)
      .where(eq(apiKeys.key, apiKey))
      .limit(1);
    
    const keyRecord = result[0];
    
    if (!keyRecord) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    if (!keyRecord.isActive) {
      return res.status(403).json({ error: 'API key is disabled' });
    }
    
    if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
      return res.status(403).json({ error: 'API key has expired' });
    }
    
    // Check rate limit
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const rateLimitKey = `${keyRecord.id}`;
    
    let rateLimit = rateLimitStore.get(rateLimitKey);
    if (!rateLimit || now > rateLimit.resetTime) {
      rateLimit = { count: 0, resetTime: now + hourMs };
      rateLimitStore.set(rateLimitKey, rateLimit);
    }
    
    if (rateLimit.count >= keyRecord.rateLimit) {
      const resetIn = Math.ceil((rateLimit.resetTime - now) / 1000 / 60);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Rate limit: ${keyRecord.rateLimit} requests/hour. Resets in ${resetIn} minutes.`,
        resetIn,
      });
    }
    
    // Increment rate limit counter
    rateLimit.count++;
    
    // Update last used timestamp and request count
    await db.update(apiKeys)
      .set({
        lastUsed: new Date(),
        requestCount: keyRecord.requestCount + 1,
      })
      .where(eq(apiKeys.id, keyRecord.id));
    
    // Attach key info to request
    (req as any).apiKeyRecord = keyRecord;
    
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/public/classify
 * 
 * Classify modulation type from IQ samples
 * 
 * Request body:
 * {
 *   "iqSamples": number[] | string,  // Array of IQ samples or base64 encoded
 *   "sampleRate": number,             // Sample rate in Hz (optional)
 *   "format": "array" | "base64"      // Input format (default: "array")
 * }
 * 
 * Response:
 * {
 *   "modulation": string,
 *   "confidence": number,
 *   "allScores": { [key: string]: number },
 *   "features": {
 *     "meanAmplitude": number,
 *     "stdAmplitude": number,
 *     "meanPhase": number,
 *     "stdPhase": number,
 *     "spectralFlatness": number
 *   },
 *   "metadata": {
 *     "sampleCount": number,
 *     "processingTimeMs": number
 *   }
 * }
 */
router.post('/classify', validateApiKey, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { iqSamples, sampleRate, format = 'array' } = req.body;
    
    if (!iqSamples) {
      return res.status(400).json({
        error: 'Missing iqSamples',
        message: 'Request body must include iqSamples field',
      });
    }
    
    // Parse IQ samples based on format
    let samples: Float32Array;
    
    if (format === 'base64') {
      // Decode base64 to Float32Array
      const buffer = Buffer.from(iqSamples, 'base64');
      samples = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    } else if (format === 'array') {
      // Convert array to Float32Array
      if (!Array.isArray(iqSamples)) {
        return res.status(400).json({
          error: 'Invalid iqSamples format',
          message: 'iqSamples must be an array when format is "array"',
        });
      }
      samples = new Float32Array(iqSamples);
    } else {
      return res.status(400).json({
        error: 'Invalid format',
        message: 'format must be "array" or "base64"',
      });
    }
    
    // Validate sample count
    if (samples.length < 2 || samples.length > 100000) {
      return res.status(400).json({
        error: 'Invalid sample count',
        message: 'iqSamples must contain between 2 and 100,000 samples (I/Q pairs)',
      });
    }
    
    // Import classifier (lazy load to avoid startup overhead)
    const { getModulationClassifier } = await import('../client/src/lib/modulationClassifier');
    
    const classifier = getModulationClassifier();
    await classifier.initialize();
    
    // Run classification
    const result = await classifier.classify(samples);
    
    const processingTime = Date.now() - startTime;
    
    // Return result
    return res.json({
      modulation: result.modulation,
      confidence: result.confidence,
      allScores: result.allScores,
      features: result.features,
      metadata: {
        sampleCount: samples.length / 2, // I/Q pairs
        sampleRate: sampleRate || null,
        processingTimeMs: processingTime,
      },
    });
    
  } catch (error) {
    console.error('Classification error:', error);
    return res.status(500).json({
      error: 'Classification failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/public/status
 * 
 * Check API status and model information
 */
router.get('/status', validateApiKey, async (req: Request, res: Response) => {
  try {
    const { getModulationClassifier } = await import('../client/src/lib/modulationClassifier');
    const { MODULATION_TYPES } = await import('../client/src/lib/modulationClassifier');
    
    const classifier = getModulationClassifier();
    await classifier.initialize();
    
    const keyRecord = (req as any).apiKeyRecord;
    
    return res.json({
      status: 'operational',
      model: {
        supportedModulations: MODULATION_TYPES,
        inputFormat: ['array', 'base64'],
        maxSamples: 100000,
      },
      apiKey: {
        name: keyRecord.name,
        rateLimit: keyRecord.rateLimit,
        requestCount: keyRecord.requestCount,
        lastUsed: keyRecord.lastUsed,
      },
    });
  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({
      error: 'Status check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
