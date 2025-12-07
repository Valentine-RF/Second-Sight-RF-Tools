import { describe, it, expect } from 'vitest';
import { orthogonalMatchingPursuit, compressiveSamplingMatchingPursuit, lasso, fista } from './compressiveSensing';
import { wignerVilleDistribution, smoothedPseudoWVD, choiWilliamsDistribution } from './wignerVille';
import { fastICA, nmf } from './blindSourceSeparation';

describe('Compressive Sensing Algorithms', () => {
  it('should reconstruct sparse signal using OMP', () => {
    // Create sparse signal (only 3 non-zero coefficients)
    const signalLength = 64;
    const signal = new Float32Array(signalLength);
    signal[10] = 1.0;
    signal[25] = 0.8;
    signal[45] = -0.6;
    
    // Create random measurement matrix
    const numMeasurements = 32;
    const measurementMatrix = new Float32Array(numMeasurements * signalLength);
    for (let i = 0; i < measurementMatrix.length; i++) {
      measurementMatrix[i] = (Math.random() - 0.5) * 2 / Math.sqrt(numMeasurements);
    }
    
    // Compute measurements
    const measurements = new Float32Array(numMeasurements);
    for (let i = 0; i < numMeasurements; i++) {
      let sum = 0;
      for (let j = 0; j < signalLength; j++) {
        sum += measurementMatrix[i * signalLength + j] * signal[j];
      }
      measurements[i] = sum;
    }
    
    // Reconstruct using OMP
    const result = orthogonalMatchingPursuit(measurements, measurementMatrix, 3);
    
    expect(result.reconstructed).toBeInstanceOf(Float32Array);
    expect(result.reconstructed.length).toBe(signalLength);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.sparsity).toBeLessThanOrEqual(3);
  });

  it('should reconstruct sparse signal using CoSaMP', () => {
    const signalLength = 64;
    const signal = new Float32Array(signalLength);
    signal[10] = 1.0;
    signal[25] = 0.8;
    
    const numMeasurements = 32;
    const measurementMatrix = new Float32Array(numMeasurements * signalLength);
    for (let i = 0; i < measurementMatrix.length; i++) {
      measurementMatrix[i] = (Math.random() - 0.5) * 2 / Math.sqrt(numMeasurements);
    }
    
    const measurements = new Float32Array(numMeasurements);
    for (let i = 0; i < numMeasurements; i++) {
      let sum = 0;
      for (let j = 0; j < signalLength; j++) {
        sum += measurementMatrix[i * signalLength + j] * signal[j];
      }
      measurements[i] = sum;
    }
    
    const result = compressiveSamplingMatchingPursuit(measurements, measurementMatrix, 3);
    
    expect(result.reconstructed).toBeInstanceOf(Float32Array);
    expect(result.reconstructed.length).toBe(signalLength);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('should reconstruct signal using LASSO', () => {
    const signalLength = 32;
    const signal = new Float32Array(signalLength);
    signal[5] = 1.0;
    signal[15] = 0.7;
    
    const numMeasurements = 16;
    const measurementMatrix = new Float32Array(numMeasurements * signalLength);
    for (let i = 0; i < measurementMatrix.length; i++) {
      measurementMatrix[i] = (Math.random() - 0.5) * 2 / Math.sqrt(numMeasurements);
    }
    
    const measurements = new Float32Array(numMeasurements);
    for (let i = 0; i < numMeasurements; i++) {
      let sum = 0;
      for (let j = 0; j < signalLength; j++) {
        sum += measurementMatrix[i * signalLength + j] * signal[j];
      }
      measurements[i] = sum;
    }
    
    const result = lasso(measurements, measurementMatrix, 0.1);
    
    expect(result.reconstructed).toBeInstanceOf(Float32Array);
    expect(result.reconstructed.length).toBe(signalLength);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('should reconstruct signal using FISTA', () => {
    const signalLength = 32;
    const signal = new Float32Array(signalLength);
    signal[5] = 1.0;
    signal[15] = 0.7;
    
    const numMeasurements = 16;
    const measurementMatrix = new Float32Array(numMeasurements * signalLength);
    for (let i = 0; i < measurementMatrix.length; i++) {
      measurementMatrix[i] = (Math.random() - 0.5) * 2 / Math.sqrt(numMeasurements);
    }
    
    const measurements = new Float32Array(numMeasurements);
    for (let i = 0; i < numMeasurements; i++) {
      let sum = 0;
      for (let j = 0; j < signalLength; j++) {
        sum += measurementMatrix[i * signalLength + j] * signal[j];
      }
      measurements[i] = sum;
    }
    
    const result = fista(measurements, measurementMatrix, 0.1);
    
    expect(result.reconstructed).toBeInstanceOf(Float32Array);
    expect(result.reconstructed.length).toBe(signalLength);
    expect(result.iterations).toBeGreaterThan(0);
  });
});

describe('Wigner-Ville Distribution', () => {
  it('should compute WVD for complex signal', () => {
    // Create simple complex signal (interleaved real/imag)
    const N = 64;
    const signal = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      signal[i * 2] = Math.cos(2 * Math.PI * 0.1 * i); // Real
      signal[i * 2 + 1] = Math.sin(2 * Math.PI * 0.1 * i); // Imag
    }
    
    const result = wignerVilleDistribution(signal, 1000);
    
    expect(result.tfr).toBeInstanceOf(Float32Array);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.timeAxis).toBeInstanceOf(Float32Array);
    expect(result.freqAxis).toBeInstanceOf(Float32Array);
  });

  it('should compute Smoothed Pseudo-WVD', () => {
    const N = 64;
    const signal = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      signal[i * 2] = Math.cos(2 * Math.PI * 0.1 * i);
      signal[i * 2 + 1] = Math.sin(2 * Math.PI * 0.1 * i);
    }
    
    const result = smoothedPseudoWVD(signal, 1000, 16);
    
    expect(result.tfr).toBeInstanceOf(Float32Array);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should compute Choi-Williams Distribution', () => {
    const N = 64;
    const signal = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      signal[i * 2] = Math.cos(2 * Math.PI * 0.1 * i);
      signal[i * 2 + 1] = Math.sin(2 * Math.PI * 0.1 * i);
    }
    
    const result = choiWilliamsDistribution(signal, 1000, 1.0);
    
    expect(result.tfr).toBeInstanceOf(Float32Array);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});

describe('Blind Source Separation', () => {
  it('should separate mixed signals using FastICA', () => {
    // Create two mixed signals
    const signalLength = 100;
    const signal1 = new Float32Array(signalLength);
    const signal2 = new Float32Array(signalLength);
    
    for (let i = 0; i < signalLength; i++) {
      signal1[i] = Math.sin(2 * Math.PI * 0.05 * i);
      signal2[i] = Math.cos(2 * Math.PI * 0.1 * i);
    }
    
    // Mix signals
    const mixed1 = new Float32Array(signalLength);
    const mixed2 = new Float32Array(signalLength);
    for (let i = 0; i < signalLength; i++) {
      mixed1[i] = 0.7 * signal1[i] + 0.3 * signal2[i];
      mixed2[i] = 0.4 * signal1[i] + 0.6 * signal2[i];
    }
    
    const result = fastICA([mixed1, mixed2], 2, 100);
    
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toBeInstanceOf(Float32Array);
    expect(result.sources[0].length).toBe(signalLength);
    expect(result.mixingMatrix).toBeInstanceOf(Float32Array);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('should factorize matrix using NMF', () => {
    // Create non-negative matrix
    const rows = 10;
    const cols = 20;
    const data = new Float32Array(rows * cols);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random();
    }
    
    const numComponents = 3;
    const result = nmf(data, rows, cols, numComponents, 100);
    
    expect(result.W).toBeInstanceOf(Float32Array);
    expect(result.W.length).toBe(rows * numComponents);
    expect(result.H).toBeInstanceOf(Float32Array);
    expect(result.H.length).toBe(numComponents * cols);
    expect(result.iterations).toBe(100);
  });
});
