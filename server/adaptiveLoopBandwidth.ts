/**
 * Adaptive Loop Bandwidth Algorithm for Costas Loop
 * 
 * Automatically adjusts loop bandwidth based on:
 * 1. SNR - Lower SNR requires narrower bandwidth to reject noise
 * 2. Lock status - Wide bandwidth for acquisition, narrow for tracking
 * 3. Phase error variance - Adapt based on tracking quality
 */

export interface AdaptiveBandwidthParams {
  snrDb: number;
  lockDetected: boolean;
  phaseErrorVariance?: number;
  currentBandwidth?: number;
}

export interface AdaptiveBandwidthResult {
  bandwidth: number;
  mode: 'acquisition' | 'tracking' | 'holdover';
  reason: string;
}

/**
 * Calculate optimal loop bandwidth based on signal conditions
 * 
 * Algorithm:
 * - High SNR (>15 dB): Can use wider bandwidth for faster convergence
 * - Medium SNR (5-15 dB): Moderate bandwidth balances speed and noise
 * - Low SNR (<5 dB): Narrow bandwidth required for noise rejection
 * - Acquisition mode: Start with wide bandwidth
 * - Tracking mode: Reduce bandwidth after lock for stability
 */
export function calculateAdaptiveLoopBandwidth(params: AdaptiveBandwidthParams): AdaptiveBandwidthResult {
  const { snrDb, lockDetected, phaseErrorVariance, currentBandwidth } = params;

  // Define bandwidth ranges
  const BW_WIDE = 0.02;
  const BW_MEDIUM = 0.01;
  const BW_NARROW = 0.005;
  const BW_VERY_NARROW = 0.002;

  // Acquisition mode - not yet locked
  if (!lockDetected) {
    // Use SNR-based bandwidth for acquisition
    if (snrDb > 15) {
      return {
        bandwidth: BW_WIDE,
        mode: 'acquisition',
        reason: `High SNR (${snrDb.toFixed(1)} dB) allows wide bandwidth for fast acquisition`
      };
    } else if (snrDb > 5) {
      return {
        bandwidth: BW_MEDIUM,
        mode: 'acquisition',
        reason: `Medium SNR (${snrDb.toFixed(1)} dB) requires moderate bandwidth`
      };
    } else {
      return {
        bandwidth: BW_NARROW,
        mode: 'acquisition',
        reason: `Low SNR (${snrDb.toFixed(1)} dB) requires narrow bandwidth to reject noise`
      };
    }
  }

  // Tracking mode - already locked
  // Reduce bandwidth for better noise rejection and stability
  
  // Check phase error variance for tracking quality
  if (phaseErrorVariance !== undefined && phaseErrorVariance !== null) {
    if (phaseErrorVariance > 0.2) {
      // High phase error - may be losing lock, increase bandwidth
      return {
        bandwidth: BW_MEDIUM,
        mode: 'holdover',
        reason: `High phase error variance (${phaseErrorVariance.toFixed(3)}) - increasing bandwidth to maintain lock`
      };
    } else if (phaseErrorVariance < 0.05) {
      // Very low phase error - excellent tracking, can use very narrow bandwidth
      if (snrDb > 10) {
        return {
          bandwidth: BW_NARROW,
          mode: 'tracking',
          reason: `Excellent tracking (var=${phaseErrorVariance.toFixed(3)}) with good SNR (${snrDb.toFixed(1)} dB) - narrow bandwidth for stability`
        };
      } else {
        return {
          bandwidth: BW_VERY_NARROW,
          mode: 'tracking',
          reason: `Excellent tracking (var=${phaseErrorVariance.toFixed(3)}) with low SNR (${snrDb.toFixed(1)} dB) - very narrow bandwidth for noise rejection`
        };
      }
    }
  }

  // Default tracking bandwidth based on SNR
  if (snrDb > 15) {
    return {
      bandwidth: BW_NARROW,
      mode: 'tracking',
      reason: `Locked with high SNR (${snrDb.toFixed(1)} dB) - narrow bandwidth for stable tracking`
    };
  } else if (snrDb > 5) {
    return {
      bandwidth: BW_NARROW,
      mode: 'tracking',
      reason: `Locked with medium SNR (${snrDb.toFixed(1)} dB) - narrow bandwidth for tracking`
    };
  } else {
    return {
      bandwidth: BW_VERY_NARROW,
      mode: 'tracking',
      reason: `Locked with low SNR (${snrDb.toFixed(1)} dB) - very narrow bandwidth for maximum noise rejection`
    };
  }
}

/**
 * Multi-stage adaptive bandwidth strategy
 * 
 * Stage 1 (Acquisition): Wide bandwidth for fast pull-in
 * Stage 2 (Lock): Reduce bandwidth for stability
 * Stage 3 (Tracking): Narrow bandwidth for noise rejection
 */
export function getMultiStageBandwidth(
  stage: 'acquisition' | 'lock' | 'tracking',
  snrDb: number
): number {
  switch (stage) {
    case 'acquisition':
      // Wide bandwidth for fast acquisition
      return snrDb > 10 ? 0.02 : 0.015;
    
    case 'lock':
      // Medium bandwidth after initial lock
      return snrDb > 10 ? 0.01 : 0.008;
    
    case 'tracking':
      // Narrow bandwidth for stable tracking
      return snrDb > 10 ? 0.005 : 0.003;
    
    default:
      return 0.01;
  }
}

/**
 * Calculate bandwidth adaptation rate
 * 
 * Smoothly transition between bandwidth values to avoid
 * sudden changes that could destabilize the loop
 */
export function smoothBandwidthTransition(
  currentBw: number,
  targetBw: number,
  alpha: number = 0.1
): number {
  // Exponential moving average for smooth transition
  return currentBw + alpha * (targetBw - currentBw);
}
