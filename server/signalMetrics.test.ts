import { describe, it, expect } from 'vitest';
import { SignalMetricsExtractor } from '../client/src/lib/signalMetricsExtractor';

describe('SignalMetricsExtractor', () => {
  describe('extractMetrics', () => {
    it('should calculate SNR from PSD data', () => {
      // Create synthetic PSD with signal + noise
      const psd = new Float32Array(1024);
      
      // Noise floor at -80 dB
      for (let i = 0; i < 1024; i++) {
        psd[i] = -80 + (Math.random() - 0.5) * 2;
      }
      
      // Signal peak at -40 dB (40 dB SNR)
      for (let i = 400; i < 600; i++) {
        psd[i] = -40 + (Math.random() - 0.5) * 2;
      }
      
      const metrics = SignalMetricsExtractor.extractMetrics(psd, 1e6);
      
      // SNR should be approximately 40 dB
      expect(metrics.snr).toBeGreaterThan(35);
      expect(metrics.snr).toBeLessThan(45);
      
      // Peak power should be around -40 dB
      expect(metrics.peakPower).toBeGreaterThan(-42);
      expect(metrics.peakPower).toBeLessThan(-38);
      
      // Noise floor should be around -80 dB
      expect(metrics.noiseFloor).toBeGreaterThan(-82);
      expect(metrics.noiseFloor).toBeLessThan(-78);
    });
    
    it('should calculate bandwidth correctly', () => {
      const psd = new Float32Array(1024);
      
      // Noise floor at -80 dB
      psd.fill(-80);
      
      // Signal occupying 200 kHz (200 bins out of 1024 at 1 MHz sample rate)
      const signalStart = 412;
      const signalEnd = 612;
      for (let i = signalStart; i < signalEnd; i++) {
        psd[i] = -40;
      }
      
      const metrics = SignalMetricsExtractor.extractMetrics(psd, 1e6);
      
      // Bandwidth should be approximately 200 kHz
      const expectedBandwidth = ((signalEnd - signalStart) / 1024) * 1e6;
      expect(metrics.bandwidth).toBeGreaterThan(expectedBandwidth * 0.8);
      expect(metrics.bandwidth).toBeLessThan(expectedBandwidth * 1.2);
    });
    
    it('should calculate power metrics', () => {
      const psd = new Float32Array(1024);
      
      // Fill with varying power levels
      for (let i = 0; i < 1024; i++) {
        psd[i] = -60 + Math.sin(i / 100) * 20;
      }
      
      const metrics = SignalMetricsExtractor.extractMetrics(psd, 1e6);
      
      // Peak power should be around -40 dB
      expect(metrics.peakPower).toBeGreaterThan(-45);
      expect(metrics.peakPower).toBeLessThan(-35);
      
      // Average power should be around -60 dB
      expect(metrics.avgPower).toBeGreaterThan(-65);
      expect(metrics.avgPower).toBeLessThan(-55);
      
      // Dynamic range should be positive
      expect(metrics.dynamicRange).toBeGreaterThan(0);
    });
    
    it('should handle low SNR signals', () => {
      const psd = new Float32Array(1024);
      
      // Noise floor at -70 dB
      psd.fill(-70);
      
      // Weak signal at -65 dB (5 dB SNR)
      for (let i = 400; i < 600; i++) {
        psd[i] = -65;
      }
      
      const metrics = SignalMetricsExtractor.extractMetrics(psd, 1e6);
      
      // SNR should be approximately 5 dB
      expect(metrics.snr).toBeGreaterThan(3);
      expect(metrics.snr).toBeLessThan(7);
    });
    
    it('should calculate crest factor', () => {
      const psd = new Float32Array(1024);
      
      // Flat signal (low crest factor)
      psd.fill(-50);
      
      const metrics = SignalMetricsExtractor.extractMetrics(psd, 1e6);
      
      // Crest factor for flat signal in dB domain is peak - RMS
      // For flat signal, crest factor should be negative (RMS > peak in dB)
      expect(metrics.crestFactor).toBeLessThan(0);
      expect(metrics.crestFactor).toBeGreaterThan(-30);
    });
  });
  
  describe('calculateOccupiedBandwidth', () => {
    it('should calculate bandwidth using power threshold', () => {
      const psd = new Float32Array(1024);
      psd.fill(-80);
      
      // Signal from bin 300 to 700 at -40 dB
      for (let i = 300; i < 700; i++) {
        psd[i] = -40;
      }
      
      const sampleRate = 1e6;
      const threshold = -60; // 20 dB below peak
      
      const bandwidth = SignalMetricsExtractor['calculateOccupiedBandwidth'](
        Array.from(psd),
        sampleRate,
        threshold
      );
      
      // Expected bandwidth: 400 bins / 1024 bins * 1 MHz = 390.625 kHz
      expect(bandwidth).toBeGreaterThan(350e3);
      expect(bandwidth).toBeLessThan(450e3);
    });
  });
  
  describe('calculateSNRFromIQ', () => {
    it('should calculate SNR from IQ samples', () => {
      // Create synthetic IQ samples
      const iqSamples = new Float32Array(2048);
      
      // Noise region (samples 0-511): low power
      for (let i = 0; i < 512; i++) {
        iqSamples[i * 2] = (Math.random() - 0.5) * 0.1; // I
        iqSamples[i * 2 + 1] = (Math.random() - 0.5) * 0.1; // Q
      }
      
      // Signal region (samples 512-1023): high power
      for (let i = 512; i < 1024; i++) {
        iqSamples[i * 2] = Math.cos(i / 10) * 0.5; // I
        iqSamples[i * 2 + 1] = Math.sin(i / 10) * 0.5; // Q
      }
      
      const snr = SignalMetricsExtractor.calculateSNRFromIQ(
        iqSamples,
        512 * 2, // Signal start
        1024 * 2, // Signal end
        0, // Noise start
        512 * 2 // Noise end
      );
      
      // SNR should be positive and significant
      expect(snr).toBeGreaterThan(10);
      expect(snr).toBeLessThan(30);
    });
  });
  
  describe('calculatePSD', () => {
    it('should compute PSD from IQ samples', () => {
      // Create synthetic IQ samples with a tone
      const fftSize = 1024;
      const iqSamples = new Float32Array(fftSize * 2 * 4); // 4 FFTs
      
      const toneFreq = 0.1; // Normalized frequency
      for (let i = 0; i < iqSamples.length / 2; i++) {
        iqSamples[i * 2] = Math.cos(2 * Math.PI * toneFreq * i); // I
        iqSamples[i * 2 + 1] = Math.sin(2 * Math.PI * toneFreq * i); // Q
      }
      
      const psd = SignalMetricsExtractor.calculatePSD(iqSamples, fftSize, 'hamming');
      
      // PSD should have correct length
      expect(psd.length).toBe(fftSize);
      
      // PSD should contain valid dB values
      for (let i = 0; i < psd.length; i++) {
        expect(psd[i]).toBeGreaterThan(-200);
        expect(psd[i]).toBeLessThan(100);
      }
      
      // Peak should be significantly higher than average
      const maxPsd = Math.max(...Array.from(psd));
      const avgPsd = Array.from(psd).reduce((sum, val) => sum + val, 0) / psd.length;
      expect(maxPsd - avgPsd).toBeGreaterThan(10);
    });
    
    it('should apply window functions correctly', () => {
      const fftSize = 256;
      const iqSamples = new Float32Array(fftSize * 2);
      
      // Fill with constant signal
      iqSamples.fill(1.0);
      
      const psdHamming = SignalMetricsExtractor.calculatePSD(iqSamples, fftSize, 'hamming');
      const psdHann = SignalMetricsExtractor.calculatePSD(iqSamples, fftSize, 'hann');
      const psdBlackman = SignalMetricsExtractor.calculatePSD(iqSamples, fftSize, 'blackman');
      
      // All PSDs should have correct length
      expect(psdHamming.length).toBe(fftSize);
      expect(psdHann.length).toBe(fftSize);
      expect(psdBlackman.length).toBe(fftSize);
      
      // PSDs should be different due to different windows
      let hammingHannDiff = 0;
      for (let i = 0; i < fftSize; i++) {
        hammingHannDiff += Math.abs(psdHamming[i] - psdHann[i]);
      }
      expect(hammingHannDiff).toBeGreaterThan(0);
    });
  });
  
  describe('calculate99PercentBandwidth', () => {
    it('should calculate 99% power containment bandwidth', () => {
      const psd = new Float32Array(1024);
      psd.fill(-80);
      
      // Gaussian-like signal centered at bin 512
      for (let i = 0; i < 1024; i++) {
        const distance = Math.abs(i - 512);
        psd[i] = -40 - (distance * distance) / 1000;
      }
      
      const bandwidth = SignalMetricsExtractor.calculate99PercentBandwidth(
        Array.from(psd),
        1e6
      );
      
      // Bandwidth should be reasonable (not entire spectrum)
      expect(bandwidth).toBeGreaterThan(100e3);
      expect(bandwidth).toBeLessThan(800e3);
    });
  });
  
  describe('extractMetricsFromPSDPlot', () => {
    it('should extract metrics from frequency/power arrays', () => {
      const frequencies = Array.from({ length: 1024 }, (_, i) => i * 1000);
      const powerDb = Array.from({ length: 1024 }, () => -80);
      
      // Add signal
      for (let i = 400; i < 600; i++) {
        powerDb[i] = -40;
      }
      
      const metrics = SignalMetricsExtractor.extractMetricsFromPSDPlot(
        frequencies,
        powerDb,
        1e6
      );
      
      expect(metrics.snr).toBeGreaterThan(35);
      expect(metrics.peakPower).toBeGreaterThan(-42);
      expect(metrics.bandwidth).toBeGreaterThan(150e3);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle empty PSD data', () => {
      const psd = new Float32Array(0);
      
      // Empty PSD returns NaN/Infinity values, not an error
      const metrics = SignalMetricsExtractor.extractMetrics(psd, 1e6);
      expect(isNaN(metrics.snr) || !isFinite(metrics.snr)).toBe(true);
    });
    
    it('should handle single-value PSD', () => {
      const psd = new Float32Array([- 50]);
      
      const metrics = SignalMetricsExtractor.extractMetrics(psd, 1e6);
      
      expect(metrics.snr).toBe(0);
      expect(metrics.peakPower).toBe(-50);
      expect(metrics.avgPower).toBe(-50);
    });
    
    it('should handle very low sample rates', () => {
      const psd = new Float32Array(1024);
      psd.fill(-80);
      
      // Add narrow signal
      for (let i = 500; i < 520; i++) {
        psd[i] = -40;
      }
      
      const metrics = SignalMetricsExtractor.extractMetrics(psd, 1000); // 1 kHz
      
      expect(metrics.bandwidth).toBeGreaterThan(0);
      expect(metrics.bandwidth).toBeLessThan(100); // Narrow signal
    });
    
    it('should handle very high sample rates', () => {
      const psd = new Float32Array(1024);
      psd.fill(-80);
      
      // Signal occupying ~20% of spectrum
      for (let i = 400; i < 600; i++) {
        psd[i] = -40;
      }
      
      const metrics = SignalMetricsExtractor.extractMetrics(psd, 100e6); // 100 MHz
      
      // Bandwidth should be approximately 20 MHz (200 bins / 1024 * 100 MHz)
      expect(metrics.bandwidth).toBeGreaterThan(15e6);
      expect(metrics.bandwidth).toBeLessThan(25e6);
    });
  });
});
