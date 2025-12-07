import { Router } from 'express';
import { logSignalUpload, logModulationClassification, logAnomalyDetection } from './splunkClient';

const router = Router();

/**
 * POST /api/splunk/log-upload
 * Log signal upload event to Splunk
 */
router.post('/log-upload', async (req, res) => {
  try {
    const { captureName, fileSize, format } = req.body;
    const user = (req as any).user;

    await logSignalUpload({
      userId: user?.id || 0,
      userName: user?.name || 'anonymous',
      captureId: 0, // TODO: Get actual capture ID after upload
      captureName,
      sampleRate: 0, // TODO: Extract from metadata
      centerFrequency: undefined,
      fileSize,
      datatype: format,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Splunk logging error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/splunk/log-classification
 * Log modulation classification event to Splunk
 */
router.post('/log-classification', async (req, res) => {
  try {
    const { captureName, modulationType, confidence, features } = req.body;
    const user = (req as any).user;

    await logModulationClassification({
      userId: user?.id || 0,
      userName: user?.name || 'anonymous',
      captureId: 0, // TODO: Get actual capture ID
      captureName,
      modulation: modulationType,
      confidence,
      allScores: features || {},
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Splunk logging error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * POST /api/splunk/log-anomaly
 * Log anomaly detection event to Splunk
 */
router.post('/log-anomaly', async (req, res) => {
  try {
    const { anomalyType, severity, description, captureName } = req.body;
    const user = (req as any).user;

    await logAnomalyDetection({
      userId: user?.id || 0,
      userName: user?.name || 'anonymous',
      captureId: 0, // TODO: Get actual capture ID
      captureName,
      anomalyType,
      description,
      severity: severity as any,
      metadata: {},
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Splunk logging error:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;
