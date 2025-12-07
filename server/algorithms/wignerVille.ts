/**
 * Time-Frequency Analysis: Wigner-Ville Distribution and Cohen's Class
 * 
 * Implements advanced time-frequency representations for RF signal analysis:
 * - Wigner-Ville Distribution (WVD)
 * - Pseudo Wigner-Ville Distribution (PWVD)
 * - Smoothed Pseudo Wigner-Ville Distribution (SPWVD)
 * - Choi-Williams Distribution (CWD)
 * - Born-Jordan Distribution (BJD)
 * - Reassigned Spectrogram
 */

/**
 * Wigner-Ville Distribution (WVD)
 * WVD(t,f) = ∫ x(t+τ/2) x*(t-τ/2) e^(-j2πfτ) dτ
 */
export function wignerVilleDistribution(
  signal: Float32Array | { i: Float32Array; q: Float32Array },
  options: {
    nfft?: number;
    smoothing?: boolean;
    windowSize?: number;
  } = {}
): {
  wvd: Float32Array[];
  timeAxis: Float32Array;
  freqAxis: Float32Array;
} {
  const { nfft = 256, smoothing = false, windowSize = 32 } = options;
  
  // Convert to complex if needed
  let real: Float32Array, imag: Float32Array;
  if (signal instanceof Float32Array) {
    real = signal;
    imag = new Float32Array(signal.length);
  } else {
    real = signal.i;
    imag = signal.q;
  }
  
  const N = real.length;
  const numTimePoints = Math.floor(N / 4); // Reduce time resolution for efficiency
  const timeStep = Math.floor(N / numTimePoints);
  
  const wvd: Float32Array[] = [];
  const timeAxis = new Float32Array(numTimePoints);
  const freqAxis = new Float32Array(nfft);
  
  // Frequency axis (normalized)
  for (let k = 0; k < nfft; k++) {
    freqAxis[k] = (k - nfft / 2) / nfft;
  }
  
  // Compute WVD for each time point
  for (let tIdx = 0; tIdx < numTimePoints; tIdx++) {
    const t = tIdx * timeStep + Math.floor(nfft / 2);
    if (t >= nfft / 2 && t < N - nfft / 2) {
      timeAxis[tIdx] = t;
      
      // Instantaneous autocorrelation
      const autocorr = new Float32Array(nfft * 2); // Complex: [re, im, re, im, ...]
      
      for (let tau = -Math.floor(nfft / 2); tau < Math.floor(nfft / 2); tau++) {
        const idx1 = t + Math.floor(tau / 2);
        const idx2 = t - Math.floor(tau / 2);
        
        if (idx1 >= 0 && idx1 < N && idx2 >= 0 && idx2 < N) {
          // x(t+τ/2) * conj(x(t-τ/2))
          const re1 = real[idx1], im1 = imag[idx1];
          const re2 = real[idx2], im2 = imag[idx2];
          
          const tauIdx = tau + Math.floor(nfft / 2);
          autocorr[tauIdx * 2] = re1 * re2 + im1 * im2; // Real part
          autocorr[tauIdx * 2 + 1] = im1 * re2 - re1 * im2; // Imag part
        }
      }
      
      // Apply smoothing window if requested
      if (smoothing && windowSize > 0) {
        applyHammingWindow(autocorr, windowSize);
      }
      
      // FFT to get WVD
      const spectrum = fft(autocorr, nfft);
      
      // Extract magnitude and shift zero-frequency to center
      const wvdSlice = new Float32Array(nfft);
      for (let k = 0; k < nfft; k++) {
        const shiftedK = (k + Math.floor(nfft / 2)) % nfft;
        const re = spectrum[shiftedK * 2];
        const im = spectrum[shiftedK * 2 + 1];
        wvdSlice[k] = Math.sqrt(re * re + im * im);
      }
      
      wvd.push(wvdSlice);
    }
  }
  
  return { wvd, timeAxis, freqAxis };
}

/**
 * Pseudo Wigner-Ville Distribution (PWVD)
 * Smoothed version with reduced cross-terms
 */
export function pseudoWignerVille(
  signal: Float32Array | { i: Float32Array; q: Float32Array },
  windowSize: number = 32,
  nfft: number = 256
): {
  pwvd: Float32Array[];
  timeAxis: Float32Array;
  freqAxis: Float32Array;
} {
  const { wvd, timeAxis, freqAxis } = wignerVilleDistribution(signal, {
    nfft,
    smoothing: true,
    windowSize,
  });
  
  return { pwvd: wvd, timeAxis, freqAxis };
}

/**
 * Smoothed Pseudo Wigner-Ville Distribution (SPWVD)
 * Additional time-domain smoothing for better cross-term suppression
 */
export function smoothedPseudoWignerVille(
  signal: Float32Array | { i: Float32Array; q: Float32Array },
  timeWindowSize: number = 16,
  freqWindowSize: number = 32,
  nfft: number = 256
): {
  spwvd: Float32Array[];
  timeAxis: Float32Array;
  freqAxis: Float32Array;
} {
  // First compute PWVD
  const { pwvd, timeAxis, freqAxis } = pseudoWignerVille(signal, freqWindowSize, nfft);
  
  // Apply time-domain smoothing
  const smoothed: Float32Array[] = [];
  const halfWindow = Math.floor(timeWindowSize / 2);
  
  for (let t = 0; t < pwvd.length; t++) {
    const smoothedSlice = new Float32Array(nfft);
    
    for (let f = 0; f < nfft; f++) {
      let sum = 0;
      let count = 0;
      
      for (let dt = -halfWindow; dt <= halfWindow; dt++) {
        const tIdx = t + dt;
        if (tIdx >= 0 && tIdx < pwvd.length) {
          sum += pwvd[tIdx][f];
          count++;
        }
      }
      
      smoothedSlice[f] = sum / count;
    }
    
    smoothed.push(smoothedSlice);
  }
  
  return { spwvd: smoothed, timeAxis, freqAxis };
}

/**
 * Choi-Williams Distribution (CWD)
 * Exponential kernel for cross-term reduction
 */
export function choiWilliamsDistribution(
  signal: Float32Array | { i: Float32Array; q: Float32Array },
  sigma: number = 1.0,
  nfft: number = 256
): {
  cwd: Float32Array[];
  timeAxis: Float32Array;
  freqAxis: Float32Array;
} {
  // Convert to complex if needed
  let real: Float32Array, imag: Float32Array;
  if (signal instanceof Float32Array) {
    real = signal;
    imag = new Float32Array(signal.length);
  } else {
    real = signal.i;
    imag = signal.q;
  }
  
  const N = real.length;
  const numTimePoints = Math.floor(N / 4);
  const timeStep = Math.floor(N / numTimePoints);
  
  const cwd: Float32Array[] = [];
  const timeAxis = new Float32Array(numTimePoints);
  const freqAxis = new Float32Array(nfft);
  
  // Frequency axis
  for (let k = 0; k < nfft; k++) {
    freqAxis[k] = (k - nfft / 2) / nfft;
  }
  
  // Compute CWD for each time point
  for (let tIdx = 0; tIdx < numTimePoints; tIdx++) {
    const t = tIdx * timeStep + Math.floor(nfft / 2);
    if (t >= nfft / 2 && t < N - nfft / 2) {
      timeAxis[tIdx] = t;
      
      const autocorr = new Float32Array(nfft * 2);
      
      for (let tau = -Math.floor(nfft / 2); tau < Math.floor(nfft / 2); tau++) {
        const idx1 = t + Math.floor(tau / 2);
        const idx2 = t - Math.floor(tau / 2);
        
        if (idx1 >= 0 && idx1 < N && idx2 >= 0 && idx2 < N) {
          // Choi-Williams exponential kernel
          const kernel = Math.exp(-sigma * tau * tau / (t * t + 1e-10));
          
          const re1 = real[idx1], im1 = imag[idx1];
          const re2 = real[idx2], im2 = imag[idx2];
          
          const tauIdx = tau + Math.floor(nfft / 2);
          autocorr[tauIdx * 2] = kernel * (re1 * re2 + im1 * im2);
          autocorr[tauIdx * 2 + 1] = kernel * (im1 * re2 - re1 * im2);
        }
      }
      
      const spectrum = fft(autocorr, nfft);
      
      const cwdSlice = new Float32Array(nfft);
      for (let k = 0; k < nfft; k++) {
        const shiftedK = (k + Math.floor(nfft / 2)) % nfft;
        const re = spectrum[shiftedK * 2];
        const im = spectrum[shiftedK * 2 + 1];
        cwdSlice[k] = Math.sqrt(re * re + im * im);
      }
      
      cwd.push(cwdSlice);
    }
  }
  
  return { cwd, timeAxis, freqAxis };
}

/**
 * Born-Jordan Distribution (BJD)
 * Optimal kernel for minimal cross-terms
 */
export function bornJordanDistribution(
  signal: Float32Array | { i: Float32Array; q: Float32Array },
  nfft: number = 256
): {
  bjd: Float32Array[];
  timeAxis: Float32Array;
  freqAxis: Float32Array;
} {
  // Convert to complex if needed
  let real: Float32Array, imag: Float32Array;
  if (signal instanceof Float32Array) {
    real = signal;
    imag = new Float32Array(signal.length);
  } else {
    real = signal.i;
    imag = signal.q;
  }
  
  const N = real.length;
  const numTimePoints = Math.floor(N / 4);
  const timeStep = Math.floor(N / numTimePoints);
  
  const bjd: Float32Array[] = [];
  const timeAxis = new Float32Array(numTimePoints);
  const freqAxis = new Float32Array(nfft);
  
  for (let k = 0; k < nfft; k++) {
    freqAxis[k] = (k - nfft / 2) / nfft;
  }
  
  for (let tIdx = 0; tIdx < numTimePoints; tIdx++) {
    const t = tIdx * timeStep + Math.floor(nfft / 2);
    if (t >= nfft / 2 && t < N - nfft / 2) {
      timeAxis[tIdx] = t;
      
      const autocorr = new Float32Array(nfft * 2);
      
      for (let tau = -Math.floor(nfft / 2); tau < Math.floor(nfft / 2); tau++) {
        const idx1 = t + Math.floor(tau / 2);
        const idx2 = t - Math.floor(tau / 2);
        
        if (idx1 >= 0 && idx1 < N && idx2 >= 0 && idx2 < N) {
          // Born-Jordan kernel: sinc(tau)
          const kernel = tau === 0 ? 1.0 : Math.sin(Math.PI * tau) / (Math.PI * tau);
          
          const re1 = real[idx1], im1 = imag[idx1];
          const re2 = real[idx2], im2 = imag[idx2];
          
          const tauIdx = tau + Math.floor(nfft / 2);
          autocorr[tauIdx * 2] = kernel * (re1 * re2 + im1 * im2);
          autocorr[tauIdx * 2 + 1] = kernel * (im1 * re2 - re1 * im2);
        }
      }
      
      const spectrum = fft(autocorr, nfft);
      
      const bjdSlice = new Float32Array(nfft);
      for (let k = 0; k < nfft; k++) {
        const shiftedK = (k + Math.floor(nfft / 2)) % nfft;
        const re = spectrum[shiftedK * 2];
        const im = spectrum[shiftedK * 2 + 1];
        bjdSlice[k] = Math.sqrt(re * re + im * im);
      }
      
      bjd.push(bjdSlice);
    }
  }
  
  return { bjd, timeAxis, freqAxis };
}

/**
 * Convert WVD to dB scale for visualization
 */
export function wvdToDb(wvd: Float32Array[]): Float32Array[] {
  return wvd.map(slice => {
    const dbSlice = new Float32Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      dbSlice[i] = 10 * Math.log10(Math.max(slice[i], 1e-10));
    }
    return dbSlice;
  });
}

/**
 * Helper: Apply Hamming window to autocorrelation
 */
function applyHammingWindow(data: Float32Array, windowSize: number): void {
  const halfWindow = Math.floor(windowSize / 2);
  const center = Math.floor(data.length / 4); // Center of complex array
  
  for (let i = 0; i < data.length / 2; i++) {
    const dist = Math.abs(i - center);
    if (dist > halfWindow) {
      data[i * 2] = 0;
      data[i * 2 + 1] = 0;
    } else {
      const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * dist) / windowSize);
      data[i * 2] *= window;
      data[i * 2 + 1] *= window;
    }
  }
}

/**
 * Simple Cooley-Tukey FFT implementation
 * Input: interleaved complex array [re, im, re, im, ...]
 * Output: interleaved complex array
 */
function fft(input: Float32Array, n: number): Float32Array {
  const output = new Float32Array(n * 2);
  
  // Copy input (handle padding if needed)
  for (let i = 0; i < Math.min(input.length / 2, n); i++) {
    output[i * 2] = input[i * 2] || 0;
    output[i * 2 + 1] = input[i * 2 + 1] || 0;
  }
  
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      // Swap
      [output[i * 2], output[j * 2]] = [output[j * 2], output[i * 2]];
      [output[i * 2 + 1], output[j * 2 + 1]] = [output[j * 2 + 1], output[i * 2 + 1]];
    }
    
    let k = n / 2;
    while (k <= j) {
      j -= k;
      k /= 2;
    }
    j += k;
  }
  
  // Cooley-Tukey decimation-in-time
  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2;
    const angle = -2 * Math.PI / len;
    
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < halfLen; k++) {
        const theta = angle * k;
        const wRe = Math.cos(theta);
        const wIm = Math.sin(theta);
        
        const evenIdx = (i + k) * 2;
        const oddIdx = (i + k + halfLen) * 2;
        
        const tRe = wRe * output[oddIdx] - wIm * output[oddIdx + 1];
        const tIm = wRe * output[oddIdx + 1] + wIm * output[oddIdx];
        
        output[oddIdx] = output[evenIdx] - tRe;
        output[oddIdx + 1] = output[evenIdx + 1] - tIm;
        
        output[evenIdx] += tRe;
        output[evenIdx + 1] += tIm;
      }
    }
  }
  
  return output;
}
