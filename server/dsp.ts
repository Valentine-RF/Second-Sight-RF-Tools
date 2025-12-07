/**
 * Digital Signal Processing Library
 * 
 * JavaScript/TypeScript implementation of DSP algorithms for RF signal analysis
 */

/**
 * Complex number representation
 */
export interface Complex {
  re: number;
  im: number;
}

/**
 * Parse IQ data from binary buffer based on datatype
 */
export function parseIQData(buffer: Buffer, datatype: string, sampleCount: number): Complex[] {
  const samples: Complex[] = [];
  
  switch (datatype.toLowerCase()) {
    case 'cf32_le': {
      // Complex float32, little-endian (8 bytes per sample: 4 bytes I, 4 bytes Q)
      for (let i = 0; i < sampleCount && i * 8 < buffer.length; i++) {
        const re = buffer.readFloatLE(i * 8);
        const im = buffer.readFloatLE(i * 8 + 4);
        samples.push({ re, im });
      }
      break;
    }
    
    case 'ci16_le': {
      // Complex int16, little-endian (4 bytes per sample: 2 bytes I, 2 bytes Q)
      for (let i = 0; i < sampleCount && i * 4 < buffer.length; i++) {
        const re = buffer.readInt16LE(i * 4) / 32768.0;  // Normalize to [-1, 1]
        const im = buffer.readInt16LE(i * 4 + 2) / 32768.0;
        samples.push({ re, im });
      }
      break;
    }
    
    case 'ci8':
    case 'cu8': {
      // Complex int8 or uint8 (2 bytes per sample: 1 byte I, 1 byte Q)
      const isUnsigned = datatype === 'cu8';
      for (let i = 0; i < sampleCount && i * 2 < buffer.length; i++) {
        let re, im;
        if (isUnsigned) {
          re = (buffer.readUInt8(i * 2) - 127.5) / 127.5;  // Normalize to [-1, 1]
          im = (buffer.readUInt8(i * 2 + 1) - 127.5) / 127.5;
        } else {
          re = buffer.readInt8(i * 2) / 128.0;
          im = buffer.readInt8(i * 2 + 1) / 128.0;
        }
        samples.push({ re, im });
      }
      break;
    }
    
    default:
      throw new Error(`Unsupported datatype: ${datatype}`);
  }
  
  return samples;
}

/**
 * Compute magnitude of complex number
 */
export function magnitude(c: Complex): number {
  return Math.sqrt(c.re * c.re + c.im * c.im);
}

/**
 * Compute power (magnitude squared)
 */
export function power(c: Complex): number {
  return c.re * c.re + c.im * c.im;
}

/**
 * Simple FFT implementation (Cooley-Tukey algorithm)
 */
export function fft(samples: Complex[]): Complex[] {
  const N = samples.length;
  
  // Base case
  if (N <= 1) return samples;
  
  // Ensure power of 2
  if (N & (N - 1)) {
    throw new Error('FFT size must be power of 2');
  }
  
  // Divide
  const even: Complex[] = [];
  const odd: Complex[] = [];
  for (let i = 0; i < N; i++) {
    if (i % 2 === 0) even.push(samples[i]);
    else odd.push(samples[i]);
  }
  
  // Conquer
  const fftEven = fft(even);
  const fftOdd = fft(odd);
  
  // Combine
  const result: Complex[] = new Array(N);
  for (let k = 0; k < N / 2; k++) {
    const angle = -2 * Math.PI * k / N;
    const twiddle: Complex = {
      re: Math.cos(angle),
      im: Math.sin(angle)
    };
    
    const t: Complex = {
      re: twiddle.re * fftOdd[k].re - twiddle.im * fftOdd[k].im,
      im: twiddle.re * fftOdd[k].im + twiddle.im * fftOdd[k].re
    };
    
    result[k] = {
      re: fftEven[k].re + t.re,
      im: fftEven[k].im + t.im
    };
    
    result[k + N / 2] = {
      re: fftEven[k].re - t.re,
      im: fftEven[k].im - t.im
    };
  }
  
  return result;
}

/**
 * Compute Power Spectral Density using Welch's method
 */
export function computePSD(samples: Complex[], fftSize: number = 1024): number[] {
  const psd: number[] = new Array(fftSize).fill(0);
  const numSegments = Math.floor(samples.length / (fftSize / 2)) - 1;
  
  if (numSegments < 1) {
    // Not enough samples, do single FFT
    const segment = samples.slice(0, fftSize);
    while (segment.length < fftSize) {
      segment.push({ re: 0, im: 0 });  // Zero-pad
    }
    const fftResult = fft(segment);
    return fftResult.map(c => 10 * Math.log10(power(c) + 1e-10));  // Convert to dB
  }
  
  // Welch's method with 50% overlap
  for (let i = 0; i < numSegments; i++) {
    const start = i * (fftSize / 2);
    const segment = samples.slice(start, start + fftSize);
    
    // Apply Hann window
    const windowed = segment.map((c, idx) => {
      const window = 0.5 * (1 - Math.cos(2 * Math.PI * idx / fftSize));
      return { re: c.re * window, im: c.im * window };
    });
    
    const fftResult = fft(windowed);
    for (let j = 0; j < fftSize; j++) {
      psd[j] += power(fftResult[j]);
    }
  }
  
  // Average and convert to dB
  return psd.map(p => 10 * Math.log10((p / numSegments) + 1e-10));
}

/**
 * Simplified Cyclostationary Analysis (FAM algorithm approximation)
 * Returns spectral correlation function
 */
export function computeSCF(samples: Complex[], alphaRes: number = 32, fRes: number = 64): {
  alpha: number[];
  freq: number[];
  scf: number[][];
  cyclicProfile: number[];
} {
  const N = Math.min(samples.length, 2048);  // Limit for performance
  const actualSamples = samples.slice(0, N);
  
  // Compute cyclic autocorrelation for different cycle frequencies (alpha)
  const alphaRange = Array.from({ length: alphaRes }, (_, i) => (i / alphaRes) - 0.5);
  const freqRange = Array.from({ length: fRes }, (_, i) => (i / fRes) - 0.5);
  
  const scf: number[][] = [];
  const cyclicProfile: number[] = new Array(alphaRes).fill(0);
  
  for (let alphaIdx = 0; alphaIdx < alphaRes; alphaIdx++) {
    const alpha = alphaRange[alphaIdx];
    const scfRow: number[] = [];
    
    for (let fIdx = 0; fIdx < fRes; fIdx++) {
      const freq = freqRange[fIdx];
      
      // Simplified SCF computation (correlation at different frequency shifts)
      let scfValue = 0;
      const maxLag = Math.min(64, N / 4);
      
      for (let lag = 0; lag < maxLag; lag++) {
        for (let n = 0; n < N - lag; n++) {
          const phase1 = 2 * Math.PI * (freq + alpha / 2) * n;
          const phase2 = 2 * Math.PI * (freq - alpha / 2) * (n + lag);
          
          const term1 = {
            re: actualSamples[n].re * Math.cos(phase1) - actualSamples[n].im * Math.sin(phase1),
            im: actualSamples[n].re * Math.sin(phase1) + actualSamples[n].im * Math.cos(phase1)
          };
          
          const term2 = {
            re: actualSamples[n + lag].re * Math.cos(phase2) + actualSamples[n + lag].im * Math.sin(phase2),
            im: -actualSamples[n + lag].re * Math.sin(phase2) + actualSamples[n + lag].im * Math.cos(phase2)
          };
          
          scfValue += term1.re * term2.re + term1.im * term2.im;
        }
      }
      
      scfValue = Math.abs(scfValue) / (N * maxLag);
      scfRow.push(scfValue);
      cyclicProfile[alphaIdx] = Math.max(cyclicProfile[alphaIdx], scfValue);
    }
    
    scf.push(scfRow);
  }
  
  return {
    alpha: alphaRange,
    freq: freqRange,
    scf,
    cyclicProfile
  };
}

/**
 * Estimate modulation type based on signal characteristics
 */
export function classifyModulation(samples: Complex[]): {
  modulation: string;
  confidence: number;
  features: Record<string, number>;
}[] {
  const N = Math.min(samples.length, 4096);
  const actualSamples = samples.slice(0, N);
  
  // Extract features
  const magnitudes = actualSamples.map(magnitude);
  const avgMag = magnitudes.reduce((a, b) => a + b, 0) / N;
  const varMag = magnitudes.reduce((a, b) => a + Math.pow(b - avgMag, 2), 0) / N;
  const stdMag = Math.sqrt(varMag);
  
  // Compute moments
  const m2 = actualSamples.reduce((sum, c) => sum + power(c), 0) / N;
  const m4 = actualSamples.reduce((sum, c) => sum + Math.pow(power(c), 2), 0) / N;
  const kurtosis = m4 / (m2 * m2);
  
  // Phase analysis
  const phases = actualSamples.map(c => Math.atan2(c.im, c.re));
  const phaseDiffs = phases.slice(1).map((p, i) => {
    let diff = p - phases[i];
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  });
  const avgPhaseDiff = phaseDiffs.reduce((a, b) => a + Math.abs(b), 0) / phaseDiffs.length;
  
  // Classification logic based on features
  const results: { modulation: string; confidence: number; features: Record<string, number> }[] = [];
  
  // QPSK: Low magnitude variance, phase concentrated around π/4, 3π/4, -π/4, -3π/4
  const qpskScore = (kurtosis > 1.5 && kurtosis < 2.5) ? 0.8 : 0.3;
  results.push({
    modulation: 'QPSK',
    confidence: qpskScore * 100,
    features: { kurtosis, stdMag, avgPhaseDiff }
  });
  
  // 8PSK: Similar to QPSK but 8 phase states
  const psk8Score = (kurtosis > 1.3 && kurtosis < 2.0 && avgPhaseDiff < 0.8) ? 0.7 : 0.2;
  results.push({
    modulation: '8PSK',
    confidence: psk8Score * 100,
    features: { kurtosis, stdMag, avgPhaseDiff }
  });
  
  // 16-QAM: Higher magnitude variance, rectangular constellation
  const qam16Score = (kurtosis < 2.0 && stdMag > 0.2) ? 0.6 : 0.15;
  results.push({
    modulation: '16-QAM',
    confidence: qam16Score * 100,
    features: { kurtosis, stdMag, avgPhaseDiff }
  });
  
  // FSK: Large phase jumps
  const fskScore = (avgPhaseDiff > 1.0) ? 0.5 : 0.1;
  results.push({
    modulation: 'FSK',
    confidence: fskScore * 100,
    features: { kurtosis, stdMag, avgPhaseDiff }
  });
  
  // Normalize confidences to sum to ~100%
  const totalConf = results.reduce((sum, r) => sum + r.confidence, 0);
  results.forEach(r => r.confidence = (r.confidence / totalConf) * 100);
  
  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);
  
  return results;
}
