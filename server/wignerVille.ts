/**
 * Wigner-Ville Distribution and Time-Frequency Analysis
 * Quadratic time-frequency representations with cross-term mitigation
 */

export interface WVDResult {
  tfr: Float32Array; // Time-frequency representation (time x frequency)
  timeAxis: Float32Array;
  freqAxis: Float32Array;
  width: number;
  height: number;
}

/**
 * Wigner-Ville Distribution (WVD)
 * Provides optimal time-frequency concentration but suffers from cross-terms
 */
export function wignerVilleDistribution(
  signal: Float32Array,
  sampleRate: number
): WVDResult {
  const N = signal.length;
  const Nfft = nextPowerOf2(N);
  
  const tfr = new Float32Array(N * Nfft);
  const timeAxis = new Float32Array(N);
  const freqAxis = new Float32Array(Nfft);
  
  // Generate axes
  for (let i = 0; i < N; i++) {
    timeAxis[i] = i / sampleRate;
  }
  for (let i = 0; i < Nfft; i++) {
    freqAxis[i] = (i * sampleRate) / Nfft;
  }
  
  // Compute WVD for each time instant
  for (let t = 0; t < N; t++) {
    const instantCorr = new Float32Array(Nfft * 2); // Complex: [real, imag]
    
    // Compute instantaneous autocorrelation
    for (let tau = -Math.floor(Nfft / 2); tau < Math.floor(Nfft / 2); tau++) {
      const tPlusTau = t + tau;
      const tMinusTau = t - tau;
      
      if (tPlusTau >= 0 && tPlusTau < N && tMinusTau >= 0 && tMinusTau < N) {
        const idx = (tau + Math.floor(Nfft / 2)) * 2;
        instantCorr[idx] = signal[tPlusTau] * signal[tMinusTau]; // Real part
        instantCorr[idx + 1] = 0; // Imaginary part
      }
    }
    
    // FFT of instantaneous autocorrelation
    const spectrum = fft(instantCorr, Nfft);
    
    // Store magnitude in TFR
    for (let f = 0; f < Nfft; f++) {
      const real = spectrum[f * 2];
      const imag = spectrum[f * 2 + 1];
      tfr[t * Nfft + f] = Math.sqrt(real * real + imag * imag);
    }
  }
  
  return {
    tfr,
    timeAxis,
    freqAxis,
    width: N,
    height: Nfft,
  };
}

/**
 * Smoothed Pseudo Wigner-Ville Distribution (SPWVD)
 * Reduces cross-terms using time and frequency smoothing windows
 */
export function smoothedPseudoWVD(
  signal: Float32Array,
  sampleRate: number,
  timeWindowLength: number = 31,
  freqWindowLength: number = 31
): WVDResult {
  const N = signal.length;
  const Nfft = nextPowerOf2(N);
  
  const tfr = new Float32Array(N * Nfft);
  const timeAxis = new Float32Array(N);
  const freqAxis = new Float32Array(Nfft);
  
  // Generate axes
  for (let i = 0; i < N; i++) {
    timeAxis[i] = i / sampleRate;
  }
  for (let i = 0; i < Nfft; i++) {
    freqAxis[i] = (i * sampleRate) / Nfft;
  }
  
  // Create smoothing windows
  const timeWindow = hammingWindow(timeWindowLength);
  const freqWindow = hammingWindow(freqWindowLength);
  
  // Compute SPWVD
  for (let t = 0; t < N; t++) {
    const instantCorr = new Float32Array(Nfft * 2);
    
    // Compute smoothed instantaneous autocorrelation
    for (let tau = -Math.floor(freqWindowLength / 2); tau < Math.floor(freqWindowLength / 2); tau++) {
      let smoothedVal = 0;
      
      // Time smoothing
      for (let m = -Math.floor(timeWindowLength / 2); m < Math.floor(timeWindowLength / 2); m++) {
        const tPlusTauPlusM = t + tau + m;
        const tMinusTauPlusM = t - tau + m;
        
        if (tPlusTauPlusM >= 0 && tPlusTauPlusM < N && 
            tMinusTauPlusM >= 0 && tMinusTauPlusM < N) {
          const windowIdx = m + Math.floor(timeWindowLength / 2);
          smoothedVal += timeWindow[windowIdx] * signal[tPlusTauPlusM] * signal[tMinusTauPlusM];
        }
      }
      
      const idx = (tau + Math.floor(Nfft / 2)) * 2;
      const freqWindowIdx = tau + Math.floor(freqWindowLength / 2);
      if (freqWindowIdx >= 0 && freqWindowIdx < freqWindowLength) {
        instantCorr[idx] = freqWindow[freqWindowIdx] * smoothedVal;
      }
    }
    
    // FFT
    const spectrum = fft(instantCorr, Nfft);
    
    // Store magnitude
    for (let f = 0; f < Nfft; f++) {
      const real = spectrum[f * 2];
      const imag = spectrum[f * 2 + 1];
      tfr[t * Nfft + f] = Math.sqrt(real * real + imag * imag);
    }
  }
  
  return {
    tfr,
    timeAxis,
    freqAxis,
    width: N,
    height: Nfft,
  };
}

/**
 * Choi-Williams Distribution
 * Uses exponential kernel for cross-term suppression
 */
export function choiWilliamsDistribution(
  signal: Float32Array,
  sampleRate: number,
  sigma: number = 1.0
): WVDResult {
  const N = signal.length;
  const Nfft = nextPowerOf2(N);
  
  const tfr = new Float32Array(N * Nfft);
  const timeAxis = new Float32Array(N);
  const freqAxis = new Float32Array(Nfft);
  
  // Generate axes
  for (let i = 0; i < N; i++) {
    timeAxis[i] = i / sampleRate;
  }
  for (let i = 0; i < Nfft; i++) {
    freqAxis[i] = (i * sampleRate) / Nfft;
  }
  
  // Compute CWD
  for (let t = 0; t < N; t++) {
    const instantCorr = new Float32Array(Nfft * 2);
    
    for (let tau = -Math.floor(Nfft / 2); tau < Math.floor(Nfft / 2); tau++) {
      const tPlusTau = t + tau;
      const tMinusTau = t - tau;
      
      if (tPlusTau >= 0 && tPlusTau < N && tMinusTau >= 0 && tMinusTau < N) {
        // Choi-Williams kernel: exp(-4*pi^2*tau^2*t^2/sigma)
        const kernel = Math.exp(-4 * Math.PI * Math.PI * tau * tau * t * t / sigma);
        
        const idx = (tau + Math.floor(Nfft / 2)) * 2;
        instantCorr[idx] = kernel * signal[tPlusTau] * signal[tMinusTau];
        instantCorr[idx + 1] = 0;
      }
    }
    
    // FFT
    const spectrum = fft(instantCorr, Nfft);
    
    // Store magnitude
    for (let f = 0; f < Nfft; f++) {
      const real = spectrum[f * 2];
      const imag = spectrum[f * 2 + 1];
      tfr[t * Nfft + f] = Math.sqrt(real * real + imag * imag);
    }
  }
  
  return {
    tfr,
    timeAxis,
    freqAxis,
    width: N,
    height: Nfft,
  };
}

/**
 * Hamming window function
 */
function hammingWindow(length: number): Float32Array {
  const window = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (length - 1));
  }
  return window;
}

/**
 * Simple FFT implementation (Cooley-Tukey)
 * Input: complex array [real0, imag0, real1, imag1, ...]
 * Output: complex array in same format
 */
function fft(input: Float32Array, N: number): Float32Array {
  if (N === 1) {
    return new Float32Array([input[0], input[1]]);
  }
  
  // Bit-reversal permutation
  const output = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const j = bitReverse(i, Math.log2(N));
    output[j * 2] = input[i * 2];
    output[j * 2 + 1] = input[i * 2 + 1];
  }
  
  // Cooley-Tukey FFT
  for (let s = 1; s <= Math.log2(N); s++) {
    const m = Math.pow(2, s);
    const wm = Math.exp(-2 * Math.PI / m);
    
    for (let k = 0; k < N; k += m) {
      let w = 1;
      
      for (let j = 0; j < m / 2; j++) {
        const tReal = Math.cos(-2 * Math.PI * j / m) * output[(k + j + m / 2) * 2] -
                      Math.sin(-2 * Math.PI * j / m) * output[(k + j + m / 2) * 2 + 1];
        const tImag = Math.sin(-2 * Math.PI * j / m) * output[(k + j + m / 2) * 2] +
                      Math.cos(-2 * Math.PI * j / m) * output[(k + j + m / 2) * 2 + 1];
        
        const uReal = output[(k + j) * 2];
        const uImag = output[(k + j) * 2 + 1];
        
        output[(k + j) * 2] = uReal + tReal;
        output[(k + j) * 2 + 1] = uImag + tImag;
        output[(k + j + m / 2) * 2] = uReal - tReal;
        output[(k + j + m / 2) * 2 + 1] = uImag - tImag;
      }
    }
  }
  
  return output;
}

function bitReverse(n: number, bits: number): number {
  let reversed = 0;
  for (let i = 0; i < bits; i++) {
    reversed = (reversed << 1) | (n & 1);
    n >>= 1;
  }
  return reversed;
}

function nextPowerOf2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}
