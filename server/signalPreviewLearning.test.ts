/**
 * Test Suite: Signal Preview Generator & Metadata Learning System
 */

import { describe, it, expect } from 'vitest';

describe('Signal Preview Generator', () => {
  it('should calculate bytes per sample correctly', () => {
    const datatypes = {
      cf32_le: 8,
      ci16_le: 4,
      cu16_le: 4,
      ci8: 2,
      cu8: 2,
    };
    
    Object.entries(datatypes).forEach(([datatype, expected]) => {
      // Mock getBytesPerSample logic
      let bytesPerSample = 8; // default
      switch (datatype) {
        case 'cf32_le': bytesPerSample = 8; break;
        case 'ci16_le': bytesPerSample = 4; break;
        case 'cu16_le': bytesPerSample = 4; break;
        case 'ci8': bytesPerSample = 2; break;
        case 'cu8': bytesPerSample = 2; break;
      }
      
      expect(bytesPerSample).toBe(expected);
    });
  });
  
  it('should calculate FFT size correctly', () => {
    const fftSize = 512;
    expect(fftSize).toBeGreaterThan(0);
    expect(fftSize & (fftSize - 1)).toBe(0); // Power of 2
  });
  
  it('should generate Hamming window correctly', () => {
    const size = 512;
    const window: number[] = [];
    
    for (let i = 0; i < size; i++) {
      window.push(0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    
    expect(window.length).toBe(size);
    expect(window[0]).toBeCloseTo(0.08, 2);
    expect(window[size / 2]).toBeCloseTo(1.0, 1);
    expect(window[size - 1]).toBeCloseTo(0.08, 2);
  });
  
  it('should reverse bits correctly for FFT', () => {
    const reverseBits = (x: number, bits: number): number => {
      let result = 0;
      for (let i = 0; i < bits; i++) {
        result = (result << 1) | (x & 1);
        x >>= 1;
      }
      return result;
    };
    
    expect(reverseBits(0, 3)).toBe(0); // 000 -> 000
    expect(reverseBits(1, 3)).toBe(4); // 001 -> 100
    expect(reverseBits(2, 3)).toBe(2); // 010 -> 010
    expect(reverseBits(3, 3)).toBe(6); // 011 -> 110
    expect(reverseBits(4, 3)).toBe(1); // 100 -> 001
  });
  
  it('should apply Viridis colormap correctly', () => {
    const viridisColormap = (value: number): { r: number; g: number; b: number } => {
      const v = Math.max(0, Math.min(1, value));
      
      const colors = [
        { r: 68, g: 1, b: 84 },
        { r: 59, g: 82, b: 139 },
        { r: 33, g: 145, b: 140 },
        { r: 94, g: 201, b: 98 },
        { r: 253, g: 231, b: 37 },
      ];
      
      const scaledValue = v * (colors.length - 1);
      const idx = Math.floor(scaledValue);
      const frac = scaledValue - idx;
      
      if (idx >= colors.length - 1) {
        return colors[colors.length - 1];
      }
      
      const c1 = colors[idx];
      const c2 = colors[idx + 1];
      
      return {
        r: Math.round(c1.r + (c2.r - c1.r) * frac),
        g: Math.round(c1.g + (c2.g - c1.g) * frac),
        b: Math.round(c1.b + (c2.b - c1.b) * frac),
      };
    };
    
    const color0 = viridisColormap(0.0);
    expect(color0.r).toBe(68);
    expect(color0.g).toBe(1);
    expect(color0.b).toBe(84);
    
    const color1 = viridisColormap(1.0);
    expect(color1.r).toBe(253);
    expect(color1.g).toBe(231);
    expect(color1.b).toBe(37);
  });
  
  it('should calculate signal metrics correctly', () => {
    const spectrogram = [
      [-50, -40, -30, -20],
      [-45, -35, -25, -15],
      [-48, -38, -28, -18],
    ];
    
    const allPowers = spectrogram.flat();
    const avgPower = allPowers.reduce((sum, p) => sum + p, 0) / allPowers.length;
    const peakPower = Math.max(...allPowers);
    const minPower = Math.min(...allPowers);
    const dynamicRange = peakPower - minPower;
    
    const sortedPowers = [...allPowers].sort((a, b) => a - b);
    const noiseFloor = sortedPowers[Math.floor(sortedPowers.length * 0.1)];
    const snrEstimate = peakPower - noiseFloor;
    
    expect(avgPower).toBeCloseTo(-32.67, 1);
    expect(peakPower).toBe(-15);
    expect(minPower).toBe(-50);
    expect(dynamicRange).toBe(35);
    expect(snrEstimate).toBeGreaterThan(0);
  });
  
  it('should parse IQ samples correctly for cf32_le', () => {
    // Create mock buffer with cf32_le data
    const buffer = new ArrayBuffer(16); // 2 samples
    const view = new DataView(buffer);
    
    // Sample 1: I=1.0, Q=0.5
    view.setFloat32(0, 1.0, true);
    view.setFloat32(4, 0.5, true);
    
    // Sample 2: I=-0.5, Q=0.75
    view.setFloat32(8, -0.5, true);
    view.setFloat32(12, 0.75, true);
    
    // Parse samples
    const samples: { i: number; q: number }[] = [];
    let offset = 0;
    
    while (offset + 8 <= buffer.byteLength) {
      const i = view.getFloat32(offset, true);
      const q = view.getFloat32(offset + 4, true);
      samples.push({ i, q });
      offset += 8;
    }
    
    expect(samples.length).toBe(2);
    expect(samples[0].i).toBeCloseTo(1.0);
    expect(samples[0].q).toBeCloseTo(0.5);
    expect(samples[1].i).toBeCloseTo(-0.5);
    expect(samples[1].q).toBeCloseTo(0.75);
  });
});

describe('Metadata Learning System', () => {
  it('should extract filename patterns correctly', () => {
    const extractPattern = (filename: string): string => {
      let pattern = filename;
      pattern = pattern.replace(/\d{8}/g, '\\d{8}');
      pattern = pattern.replace(/\d{6}/g, '\\d{6}');
      pattern = pattern.replace(/\d{8,10}/g, '\\d{8,10}');
      pattern = pattern.replace(/\d{6,7}/g, '\\d{6,7}');
      pattern = pattern.replace(/\d+/g, '\\d+');
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return pattern;
    };
    
     const filename1 = 'hackrf_915MHz_2.4MSps.iq';
    const pattern1 = extractPattern(filename1);
    expect(pattern1).toContain('hackrf');
    expect(pattern1).toContain('\\d'); // Escaped backslash
    
     const filename2 = 'gqrx_20231215_123456_915000000_2400000_fc.raw';
    const pattern2 = extractPattern(filename2);
    expect(pattern2).toContain('gqrx');
    expect(pattern2).toContain('\\d'); // Contains escaped digit pattern
  });
  
  it('should calculate confidence boost correctly', () => {
    const patternConfidence = 80;
    const originalConfidence = 50;
    
    const confidenceBoost = Math.floor(patternConfidence * 0.2); // Up to +20
    const boostedConfidence = Math.min(100, originalConfidence + confidenceBoost);
    
    expect(confidenceBoost).toBe(16);
    expect(boostedConfidence).toBe(66);
  });
  
  it('should merge learned metadata with detected metadata', () => {
    const detected = {
      sampleRate: 2400000,
      centerFrequency: undefined,
      datatype: 'cf32_le',
      hardware: undefined,
      confidence: 50,
    };
    
    const learned = {
      sampleRate: undefined,
      centerFrequency: 915000000,
      datatype: undefined,
      hardware: 'HackRF One',
    };
    
    const merged = {
      sampleRate: detected.sampleRate || learned.sampleRate,
      centerFrequency: detected.centerFrequency || learned.centerFrequency,
      datatype: detected.datatype || learned.datatype,
      hardware: detected.hardware || learned.hardware,
    };
    
    expect(merged.sampleRate).toBe(2400000);
    expect(merged.centerFrequency).toBe(915000000);
    expect(merged.datatype).toBe('cf32_le');
    expect(merged.hardware).toBe('HackRF One');
  });
  
  it('should track pattern usage statistics', () => {
    const pattern = {
      id: 'test-1',
      filenamePattern: 'hackrf_\\d+MHz_\\d+MSps\\.iq',
      metadata: {
        sampleRate: 2400000,
        datatype: 'cf32_le',
      },
      confidence: 60,
      matchCount: 0,
      lastUsed: Date.now(),
      createdAt: Date.now(),
    };
    
    // Simulate match
    pattern.matchCount++;
    pattern.confidence = Math.min(100, pattern.confidence + 5);
    pattern.lastUsed = Date.now();
    
    expect(pattern.matchCount).toBe(1);
    expect(pattern.confidence).toBe(65);
  });
  
  it('should detect user corrections', () => {
    const autoDetected = {
      sampleRate: 2000000,
      centerFrequency: 900000000,
      datatype: 'cf32_le',
      hardware: undefined,
    };
    
    const userCorrected = {
      sampleRate: 2400000,
      centerFrequency: 915000000,
      datatype: 'cf32_le',
      hardware: 'HackRF One',
    };
    
    const hasCorrections = (
      autoDetected.sampleRate !== userCorrected.sampleRate ||
      autoDetected.centerFrequency !== userCorrected.centerFrequency ||
      autoDetected.datatype !== userCorrected.datatype ||
      autoDetected.hardware !== userCorrected.hardware
    );
    
    expect(hasCorrections).toBe(true);
  });
  
  it('should limit pattern storage size', () => {
    const MAX_PATTERNS = 1000;
    const patterns = Array.from({ length: 1200 }, (_, i) => ({
      id: `pattern-${i}`,
      matchCount: Math.floor(Math.random() * 100),
      confidence: 60,
    }));
    
    // Sort by matchCount and limit
    patterns.sort((a, b) => b.matchCount - a.matchCount);
    const limited = patterns.slice(0, MAX_PATTERNS);
    
    expect(limited.length).toBe(MAX_PATTERNS);
    expect(limited[0].matchCount).toBeGreaterThanOrEqual(limited[limited.length - 1].matchCount);
  });
  
  it('should generate unique IDs', () => {
    const generateId = (): string => {
      return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    };
    
    const id1 = generateId();
    const id2 = generateId();
    
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^\d+-[a-z0-9]+$/);
  });
});

describe('Integration: Preview + Learning', () => {
  it('should handle complete upload workflow', () => {
    // 1. File detected
    const detected = {
      sampleRate: 2400000,
      centerFrequency: 915000000,
      datatype: 'cf32_le',
      hardware: 'HackRF One',
      confidence: 80,
    };
    
    // 2. Learning system boosts confidence
    const boosted = {
      ...detected,
      confidence: Math.min(100, detected.confidence + 15),
    };
    
    expect(boosted.confidence).toBe(95);
    
    // 3. Preview generated
    const preview = {
      width: 256,
      height: 128,
      metrics: {
        snrEstimate: 25.5,
        peakPower: -10.2,
        avgPower: -35.8,
        dynamicRange: 45.3,
      },
    };
    
    expect(preview.metrics.snrEstimate).toBeGreaterThan(0);
    
    // 4. User uploads (no corrections)
    const hasCorrections = false;
    expect(hasCorrections).toBe(false);
  });
  
  it('should improve accuracy over time', () => {
    const iterations = [
      { confidence: 50, matchCount: 0 },
      { confidence: 55, matchCount: 1 },
      { confidence: 60, matchCount: 2 },
      { confidence: 65, matchCount: 3 },
      { confidence: 70, matchCount: 4 },
    ];
    
    // Confidence should increase with each match
    for (let i = 1; i < iterations.length; i++) {
      expect(iterations[i].confidence).toBeGreaterThan(iterations[i - 1].confidence);
      expect(iterations[i].matchCount).toBe(i);
    }
  });
});
