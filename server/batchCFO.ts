import { refineCFOWithCostasLoop } from './snrCfoBridge';
import { fetchIQSamples } from './iqDataFetcher';
import { calculateAdaptiveLoopBandwidth } from './adaptiveLoopBandwidth';
import type { SignalCapture, Annotation } from '../drizzle/schema';

export interface BatchCFOOptions {
  modulationOrder?: number;
  loopBandwidth?: number;
  useAdaptiveBandwidth?: boolean;
  maxConcurrent?: number;
}

export interface BatchCFOResult {
  annotationId: number;
  success: boolean;
  cfoRefinedHz?: number;
  cfoMethod?: string;
  cfoLockDetected?: boolean;
  cfoPhaseErrorVar?: number;
  error?: string;
}

export interface BatchCFOProgress {
  total: number;
  completed: number;
  failed: number;
  currentAnnotationId?: number;
}

/**
 * Process single annotation for CFO refinement
 */
async function processSingleAnnotation(
  annotation: Annotation,
  capture: SignalCapture,
  options: BatchCFOOptions
): Promise<BatchCFOResult> {
  try {
    if (!capture.dataFileUrl) {
      throw new Error("Data file not available");
    }
    if (!capture.sampleRate) {
      throw new Error("Sample rate not available");
    }

    // Fetch IQ samples for this annotation
    const { iqReal, iqImag } = await fetchIQSamples(
      capture.dataFileUrl,
      capture.datatype || 'cf32_le',
      annotation.sampleStart,
      Math.min(annotation.sampleCount, 32768)
    );

    // Calculate adaptive bandwidth if enabled
    let loopBandwidth = options.loopBandwidth || 0.01;
    
    if (options.useAdaptiveBandwidth && annotation.estimatedSNR) {
      const adaptiveResult = calculateAdaptiveLoopBandwidth({
        snrDb: annotation.estimatedSNR,
        lockDetected: false,
        currentBandwidth: loopBandwidth,
      });
      loopBandwidth = adaptiveResult.bandwidth;
    }

    // Run Costas loop refinement
    const result = await refineCFOWithCostasLoop(
      iqReal,
      iqImag,
      capture.sampleRate,
      {
        coarseCfoHz: annotation.estimatedCFO || 0,
        modulationOrder: options.modulationOrder || 4,
        loopBandwidth,
      }
    );

    return {
      annotationId: annotation.id,
      success: true,
      cfoRefinedHz: result.total_cfo_hz,
      cfoMethod: 'Costas Loop',
      cfoLockDetected: result.lock_detected,
      cfoPhaseErrorVar: result.phase_error_variance,
    };
  } catch (error) {
    return {
      annotationId: annotation.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Process multiple annotations in batches with concurrency control
 */
export async function batchRefineCFO(
  annotations: Annotation[],
  capture: SignalCapture,
  options: BatchCFOOptions,
  progressCallback?: (progress: BatchCFOProgress) => void
): Promise<BatchCFOResult[]> {
  const results: BatchCFOResult[] = [];
  const maxConcurrent = options.maxConcurrent || 3;
  
  let completed = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < annotations.length; i += maxConcurrent) {
    const batch = annotations.slice(i, i + maxConcurrent);
    
    // Process batch concurrently
    const batchPromises = batch.map(annotation => 
      processSingleAnnotation(annotation, capture, options)
    );
    
    const batchResults = await Promise.all(batchPromises);
    
    // Update progress
    for (const result of batchResults) {
      results.push(result);
      if (result.success) {
        completed++;
      } else {
        failed++;
      }
      
      if (progressCallback) {
        progressCallback({
          total: annotations.length,
          completed,
          failed,
          currentAnnotationId: result.annotationId,
        });
      }
    }
  }

  return results;
}

/**
 * Sequential processing for annotations (no concurrency)
 */
export async function sequentialRefineCFO(
  annotations: Annotation[],
  capture: SignalCapture,
  options: BatchCFOOptions,
  progressCallback?: (progress: BatchCFOProgress) => void
): Promise<BatchCFOResult[]> {
  const results: BatchCFOResult[] = [];
  let completed = 0;
  let failed = 0;

  for (const annotation of annotations) {
    const result = await processSingleAnnotation(annotation, capture, options);
    results.push(result);
    
    if (result.success) {
      completed++;
    } else {
      failed++;
    }
    
    if (progressCallback) {
      progressCallback({
        total: annotations.length,
        completed,
        failed,
        currentAnnotationId: annotation.id,
      });
    }
  }

  return results;
}

/**
 * Filter annotations suitable for CFO refinement
 */
export function filterAnnotationsForCFO(annotations: Annotation[]): Annotation[] {
  return annotations.filter(annotation => {
    // Must have coarse CFO estimate
    if (!annotation.estimatedCFO) return false;
    
    // CFO must be significant (> 10 Hz)
    if (Math.abs(annotation.estimatedCFO) < 10) return false;
    
    // Must have reasonable sample count
    if (annotation.sampleCount < 100 || annotation.sampleCount > 100000) return false;
    
    return true;
  });
}

/**
 * Estimate batch processing time
 */
export function estimateBatchDuration(
  annotationCount: number,
  avgSamplesPerAnnotation: number
): number {
  // Rough estimate: 0.5s per 1000 samples
  const avgTimePerAnnotation = (avgSamplesPerAnnotation / 1000) * 0.5;
  return annotationCount * avgTimePerAnnotation;
}
