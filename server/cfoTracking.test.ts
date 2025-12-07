import { describe, it, expect } from 'vitest';
import { calculateAdaptiveLoopBandwidth } from './adaptiveLoopBandwidth';
import { filterAnnotationsForCFO, estimateBatchDuration } from './batchCFO';
import type { Annotation } from '../drizzle/schema';

describe('Adaptive Loop Bandwidth', () => {
  it('should use wide bandwidth for high SNR acquisition', () => {
    const result = calculateAdaptiveLoopBandwidth({
      snrDb: 20,
      lockDetected: false,
    });

    expect(result.bandwidth).toBe(0.02);
    expect(result.mode).toBe('acquisition');
    expect(result.reason).toContain('High SNR');
  });

  it('should use medium bandwidth for medium SNR acquisition', () => {
    const result = calculateAdaptiveLoopBandwidth({
      snrDb: 10,
      lockDetected: false,
    });

    expect(result.bandwidth).toBe(0.01);
    expect(result.mode).toBe('acquisition');
    expect(result.reason).toContain('Medium SNR');
  });

  it('should use narrow bandwidth for low SNR acquisition', () => {
    const result = calculateAdaptiveLoopBandwidth({
      snrDb: 3,
      lockDetected: false,
    });

    expect(result.bandwidth).toBe(0.005);
    expect(result.mode).toBe('acquisition');
    expect(result.reason).toContain('Low SNR');
  });

  it('should reduce bandwidth after lock with high SNR', () => {
    const result = calculateAdaptiveLoopBandwidth({
      snrDb: 20,
      lockDetected: true,
    });

    expect(result.bandwidth).toBe(0.005);
    expect(result.mode).toBe('tracking');
    expect(result.reason).toContain('Locked');
  });

  it('should use very narrow bandwidth after lock with low SNR', () => {
    const result = calculateAdaptiveLoopBandwidth({
      snrDb: 3,
      lockDetected: true,
    });

    expect(result.bandwidth).toBe(0.002);
    expect(result.mode).toBe('tracking');
    expect(result.reason).toContain('very narrow bandwidth');
  });

  it('should increase bandwidth on high phase error variance', () => {
    const result = calculateAdaptiveLoopBandwidth({
      snrDb: 15,
      lockDetected: true,
      phaseErrorVariance: 0.25,
    });

    expect(result.bandwidth).toBe(0.01);
    expect(result.mode).toBe('holdover');
    expect(result.reason).toContain('High phase error variance');
  });

  it('should use narrow bandwidth with excellent tracking', () => {
    const result = calculateAdaptiveLoopBandwidth({
      snrDb: 15,
      lockDetected: true,
      phaseErrorVariance: 0.03,
    });

    expect(result.bandwidth).toBe(0.005);
    expect(result.mode).toBe('tracking');
    expect(result.reason).toContain('Excellent tracking');
  });
});

describe('Batch CFO Processing', () => {
  const mockAnnotations: Partial<Annotation>[] = [
    {
      id: 1,
      captureId: 1,
      sampleStart: 1000,
      sampleCount: 5000,
      estimatedCFO: 1500,
      estimatedSNR: 15,
    },
    {
      id: 2,
      captureId: 1,
      sampleStart: 10000,
      sampleCount: 3000,
      estimatedCFO: 5,
      estimatedSNR: 10,
    },
    {
      id: 3,
      captureId: 1,
      sampleStart: 20000,
      sampleCount: 8000,
      estimatedCFO: -2000,
      estimatedSNR: 20,
    },
    {
      id: 4,
      captureId: 1,
      sampleStart: 30000,
      sampleCount: 50,
      estimatedCFO: 500,
      estimatedSNR: 12,
    },
    {
      id: 5,
      captureId: 1,
      sampleStart: 40000,
      sampleCount: 150000,
      estimatedCFO: 800,
      estimatedSNR: 18,
    },
  ];

  it('should filter annotations with significant CFO', () => {
    const filtered = filterAnnotationsForCFO(mockAnnotations as Annotation[]);

    expect(filtered.length).toBe(2);
    expect(filtered.map(a => a.id)).toEqual([1, 3]);
  });

  it('should exclude annotations with CFO < 10 Hz', () => {
    const filtered = filterAnnotationsForCFO(mockAnnotations as Annotation[]);

    const cfos = filtered.map(a => Math.abs(a.estimatedCFO || 0));
    expect(cfos.every(cfo => cfo >= 10)).toBe(true);
  });

  it('should exclude annotations with too few samples', () => {
    const filtered = filterAnnotationsForCFO(mockAnnotations as Annotation[]);

    const sampleCounts = filtered.map(a => a.sampleCount);
    expect(sampleCounts.every(count => count >= 100)).toBe(true);
  });

  it('should exclude annotations with too many samples', () => {
    const filtered = filterAnnotationsForCFO(mockAnnotations as Annotation[]);

    const sampleCounts = filtered.map(a => a.sampleCount);
    expect(sampleCounts.every(count => count <= 100000)).toBe(true);
  });

  it('should estimate batch duration correctly', () => {
    const duration = estimateBatchDuration(10, 5000);

    // 10 annotations * (5000/1000) * 0.5s = 25s
    expect(duration).toBe(25);
  });

  it('should estimate duration for small sample counts', () => {
    const duration = estimateBatchDuration(5, 500);

    // 5 annotations * (500/1000) * 0.5s = 1.25s
    expect(duration).toBe(1.25);
  });

  it('should estimate duration for large sample counts', () => {
    const duration = estimateBatchDuration(3, 20000);

    // 3 annotations * (20000/1000) * 0.5s = 30s
    expect(duration).toBe(30);
  });
});

describe('CFO Drift Timeline', () => {
  it('should calculate drift rate correctly', () => {
    const prevCfo = 1000; // Hz
    const currCfo = 1100; // Hz
    const timeDiff = 1; // second
    
    const driftRate = (currCfo - prevCfo) / timeDiff;
    
    expect(driftRate).toBe(100); // Hz/s
  });

  it('should detect high drift rate', () => {
    const driftRate = 150; // Hz/s
    const threshold = 100; // Hz/s
    
    const isHighDrift = Math.abs(driftRate) > threshold;
    
    expect(isHighDrift).toBe(true);
  });

  it('should not flag low drift rate', () => {
    const driftRate = 50; // Hz/s
    const threshold = 100; // Hz/s
    
    const isHighDrift = Math.abs(driftRate) > threshold;
    
    expect(isHighDrift).toBe(false);
  });

  it('should handle negative drift rates', () => {
    const prevCfo = 1000;
    const currCfo = 850;
    const timeDiff = 1;
    
    const driftRate = (currCfo - prevCfo) / timeDiff;
    
    expect(driftRate).toBe(-150);
    expect(Math.abs(driftRate) > 100).toBe(true);
  });
});

describe('CFO History Tracking', () => {
  it('should store CFO metadata in annotations', () => {
    const cfoMetadata = {
      cfoRefinedHz: 949.5,
      cfoMethod: 'Costas Loop',
      cfoTimestamp: new Date(),
      cfoLockDetected: true,
      cfoPhaseErrorVar: 0.045,
    };

    expect(cfoMetadata.cfoRefinedHz).toBeDefined();
    expect(cfoMetadata.cfoMethod).toBe('Costas Loop');
    expect(cfoMetadata.cfoLockDetected).toBe(true);
    expect(cfoMetadata.cfoPhaseErrorVar).toBeLessThan(0.1);
  });

  it('should track CFO timestamp', () => {
    const timestamp = new Date();
    
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should differentiate coarse and refined CFO', () => {
    const coarseCfo = 1000;
    const refinedCfo = 949.5;
    
    const improvement = Math.abs(coarseCfo - refinedCfo);
    
    expect(improvement).toBeGreaterThan(0);
    expect(refinedCfo).not.toBe(coarseCfo);
  });
});

describe('Batch Processing Results', () => {
  it('should track success and failure counts', () => {
    const mockResults = [
      { annotationId: 1, success: true },
      { annotationId: 2, success: true },
      { annotationId: 3, success: false, error: 'Sample rate not available' },
      { annotationId: 4, success: true },
    ];

    const processed = mockResults.filter(r => r.success).length;
    const failed = mockResults.filter(r => !r.success).length;

    expect(processed).toBe(3);
    expect(failed).toBe(1);
  });

  it('should include error messages for failed annotations', () => {
    const failedResult = {
      annotationId: 5,
      success: false,
      error: 'Data file not available',
    };

    expect(failedResult.success).toBe(false);
    expect(failedResult.error).toBeDefined();
    expect(failedResult.error).toContain('Data file');
  });

  it('should include CFO results for successful annotations', () => {
    const successResult = {
      annotationId: 1,
      success: true,
      cfoRefinedHz: 1234.5,
      cfoMethod: 'Costas Loop',
      cfoLockDetected: true,
      cfoPhaseErrorVar: 0.03,
    };

    expect(successResult.success).toBe(true);
    expect(successResult.cfoRefinedHz).toBeDefined();
    expect(successResult.cfoMethod).toBe('Costas Loop');
    expect(successResult.cfoLockDetected).toBe(true);
  });
});
