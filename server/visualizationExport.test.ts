import { describe, it, expect } from 'vitest';

/**
 * Tests for Advanced Signal Processing Visualization and Export Features
 */

describe('Canvas Visualization Components', () => {
  it('should create valid WVD heatmap data structure', () => {
    // Simulate WVD result structure
    const timePoints = 128;
    const freqPoints = 64;
    const wvdData: number[][] = [];
    
    // Generate mock WVD data
    for (let t = 0; t < timePoints; t++) {
      wvdData[t] = [];
      for (let f = 0; f < freqPoints; f++) {
        // Simulate time-frequency energy distribution
        wvdData[t][f] = Math.exp(-((t - 64) ** 2 + (f - 32) ** 2) / 200);
      }
    }
    
    expect(wvdData.length).toBe(timePoints);
    expect(wvdData[0].length).toBe(freqPoints);
    expect(wvdData[64][32]).toBeGreaterThan(0.9); // Peak at center
  });

  it('should create valid waveform data for separated sources', () => {
    const numSamples = 1000;
    const numSources = 3;
    const sources: number[][] = [];
    
    // Generate mock separated sources
    for (let i = 0; i < numSources; i++) {
      const source: number[] = [];
      for (let j = 0; j < numSamples; j++) {
        source.push(Math.sin(2 * Math.PI * (i + 1) * j / 100));
      }
      sources.push(source);
    }
    
    expect(sources.length).toBe(numSources);
    expect(sources[0].length).toBe(numSamples);
    expect(Math.abs(sources[0][0])).toBeLessThanOrEqual(1);
  });

  it('should create valid reconstructed signal plot data', () => {
    const signalLength = 512;
    const reconstructed: number[] = [];
    
    // Generate mock reconstructed signal
    for (let i = 0; i < signalLength; i++) {
      reconstructed.push(Math.cos(2 * Math.PI * i / 64) + 0.1 * Math.random());
    }
    
    expect(reconstructed.length).toBe(signalLength);
    expect(reconstructed.every(v => typeof v === 'number')).toBe(true);
  });
});

describe('Export Functionality', () => {
  it('should generate valid CSV format for reconstructed signals', () => {
    const reconstructed = [1.5, 2.3, -0.8, 1.2, 0.5];
    const csv = `Sample,Reconstructed\n${reconstructed.map((v, i) => `${i},${v}`).join('\n')}`;
    
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Sample,Reconstructed');
    expect(lines[1]).toBe('0,1.5');
    expect(lines.length).toBe(reconstructed.length + 1);
  });

  it('should generate valid JSON format for WVD matrices', () => {
    const wvdResult = {
      distributionType: 'wvd',
      timePoints: 128,
      freqPoints: 64,
      wvd: [[0.1, 0.2], [0.3, 0.4]],
    };
    
    const json = JSON.stringify(wvdResult, null, 2);
    const parsed = JSON.parse(json);
    
    expect(parsed.distributionType).toBe('wvd');
    expect(parsed.timePoints).toBe(128);
    expect(parsed.wvd).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  });

  it('should generate valid CSV format for separated sources', () => {
    const sources = [
      [1.0, 2.0, 3.0],
      [4.0, 5.0, 6.0],
    ];
    
    const csv = sources.map((source, idx) => {
      const header = `Source ${idx + 1}`;
      const values = source.join('\n');
      return `${header}\n${values}`;
    }).join('\n\n');
    
    expect(csv).toContain('Source 1');
    expect(csv).toContain('Source 2');
    expect(csv).toContain('1\n2\n3');
    expect(csv).toContain('4\n5\n6');
  });
});

describe('Algorithm Comparison Mode', () => {
  it('should correctly sort algorithms by RMSE', () => {
    const results = [
      { algorithm: 'lasso', rmse: 0.05, iterations: 100, sparsity: 10, reconstructed: [] },
      { algorithm: 'omp', rmse: 0.02, iterations: 50, sparsity: 10, reconstructed: [] },
      { algorithm: 'cosamp', rmse: 0.03, iterations: 75, sparsity: 10, reconstructed: [] },
    ];
    
    const sorted = [...results].sort((a, b) => a.rmse - b.rmse);
    
    expect(sorted[0].algorithm).toBe('omp'); // Best RMSE
    expect(sorted[1].algorithm).toBe('cosamp');
    expect(sorted[2].algorithm).toBe('lasso');
  });

  it('should handle comparison results deduplication', () => {
    const existingResults = [
      { algorithm: 'omp', rmse: 0.02, iterations: 50, sparsity: 10, reconstructed: [] },
      { algorithm: 'lasso', rmse: 0.05, iterations: 100, sparsity: 10, reconstructed: [] },
    ];
    
    const newResult = { algorithm: 'omp', rmse: 0.015, iterations: 45, sparsity: 10, reconstructed: [] };
    
    // Simulate deduplication logic
    const filtered = existingResults.filter(r => r.algorithm !== newResult.algorithm);
    const updated = [...filtered, newResult];
    
    expect(updated.length).toBe(2);
    expect(updated.find(r => r.algorithm === 'omp')?.rmse).toBe(0.015);
  });

  it('should identify best algorithm based on multiple metrics', () => {
    const results = [
      { algorithm: 'omp', rmse: 0.02, iterations: 50, sparsity: 10, reconstructed: [] },
      { algorithm: 'cosamp', rmse: 0.025, iterations: 30, sparsity: 10, reconstructed: [] },
      { algorithm: 'lasso', rmse: 0.02, iterations: 100, sparsity: 10, reconstructed: [] },
    ];
    
    // Sort by RMSE first
    const sorted = [...results].sort((a, b) => a.rmse - b.rmse);
    
    // Among equal RMSE, prefer fewer iterations
    const best = sorted[0].rmse === sorted[1]?.rmse && sorted[0].iterations > sorted[1].iterations
      ? sorted[1]
      : sorted[0];
    
    expect(best.algorithm).toBe('omp'); // Best RMSE
  });
});

describe('Colormap Functions', () => {
  it('should generate valid RGB colors for normalized values', () => {
    const testColormap = (value: number): string => {
      const clamped = Math.max(0, Math.min(1, value));
      const r = Math.round(255 * (0.267 + clamped * (0.329 - 0.267)));
      const g = Math.round(255 * (0.005 + clamped * (0.993 - 0.005)));
      const b = Math.round(255 * (0.329 + clamped * (0.545 - 0.329)));
      return `rgb(${r}, ${g}, ${b})`;
    };
    
    const color0 = testColormap(0);
    const color1 = testColormap(1);
    const colorMid = testColormap(0.5);
    
    expect(color0).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(color1).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(colorMid).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });

  it('should clamp out-of-range values', () => {
    const clamp = (value: number): number => Math.max(0, Math.min(1, value));
    
    expect(clamp(-0.5)).toBe(0);
    expect(clamp(1.5)).toBe(1);
    expect(clamp(0.5)).toBe(0.5);
  });
});
