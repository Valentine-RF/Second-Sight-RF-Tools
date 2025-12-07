import { describe, it, expect } from 'vitest';
import { refineCFOWithCostasLoop } from './snrCfoBridge';

/**
 * Tests for Costas Loop CFO Refinement
 */

describe('Costas Loop CFO Refinement', () => {
  // Generate test QPSK signal with known CFO
  function generateQPSKSignal(
    numSamples: number,
    sampleRate: number,
    cfoHz: number,
    snrDb: number = 20
  ): { iqReal: Float32Array; iqImag: Float32Array } {
    const iqReal = new Float32Array(numSamples);
    const iqImag = new Float32Array(numSamples);
    
    // QPSK symbols: [1+j, -1+j, -1-j, 1-j] / sqrt(2)
    const symbols = [
      { re: 1 / Math.sqrt(2), im: 1 / Math.sqrt(2) },
      { re: -1 / Math.sqrt(2), im: 1 / Math.sqrt(2) },
      { re: -1 / Math.sqrt(2), im: -1 / Math.sqrt(2) },
      { re: 1 / Math.sqrt(2), im: -1 / Math.sqrt(2) },
    ];
    
    const samplesPerSymbol = 8;
    const noiseStd = Math.pow(10, -snrDb / 20);
    
    for (let i = 0; i < numSamples; i++) {
      // Select symbol
      const symbolIdx = Math.floor(i / samplesPerSymbol) % 4;
      const symbol = symbols[symbolIdx];
      
      // Add carrier frequency offset
      const t = i / sampleRate;
      const phase = 2 * Math.PI * cfoHz * t;
      const carrierRe = Math.cos(phase);
      const carrierIm = Math.sin(phase);
      
      // Mix symbol with carrier
      const signalRe = symbol.re * carrierRe - symbol.im * carrierIm;
      const signalIm = symbol.re * carrierIm + symbol.im * carrierRe;
      
      // Add AWGN noise
      const noiseRe = (Math.random() - 0.5) * 2 * noiseStd;
      const noiseIm = (Math.random() - 0.5) * 2 * noiseStd;
      
      iqReal[i] = signalRe + noiseRe;
      iqImag[i] = signalIm + noiseIm;
    }
    
    return { iqReal, iqImag };
  }

  it('should refine CFO for QPSK signal with small offset', async () => {
    const sampleRate = 100000; // 100 kHz
    const trueCfoHz = 500; // 500 Hz offset
    const numSamples = 8192;
    
    const { iqReal, iqImag } = generateQPSKSignal(numSamples, sampleRate, trueCfoHz, 20);
    
    const result = await refineCFOWithCostasLoop(iqReal, iqImag, sampleRate, {
      coarseCfoHz: 0,
      modulationOrder: 4,
      loopBandwidth: 0.01,
    });
    
    expect(result.method).toBe('Costas Loop PLL');
    expect(result.modulation_order).toBe(4);
    expect(result.total_cfo_hz).toBeCloseTo(trueCfoHz, -1); // Within 10 Hz
    expect(result.lock_detected).toBe(true);
  }, 30000);

  it('should work with coarse CFO pre-correction', async () => {
    const sampleRate = 100000;
    const trueCfoHz = 1200;
    const coarseCfoHz = 1000; // Coarse estimate
    const fineCfoHz = trueCfoHz - coarseCfoHz; // Expected fine correction
    const numSamples = 8192;
    
    const { iqReal, iqImag } = generateQPSKSignal(numSamples, sampleRate, trueCfoHz, 20);
    
    const result = await refineCFOWithCostasLoop(iqReal, iqImag, sampleRate, {
      coarseCfoHz,
      modulationOrder: 4,
      loopBandwidth: 0.01,
    });
    
    expect(result.coarse_cfo_hz).toBe(coarseCfoHz);
    expect(result.fine_cfo_hz).toBeCloseTo(fineCfoHz, -1);
    expect(result.total_cfo_hz).toBeCloseTo(trueCfoHz, -1);
  }, 30000);

  it('should support BPSK modulation (order=2)', async () => {
    const sampleRate = 100000;
    const trueCfoHz = 300;
    const numSamples = 4096;
    
    // Generate BPSK signal (simplified as alternating +1/-1)
    const iqReal = new Float32Array(numSamples);
    const iqImag = new Float32Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
      const symbol = Math.floor(i / 8) % 2 === 0 ? 1 : -1;
      const t = i / sampleRate;
      const phase = 2 * Math.PI * trueCfoHz * t;
      
      iqReal[i] = symbol * Math.cos(phase);
      iqImag[i] = symbol * Math.sin(phase);
    }
    
    const result = await refineCFOWithCostasLoop(iqReal, iqImag, sampleRate, {
      coarseCfoHz: 0,
      modulationOrder: 2,
      loopBandwidth: 0.01,
    });
    
    expect(result.modulation_order).toBe(2);
    expect(result.total_cfo_hz).toBeCloseTo(trueCfoHz, -2); // Within 100 Hz for BPSK
  }, 30000);

  it('should support 8PSK modulation (order=8)', async () => {
    const sampleRate = 100000;
    const trueCfoHz = 400;
    const numSamples = 8192;
    
    // Generate 8PSK signal
    const iqReal = new Float32Array(numSamples);
    const iqImag = new Float32Array(numSamples);
    
    for (let i = 0; i < numSamples; i++) {
      const symbolIdx = Math.floor(i / 8) % 8;
      const symbolPhase = (symbolIdx * 2 * Math.PI) / 8;
      
      const t = i / sampleRate;
      const carrierPhase = 2 * Math.PI * trueCfoHz * t;
      const totalPhase = symbolPhase + carrierPhase;
      
      iqReal[i] = Math.cos(totalPhase);
      iqImag[i] = Math.sin(totalPhase);
    }
    
    const result = await refineCFOWithCostasLoop(iqReal, iqImag, sampleRate, {
      coarseCfoHz: 0,
      modulationOrder: 8,
      loopBandwidth: 0.01,
    });
    
    expect(result.modulation_order).toBe(8);
    expect(result.total_cfo_hz).toBeCloseTo(trueCfoHz, -2); // Within 100 Hz for 8PSK
  }, 30000);

  it('should adjust loop bandwidth parameter', async () => {
    const sampleRate = 100000;
    const trueCfoHz = 600;
    const numSamples = 8192;
    
    const { iqReal, iqImag } = generateQPSKSignal(numSamples, sampleRate, trueCfoHz, 20);
    
    // Test with narrow bandwidth (slower convergence, better noise rejection)
    const narrowResult = await refineCFOWithCostasLoop(iqReal, iqImag, sampleRate, {
      coarseCfoHz: 0,
      modulationOrder: 4,
      loopBandwidth: 0.005,
    });
    
    // Test with wide bandwidth (faster convergence, more noise)
    const wideResult = await refineCFOWithCostasLoop(iqReal, iqImag, sampleRate, {
      coarseCfoHz: 0,
      modulationOrder: 4,
      loopBandwidth: 0.02,
    });
    
    expect(narrowResult.loop_bandwidth).toBe(0.005);
    expect(wideResult.loop_bandwidth).toBe(0.02);
    
    // Wide bandwidth should converge faster
    expect(wideResult.convergence_time_samples).toBeLessThan(narrowResult.convergence_time_samples);
  }, 60000);

  it('should detect lock status', async () => {
    const sampleRate = 100000;
    const trueCfoHz = 450;
    const numSamples = 8192;
    
    const { iqReal, iqImag } = generateQPSKSignal(numSamples, sampleRate, trueCfoHz, 25);
    
    const result = await refineCFOWithCostasLoop(iqReal, iqImag, sampleRate, {
      coarseCfoHz: 0,
      modulationOrder: 4,
      loopBandwidth: 0.01,
    });
    
    expect(result.lock_detected).toBe(true);
    if (result.lock_time_samples !== null) {
      expect(result.lock_time_samples).toBeGreaterThanOrEqual(0);
      expect(result.lock_time_samples).toBeLessThan(numSamples);
    }
    expect(result.phase_error_variance).toBeLessThan(0.5);
  }, 30000);

  it('should report convergence time', async () => {
    const sampleRate = 100000;
    const trueCfoHz = 350;
    const numSamples = 8192;
    
    const { iqReal, iqImag } = generateQPSKSignal(numSamples, sampleRate, trueCfoHz, 20);
    
    const result = await refineCFOWithCostasLoop(iqReal, iqImag, sampleRate, {
      coarseCfoHz: 0,
      modulationOrder: 4,
      loopBandwidth: 0.01,
    });
    
    expect(result.convergence_time_samples).toBeGreaterThan(0);
    expect(result.convergence_time_samples).toBeLessThan(numSamples);
    
    // Convergence time should be reasonable (< 50% of signal)
    expect(result.convergence_time_samples).toBeLessThan(numSamples * 0.5);
  }, 30000);

  it('should handle zero CFO gracefully', async () => {
    const sampleRate = 100000;
    const trueCfoHz = 0; // No offset
    const numSamples = 4096;
    
    const { iqReal, iqImag } = generateQPSKSignal(numSamples, sampleRate, trueCfoHz, 20);
    
    const result = await refineCFOWithCostasLoop(iqReal, iqImag, sampleRate, {
      coarseCfoHz: 0,
      modulationOrder: 4,
      loopBandwidth: 0.01,
    });
    
    expect(result.total_cfo_hz).toBeCloseTo(0, 0);
    expect(result.phase_error_variance).toBeLessThan(0.2);
  }, 30000);

  it('should normalize CFO to sample rate', async () => {
    const sampleRate = 100000;
    const trueCfoHz = 1000;
    const numSamples = 8192;
    
    const { iqReal, iqImag } = generateQPSKSignal(numSamples, sampleRate, trueCfoHz, 20);
    
    const result = await refineCFOWithCostasLoop(iqReal, iqImag, sampleRate, {
      coarseCfoHz: 0,
      modulationOrder: 4,
      loopBandwidth: 0.01,
    });
    
    const expectedNormalized = trueCfoHz / sampleRate;
    expect(result.cfo_normalized).toBeCloseTo(expectedNormalized, 3);
  }, 30000);
});

describe('Costas Loop Performance', () => {
  it('should handle large sample counts efficiently', async () => {
    const sampleRate = 100000;
    const trueCfoHz = 500;
    const numSamples = 32768; // 32k samples
    
    const iqReal = new Float32Array(numSamples);
    const iqImag = new Float32Array(numSamples);
    
    // Simple QPSK signal
    for (let i = 0; i < numSamples; i++) {
      const symbol = Math.floor(i / 8) % 4;
      const symbolPhase = (symbol * Math.PI) / 2;
      const t = i / sampleRate;
      const carrierPhase = 2 * Math.PI * trueCfoHz * t;
      const totalPhase = symbolPhase + carrierPhase;
      
      iqReal[i] = Math.cos(totalPhase);
      iqImag[i] = Math.sin(totalPhase);
    }
    
    const startTime = Date.now();
    const result = await refineCFOWithCostasLoop(iqReal, iqImag, sampleRate, {
      coarseCfoHz: 0,
      modulationOrder: 4,
      loopBandwidth: 0.01,
    });
    const elapsedTime = Date.now() - startTime;
    
    expect(result.total_cfo_hz).toBeCloseTo(trueCfoHz, -1);
    expect(elapsedTime).toBeLessThan(5000); // Should complete in < 5 seconds
  }, 60000);
});
