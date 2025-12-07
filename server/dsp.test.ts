import { describe, it, expect } from 'vitest';
import {
  parseIQData,
  magnitude,
  power,
  fft,
  computePSD,
  computeSCF,
  classifyModulation,
  type Complex,
} from './dsp';

describe('DSP Library', () => {
  describe('parseIQData', () => {
    it('should parse cf32_le format correctly', () => {
      const buffer = Buffer.alloc(16);
      buffer.writeFloatLE(0.5, 0);
      buffer.writeFloatLE(0.3, 4);
      buffer.writeFloatLE(-0.2, 8);
      buffer.writeFloatLE(0.7, 12);
      
      const samples = parseIQData(buffer, 'cf32_le', 2);
      expect(samples).toHaveLength(2);
      expect(samples[0].re).toBeCloseTo(0.5);
      expect(samples[0].im).toBeCloseTo(0.3);
      expect(samples[1].re).toBeCloseTo(-0.2);
      expect(samples[1].im).toBeCloseTo(0.7);
    });

    it('should parse ci16_le format correctly', () => {
      const buffer = Buffer.alloc(8);
      buffer.writeInt16LE(16384, 0);  // 0.5 * 32768
      buffer.writeInt16LE(9830, 2);   // 0.3 * 32768
      buffer.writeInt16LE(-6554, 4);  // -0.2 * 32768
      buffer.writeInt16LE(22938, 6);  // 0.7 * 32768
      
      const samples = parseIQData(buffer, 'ci16_le', 2);
      expect(samples).toHaveLength(2);
      expect(samples[0].re).toBeCloseTo(0.5, 1);
      expect(samples[0].im).toBeCloseTo(0.3, 1);
    });

    it('should throw error for unsupported datatype', () => {
      const buffer = Buffer.alloc(8);
      expect(() => parseIQData(buffer, 'invalid', 1)).toThrow('Unsupported datatype');
    });
  });

  describe('magnitude and power', () => {
    it('should compute magnitude correctly', () => {
      const c: Complex = { re: 3, im: 4 };
      expect(magnitude(c)).toBe(5);
    });

    it('should compute power correctly', () => {
      const c: Complex = { re: 3, im: 4 };
      expect(power(c)).toBe(25);
    });
  });

  describe('FFT', () => {
    it('should compute FFT for power-of-2 size', () => {
      const samples: Complex[] = [
        { re: 1, im: 0 },
        { re: 0, im: 0 },
        { re: 0, im: 0 },
        { re: 0, im: 0 },
      ];
      
      const result = fft(samples);
      expect(result).toHaveLength(4);
      // DC component should be 1
      expect(result[0].re).toBeCloseTo(1);
    });

    it('should throw error for non-power-of-2 size', () => {
      const samples: Complex[] = [
        { re: 1, im: 0 },
        { re: 0, im: 0 },
        { re: 0, im: 0 },
      ];
      
      expect(() => fft(samples)).toThrow('FFT size must be power of 2');
    });
  });

  describe('computePSD', () => {
    it('should compute PSD with sufficient samples', () => {
      // Generate simple sine wave
      const samples: Complex[] = [];
      for (let i = 0; i < 2048; i++) {
        const phase = 2 * Math.PI * 0.1 * i;
        samples.push({
          re: Math.cos(phase),
          im: Math.sin(phase),
        });
      }
      
      const psd = computePSD(samples, 1024);
      expect(psd).toHaveLength(1024);
      // PSD values should be in dB
      expect(psd.every(v => v < 100 && v > -100)).toBe(true);
    });
  });

  describe('computeSCF', () => {
    it('should compute spectral correlation function', () => {
      // Generate QPSK-like signal
      const samples: Complex[] = [];
      for (let i = 0; i < 512; i++) {
        const symbol = Math.floor(i / 4) % 4;
        const phase = symbol * Math.PI / 2;
        samples.push({
          re: Math.cos(phase),
          im: Math.sin(phase),
        });
      }
      
      const result = computeSCF(samples, 16, 32);
      expect(result.alpha).toHaveLength(16);
      expect(result.freq).toHaveLength(32);
      expect(result.scf).toHaveLength(16);
      expect(result.scf[0]).toHaveLength(32);
      expect(result.cyclicProfile).toHaveLength(16);
    });
  });

  describe('classifyModulation', () => {
    it('should classify QPSK-like signal', () => {
      // Generate QPSK signal
      const samples: Complex[] = [];
      for (let i = 0; i < 1024; i++) {
        const symbol = Math.floor(i / 4) % 4;
        const phase = symbol * Math.PI / 2;
        samples.push({
          re: Math.cos(phase) + (Math.random() - 0.5) * 0.1,
          im: Math.sin(phase) + (Math.random() - 0.5) * 0.1,
        });
      }
      
      const results = classifyModulation(samples);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('modulation');
      expect(results[0]).toHaveProperty('confidence');
      expect(results[0]).toHaveProperty('features');
      
      // QPSK should have high confidence
      const qpskResult = results.find(r => r.modulation === 'QPSK');
      expect(qpskResult).toBeDefined();
      expect(qpskResult!.confidence).toBeGreaterThan(30);
    });

    it('should return normalized confidences', () => {
      const samples: Complex[] = [];
      for (let i = 0; i < 512; i++) {
        samples.push({
          re: Math.random() - 0.5,
          im: Math.random() - 0.5,
        });
      }
      
      const results = classifyModulation(samples);
      const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
      expect(totalConfidence).toBeCloseTo(100, 0);
    });
  });
});
