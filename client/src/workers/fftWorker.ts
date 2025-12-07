/**
 * Web Worker for FFT computation
 * 
 * Offloads FFT processing to a separate thread to avoid blocking the main UI thread.
 * Supports overlap processing for smooth spectrogram updates.
 */

interface FFTRequest {
  type: 'compute';
  iqSamples: Float32Array;
  fftSize: number;
  overlap: number; // 0.0 - 1.0 (0.5 = 50% overlap)
  window: 'hamming' | 'hann' | 'blackman' | 'none';
}

interface FFTResponse {
  type: 'result';
  psd: Float32Array[];
  numFFTs: number;
}

// FFT implementation using Cooley-Tukey algorithm
class FFT {
  private size: number;
  private cosTable: Float32Array;
  private sinTable: Float32Array;
  
  constructor(size: number) {
    if ((size & (size - 1)) !== 0) {
      throw new Error('FFT size must be a power of 2');
    }
    
    this.size = size;
    this.cosTable = new Float32Array(size / 2);
    this.sinTable = new Float32Array(size / 2);
    
    // Precompute twiddle factors
    for (let i = 0; i < size / 2; i++) {
      const angle = -2 * Math.PI * i / size;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }
  }
  
  /**
   * Compute FFT of complex input (in-place)
   * @param real Real part
   * @param imag Imaginary part
   */
  compute(real: Float32Array, imag: Float32Array): void {
    const n = this.size;
    
    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
      
      let k = n / 2;
      while (k <= j) {
        j -= k;
        k /= 2;
      }
      j += k;
    }
    
    // Cooley-Tukey decimation-in-time FFT
    for (let size = 2; size <= n; size *= 2) {
      const halfSize = size / 2;
      const tableStep = n / size;
      
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + halfSize; j++, k += tableStep) {
          const tpre = real[j + halfSize] * this.cosTable[k] - imag[j + halfSize] * this.sinTable[k];
          const tpim = real[j + halfSize] * this.sinTable[k] + imag[j + halfSize] * this.cosTable[k];
          
          real[j + halfSize] = real[j] - tpre;
          imag[j + halfSize] = imag[j] - tpim;
          real[j] += tpre;
          imag[j] += tpim;
        }
      }
    }
  }
  
  /**
   * Compute power spectral density (PSD) in dB
   */
  computePSD(real: Float32Array, imag: Float32Array): Float32Array {
    const psd = new Float32Array(this.size);
    
    for (let i = 0; i < this.size; i++) {
      const power = real[i] * real[i] + imag[i] * imag[i];
      psd[i] = 10 * Math.log10(power + 1e-10);
    }
    
    // FFT shift (move DC to center)
    const shifted = new Float32Array(this.size);
    const half = this.size / 2;
    shifted.set(psd.subarray(half), 0);
    shifted.set(psd.subarray(0, half), half);
    
    return shifted;
  }
}

/**
 * Generate window function
 */
function generateWindow(size: number, type: 'hamming' | 'hann' | 'blackman' | 'none'): Float32Array {
  const window = new Float32Array(size);
  
  switch (type) {
    case 'hamming':
      for (let i = 0; i < size; i++) {
        window[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (size - 1));
      }
      break;
    
    case 'hann':
      for (let i = 0; i < size; i++) {
        window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
      }
      break;
    
    case 'blackman':
      const a0 = 0.42;
      const a1 = 0.5;
      const a2 = 0.08;
      for (let i = 0; i < size; i++) {
        window[i] = a0 - a1 * Math.cos(2 * Math.PI * i / (size - 1)) + a2 * Math.cos(4 * Math.PI * i / (size - 1));
      }
      break;
    
    case 'none':
      window.fill(1.0);
      break;
  }
  
  return window;
}

/**
 * Process FFT request with overlap
 */
function processFFTRequest(request: FFTRequest): FFTResponse {
  const { iqSamples, fftSize, overlap, window: windowType } = request;
  
  // Convert interleaved I/Q to separate arrays
  const numSamples = iqSamples.length / 2;
  const real = new Float32Array(numSamples);
  const imag = new Float32Array(numSamples);
  
  for (let i = 0; i < numSamples; i++) {
    real[i] = iqSamples[i * 2];
    imag[i] = iqSamples[i * 2 + 1];
  }
  
  // Calculate hop size
  const hopSize = Math.floor(fftSize * (1 - overlap));
  const numFFTs = Math.floor((numSamples - fftSize) / hopSize) + 1;
  
  if (numFFTs <= 0) {
    return {
      type: 'result',
      psd: [],
      numFFTs: 0,
    };
  }
  
  // Generate window
  const windowFunc = generateWindow(fftSize, windowType);
  
  // Create FFT instance
  const fft = new FFT(fftSize);
  
  // Process each FFT frame
  const psdResults: Float32Array[] = [];
  
  for (let i = 0; i < numFFTs; i++) {
    const offset = i * hopSize;
    
    // Extract frame
    const frameReal = new Float32Array(fftSize);
    const frameImag = new Float32Array(fftSize);
    
    for (let j = 0; j < fftSize; j++) {
      if (offset + j < numSamples) {
        frameReal[j] = real[offset + j] * windowFunc[j];
        frameImag[j] = imag[offset + j] * windowFunc[j];
      }
    }
    
    // Compute FFT
    fft.compute(frameReal, frameImag);
    
    // Compute PSD
    const psd = fft.computePSD(frameReal, frameImag);
    psdResults.push(psd);
  }
  
  return {
    type: 'result',
    psd: psdResults,
    numFFTs,
  };
}

// Worker message handler
self.onmessage = (event: MessageEvent<FFTRequest>) => {
  try {
    const request = event.data;
    
    if (request.type === 'compute') {
      const response = processFFTRequest(request);
      self.postMessage(response);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Signal worker is ready
self.postMessage({ type: 'ready' });
