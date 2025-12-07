import { describe, it, expect } from 'vitest';
import { runSNRCFOEstimation } from './snrCfoBridge';

describe('SNR and CFO Estimation', () => {
  it('should estimate SNR for QPSK signal', async () => {
    // Generate synthetic QPSK signal with known SNR
    const numSamples = 1024;
    const snrDb = 10; // 10 dB SNR
    const signalPower = 1.0;
    const noisePower = signalPower / Math.pow(10, snrDb / 10);
    
    const iqReal = new Float32Array(numSamples);
    const iqImag = new Float32Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
      // QPSK symbols: {1+j, 1-j, -1+j, -1-j} / sqrt(2)
      const symbol = Math.floor(Math.random() * 4);
      const re = (symbol < 2 ? 1 : -1) / Math.sqrt(2);
      const im = (symbol % 2 === 0 ? 1 : -1) / Math.sqrt(2);
      
      // Add AWGN noise
      const noiseRe = Math.sqrt(noisePower / 2) * (Math.random() - 0.5) * 2;
      const noiseIm = Math.sqrt(noisePower / 2) * (Math.random() - 0.5) * 2;
      
      iqReal[i] = re + noiseRe;
      iqImag[i] = im + noiseIm;
    }
    
    const result = await runSNRCFOEstimation(iqReal, iqImag, 1e6, {
      modulationType: 'QPSK',
      estimateCfo: false
    });
    
    expect(result.snr).toBeDefined();
    expect(result.snr.snr_db).toBeGreaterThan(0);
    expect(result.snr.method).toBe('M2M4');
  }, 10000);

  it('should estimate CFO for frequency-shifted signal', async () => {
    // Generate signal with known frequency offset
    const numSamples = 1024;
    const sampleRate = 1e6;
    const cfoHz = 1000; // 1 kHz offset
    
    const iqReal = new Float32Array(numSamples);
    const iqImag = new Float32Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const phase = 2 * Math.PI * cfoHz * t;
      iqReal[i] = Math.cos(phase);
      iqImag[i] = Math.sin(phase);
    }
    
    const result = await runSNRCFOEstimation(iqReal, iqImag, sampleRate, {
      modulationType: 'QPSK',
      estimateCfo: true
    });
    
    expect(result.cfo).toBeDefined();
    expect(result.cfo?.cfo_hz).toBeDefined();
    expect(result.cfo?.method).toBe('Autocorrelation + PSD');
  }, 10000);

  it('should handle zero-power signal gracefully', async () => {
    const numSamples = 1024;
    const iqReal = new Float32Array(numSamples).fill(0);
    const iqImag = new Float32Array(numSamples).fill(0);
    
    const result = await runSNRCFOEstimation(iqReal, iqImag, 1e6, {
      modulationType: 'QPSK'
    });
    
    expect(result.snr).toBeDefined();
    expect(result.snr.snr_db).toBeNull(); // -Infinity is converted to null for JSON compatibility
  }, 10000);
});
