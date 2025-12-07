/**
 * Signal Preview Generator
 * 
 * Generates mini-spectrogram thumbnails (256×128px) during file upload
 * to visually confirm signal quality before committing full upload.
 * 
 * Features:
 * - Read first 1-2 MB of file (fast analysis)
 * - Compute FFT on sample chunks
 * - Render mini-spectrogram with colormap
 * - Estimate signal quality metrics (SNR, peak power)
 * - Canvas-based rendering for preview
 */

export interface SignalPreview {
  imageDataUrl: string; // Base64 PNG data URL
  width: number;
  height: number;
  metrics: {
    snrEstimate: number; // dB
    peakPower: number; // dB
    avgPower: number; // dB
    dynamicRange: number; // dB
  };
  sampleCount: number;
  fftSize: number;
}

export class SignalPreviewGenerator {
  private static readonly PREVIEW_WIDTH = 256;
  private static readonly PREVIEW_HEIGHT = 128;
  private static readonly MAX_READ_BYTES = 2 * 1024 * 1024; // 2 MB
  private static readonly FFT_SIZE = 512;
  
  /**
   * Generate preview thumbnail from signal file
   */
  static async generate(
    file: File,
    datatype: string,
    sampleRate: number
  ): Promise<SignalPreview> {
    console.log(`[SignalPreviewGenerator] Generating preview for ${file.name}`);
    
    // Read first chunk of file
    const bytesPerSample = this.getBytesPerSample(datatype);
    const maxSamples = Math.floor(this.MAX_READ_BYTES / bytesPerSample);
    const bytesToRead = Math.min(maxSamples * bytesPerSample, file.size);
    
    const buffer = await this.readFileChunk(file, 0, bytesToRead);
    
    // Parse IQ samples
    const samples = this.parseIQSamples(buffer, datatype);
    
    // Compute spectrogram
    const spectrogram = this.computeSpectrogram(samples, this.FFT_SIZE);
    
    // Calculate metrics
    const metrics = this.calculateMetrics(spectrogram);
    
    // Render to canvas
    const canvas = this.renderSpectrogram(spectrogram);
    const imageDataUrl = canvas.toDataURL('image/png');
    
    return {
      imageDataUrl,
      width: this.PREVIEW_WIDTH,
      height: this.PREVIEW_HEIGHT,
      metrics,
      sampleCount: samples.length,
      fftSize: this.FFT_SIZE,
    };
  }
  
  /**
   * Read chunk of file as ArrayBuffer
   */
  private static async readFileChunk(
    file: File,
    start: number,
    length: number
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const blob = file.slice(start, start + length);
      
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as ArrayBuffer'));
        }
      };
      
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }
  
  /**
   * Parse IQ samples from binary data
   */
  private static parseIQSamples(
    buffer: ArrayBuffer,
    datatype: string
  ): { i: number; q: number }[] {
    const view = new DataView(buffer);
    const samples: { i: number; q: number }[] = [];
    
    let offset = 0;
    
    switch (datatype) {
      case 'cf32_le': {
        // Complex Float32 Little Endian
        while (offset + 8 <= buffer.byteLength) {
          const i = view.getFloat32(offset, true);
          const q = view.getFloat32(offset + 4, true);
          samples.push({ i, q });
          offset += 8;
        }
        break;
      }
      
      case 'ci16_le': {
        // Complex Int16 Little Endian
        while (offset + 4 <= buffer.byteLength) {
          const i = view.getInt16(offset, true) / 32768.0;
          const q = view.getInt16(offset + 2, true) / 32768.0;
          samples.push({ i, q });
          offset += 4;
        }
        break;
      }
      
      case 'ci8': {
        // Complex Int8
        while (offset + 2 <= buffer.byteLength) {
          const i = view.getInt8(offset) / 128.0;
          const q = view.getInt8(offset + 1) / 128.0;
          samples.push({ i, q });
          offset += 2;
        }
        break;
      }
      
      case 'cu8': {
        // Complex Uint8
        while (offset + 2 <= buffer.byteLength) {
          const i = (view.getUint8(offset) - 128) / 128.0;
          const q = (view.getUint8(offset + 1) - 128) / 128.0;
          samples.push({ i, q });
          offset += 2;
        }
        break;
      }
      
      case 'cu16_le': {
        // Complex Uint16 Little Endian
        while (offset + 4 <= buffer.byteLength) {
          const i = (view.getUint16(offset, true) - 32768) / 32768.0;
          const q = (view.getUint16(offset + 2, true) - 32768) / 32768.0;
          samples.push({ i, q });
          offset += 4;
        }
        break;
      }
      
      default:
        throw new Error(`Unsupported datatype: ${datatype}`);
    }
    
    return samples;
  }
  
  /**
   * Compute spectrogram from IQ samples
   */
  private static computeSpectrogram(
    samples: { i: number; q: number }[],
    fftSize: number
  ): number[][] {
    const spectrogram: number[][] = [];
    const hopSize = Math.floor(fftSize / 2); // 50% overlap
    
    // Hamming window
    const window = this.hammingWindow(fftSize);
    
    for (let i = 0; i + fftSize <= samples.length; i += hopSize) {
      const chunk = samples.slice(i, i + fftSize);
      
      // Apply window
      const windowed = chunk.map((s, idx) => ({
        i: s.i * window[idx],
        q: s.q * window[idx],
      }));
      
      // Compute FFT
      const fftResult = this.fft(windowed);
      
      // Compute power spectrum (magnitude squared)
      const powerSpectrum = fftResult.map(c => c.i * c.i + c.q * c.q);
      
      // Convert to dB
      const powerDB = powerSpectrum.map(p => 10 * Math.log10(Math.max(p, 1e-10)));
      
      spectrogram.push(powerDB);
    }
    
    return spectrogram;
  }
  
  /**
   * Simple FFT implementation (Cooley-Tukey)
   */
  private static fft(samples: { i: number; q: number }[]): { i: number; q: number }[] {
    const n = samples.length;
    
    if (n <= 1) return samples;
    
    // Bit-reversal permutation
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
      const j = this.reverseBits(i, Math.log2(n));
      result[i] = samples[j];
    }
    
    // Butterfly operations
    for (let size = 2; size <= n; size *= 2) {
      const halfSize = size / 2;
      const step = (2 * Math.PI) / size;
      
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const angle = -step * j;
          const twiddle = {
            i: Math.cos(angle),
            q: Math.sin(angle),
          };
          
          const even = result[i + j];
          const odd = result[i + j + halfSize];
          
          const t = {
            i: odd.i * twiddle.i - odd.q * twiddle.q,
            q: odd.i * twiddle.q + odd.q * twiddle.i,
          };
          
          result[i + j] = {
            i: even.i + t.i,
            q: even.q + t.q,
          };
          
          result[i + j + halfSize] = {
            i: even.i - t.i,
            q: even.q - t.q,
          };
        }
      }
    }
    
    return result;
  }
  
  /**
   * Reverse bits for FFT bit-reversal
   */
  private static reverseBits(x: number, bits: number): number {
    let result = 0;
    for (let i = 0; i < bits; i++) {
      result = (result << 1) | (x & 1);
      x >>= 1;
    }
    return result;
  }
  
  /**
   * Hamming window function
   */
  private static hammingWindow(size: number): number[] {
    const window: number[] = [];
    for (let i = 0; i < size; i++) {
      window.push(0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return window;
  }
  
  /**
   * Calculate signal quality metrics
   */
  private static calculateMetrics(spectrogram: number[][]): SignalPreview['metrics'] {
    // Flatten spectrogram
    const allPowers = spectrogram.flat();
    
    // Calculate statistics
    const avgPower = allPowers.reduce((sum, p) => sum + p, 0) / allPowers.length;
    const peakPower = Math.max(...allPowers);
    const minPower = Math.min(...allPowers);
    const dynamicRange = peakPower - minPower;
    
    // Estimate SNR (simple noise floor estimation)
    const sortedPowers = [...allPowers].sort((a, b) => a - b);
    const noiseFloor = sortedPowers[Math.floor(sortedPowers.length * 0.1)]; // 10th percentile
    const snrEstimate = peakPower - noiseFloor;
    
    return {
      snrEstimate: Math.max(0, snrEstimate),
      peakPower,
      avgPower,
      dynamicRange,
    };
  }
  
  /**
   * Render spectrogram to canvas
   */
  private static renderSpectrogram(spectrogram: number[][]): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.PREVIEW_WIDTH;
    canvas.height = this.PREVIEW_HEIGHT;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    
    // Normalize spectrogram to fit canvas
    const timeSteps = spectrogram.length;
    const freqBins = spectrogram[0].length;
    
    const xScale = this.PREVIEW_WIDTH / timeSteps;
    const yScale = this.PREVIEW_HEIGHT / freqBins;
    
    // Find min/max for normalization
    const allPowers = spectrogram.flat();
    const minPower = Math.min(...allPowers);
    const maxPower = Math.max(...allPowers);
    const range = maxPower - minPower;
    
    // Render pixels
    for (let t = 0; t < timeSteps; t++) {
      for (let f = 0; f < freqBins; f++) {
        const power = spectrogram[t][f];
        const normalized = (power - minPower) / range;
        
        // Apply Viridis colormap
        const color = this.viridisColormap(normalized);
        
        ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        
        const x = Math.floor(t * xScale);
        const y = Math.floor((freqBins - 1 - f) * yScale); // Flip Y axis
        const w = Math.ceil(xScale);
        const h = Math.ceil(yScale);
        
        ctx.fillRect(x, y, w, h);
      }
    }
    
    return canvas;
  }
  
  /**
   * Viridis colormap
   */
  private static viridisColormap(value: number): { r: number; g: number; b: number } {
    const v = Math.max(0, Math.min(1, value));
    
    // Simplified Viridis colormap (5 control points)
    const colors = [
      { r: 68, g: 1, b: 84 },     // Dark purple
      { r: 59, g: 82, b: 139 },   // Blue
      { r: 33, g: 145, b: 140 },  // Teal
      { r: 94, g: 201, b: 98 },   // Green
      { r: 253, g: 231, b: 37 },  // Yellow
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
  }
  
  /**
   * Get bytes per sample for datatype
   */
  private static getBytesPerSample(datatype: string): number {
    switch (datatype) {
      case 'cf32_le': return 8;
      case 'ci16_le': return 4;
      case 'cu16_le': return 4;
      case 'ci8': return 2;
      case 'cu8': return 2;
      default: return 8;
    }
  }
}
