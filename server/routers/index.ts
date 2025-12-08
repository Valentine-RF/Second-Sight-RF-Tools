/**
 * Second Sight RF Tools - Main tRPC Router
 * 
 * Combines all sub-routers into the main app router
 */

import { router } from '../_core/trpc';
import { sdrRouter } from './sdr';
import { advancedAnalysisRouter } from './advancedAnalysis';
import { compressiveSensingRouter } from './compressiveSensing';
// Import additional routers as they're created
// import { gpuAnalysisRouter } from './gpuAnalysis';
// import { timeFrequencyRouter } from './timeFrequency';
// import { rfFingerprintRouter } from './rfFingerprint';
// import { batchRouter } from './batch';

export const appRouter = router({
  // SDR device control and streaming
  sdr: sdrRouter,
  
  // GPU-accelerated analysis (WVD, FAM, RF-DNA, anomaly, protocol, geolocation, BSS)
  advancedAnalysis: advancedAnalysisRouter,
  
  // Compressive sensing / sparse recovery
  compressiveSensing: compressiveSensingRouter,
  
  // Placeholder routers - implement as needed
  // gpuAnalysis: gpuAnalysisRouter,
  // timeFrequency: timeFrequencyRouter,
  // rfFingerprint: rfFingerprintRouter,
  // batch: batchRouter,
});

// Export type for client
export type AppRouter = typeof appRouter;
