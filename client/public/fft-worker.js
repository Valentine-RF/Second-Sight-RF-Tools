/**
 * Web Worker for off-thread FFT computation
 * Processes IQ samples and computes FFT for spectrogram/waterfall visualization
 * 
 * Message Protocol:
 * - Input: { type: 'compute', samples: Float32Array, fftSize: number, window: string }
 * - Output: { type: 'result', fft: Float32Array, timestamp: number }
 */

importScripts('https://cdn.jsdelivr.net/npm/fft.js@4.0.4/lib/fft.min.js');

// Window functions
const WINDOWS = {
  /**
   * Rectangular window (no windowing)
   * @param {number} n - Sample index
   * @param {number} N - Window size
   * @returns {number} Window coefficient
   */
  rectangular: (n, N) => 1.0,
  
  /**
   * Hamming window
   * @param {number} n - Sample index
   * @param {number} N - Window size
   * @returns {number} Window coefficient
   */
  hamming: (n, N) => 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1)),
  
  /**
   * Hann window
   * @param {number} n - Sample index
   * @param {number} N - Window size
   * @returns {number} Window coefficient
   */
  hann: (n, N) => 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1))),
  
  /**
   * Blackman-Harris window
   * @param {number} n - Sample index
   * @param {number} N - Window size
   * @returns {number} Window coefficient
   */
  blackmanHarris: (n, N) => {
    const a0 = 0.35875;
    const a1 = 0.48829;
    const a2 = 0.14128;
    const a3 = 0.01168;
    return a0 
      - a1 * Math.cos((2 * Math.PI * n) / (N - 1))
      + a2 * Math.cos((4 * Math.PI * n) / (N - 1))
      - a3 * Math.cos((6 * Math.PI * n) / (N - 1));
  }
};

/**
 * Apply window function to IQ samples
 * @param {Float32Array} samples - Interleaved I/Q samples [I0, Q0, I1, Q1, ...]
 * @param {string} windowType - Window function name
 * @returns {Float32Array} Windowed samples
 */
function applyWindow(samples, windowType = 'hann') {
  const N = samples.length / 2; // Number of complex samples
  const windowFn = WINDOWS[windowType] || WINDOWS.hann;
  const windowed = new Float32Array(samples.length);
  
  for (let i = 0; i < N; i++) {
    const w = windowFn(i, N);
    windowed[2 * i] = samples[2 * i] * w;       // I
    windowed[2 * i + 1] = samples[2 * i + 1] * w; // Q
  }
  
  return windowed;
}

/**
 * Compute FFT magnitude from IQ samples
 * @param {Float32Array} samples - Interleaved I/Q samples
 * @param {number} fftSize - FFT size (must be power of 2)
 * @returns {Float32Array} FFT magnitude in dB
 */
function computeFFT(samples, fftSize) {
  const fft = new FFT(fftSize);
  const out = fft.createComplexArray();
  
  // Convert interleaved I/Q to complex array format expected by fft.js
  const input = new Array(fftSize * 2);
  for (let i = 0; i < fftSize; i++) {
    input[2 * i] = samples[2 * i] || 0;       // Real (I)
    input[2 * i + 1] = samples[2 * i + 1] || 0; // Imag (Q)
  }
  
  // Compute FFT
  fft.transform(out, input);
  
  // Compute magnitude and convert to dB
  const magnitude = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const real = out[2 * i];
    const imag = out[2 * i + 1];
    const mag = Math.sqrt(real * real + imag * imag);
    magnitude[i] = 20 * Math.log10(mag + 1e-10); // Add epsilon to avoid log(0)
  }
  
  // FFT shift: move zero frequency to center
  const shifted = new Float32Array(fftSize);
  const half = Math.floor(fftSize / 2);
  for (let i = 0; i < fftSize; i++) {
    shifted[i] = magnitude[(i + half) % fftSize];
  }
  
  return shifted;
}

/**
 * Message handler
 */
self.onmessage = function(e) {
  const { type, samples, fftSize, window, id } = e.data;
  
  if (type === 'compute') {
    try {
      // Apply window function
      const windowed = applyWindow(samples, window || 'hann');
      
      // Compute FFT
      const fft = computeFFT(windowed, fftSize);
      
      // Send result back to main thread
      self.postMessage({
        type: 'result',
        fft: fft,
        timestamp: Date.now(),
        id: id
      }, [fft.buffer]); // Transfer ownership for zero-copy
      
    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error.message,
        id: id
      });
    }
  } else if (type === 'init') {
    self.postMessage({
      type: 'ready',
      worker: 'FFT Worker initialized'
    });
  }
};

// Signal ready state
self.postMessage({ type: 'ready' });
