/**
 * Signal Metrics Extractor
 * 
 * Extracts key metrics from signal analysis results for report generation.
 */

export interface SignalMetrics {
  snr: number;              // Signal-to-Noise Ratio (dB)
  peakPower: number;        // Peak power (dB)
  avgPower: number;         // Average power (dB)
  dynamicRange: number;     // Dynamic range (dB)
  bandwidth: number;        // Occupied bandwidth (Hz)
  crestFactor: number;      // Crest factor (dB)
  rmsLevel: number;         // RMS level (dB)
  noiseFloor: number;       // Estimated noise floor (dB)
}

export class SignalMetricsExtractor {
  /**
   * Extract all metrics from FFT/PSD data
   */
  static extractMetrics(
    fftData: Float32Array | number[],
    sampleRate: number,
    options: {
      noiseFloorPercentile?: number;  // Percentile for noise floor estimation (default: 10)
      signalThresholdDb?: number;     // dB above noise floor to consider signal (default: 10)
      bandwidthThreshold?: number;    // Power threshold for bandwidth (default: -20 dB from peak)
    } = {}
  ): SignalMetrics {
    const {
      noiseFloorPercentile = 10,
      signalThresholdDb = 10,
      bandwidthThreshold = -20,
    } = options;

    // Convert to array if needed
    const psdArray = Array.from(fftData);
    
    // Calculate power metrics
    const peakPower = Math.max(...psdArray);
    const avgPower = psdArray.reduce((sum, val) => sum + val, 0) / psdArray.length;
    
    // Estimate noise floor (10th percentile)
    const sortedPsd = [...psdArray].sort((a, b) => a - b);
    const noiseFloorIndex = Math.floor(sortedPsd.length * (noiseFloorPercentile / 100));
    const noiseFloor = sortedPsd[noiseFloorIndex];
    
    // Calculate SNR (peak signal power vs noise floor)
    const snr = peakPower - noiseFloor;
    
    // Calculate dynamic range (peak to noise floor)
    const dynamicRange = peakPower - noiseFloor;
    
    // Calculate occupied bandwidth (power above threshold)
    const bandwidth = this.calculateOccupiedBandwidth(
      psdArray,
      sampleRate,
      peakPower + bandwidthThreshold
    );
    
    // Calculate RMS level (root mean square in dB)
    const rmsLinear = Math.sqrt(
      psdArray.reduce((sum, val) => sum + Math.pow(10, val / 10), 0) / psdArray.length
    );
    const rmsLevel = 10 * Math.log10(rmsLinear);
    
    // Calculate crest factor (peak to RMS ratio)
    const crestFactor = peakPower - rmsLevel;
    
    return {
      snr,
      peakPower,
      avgPower,
      dynamicRange,
      bandwidth,
      crestFactor,
      rmsLevel,
      noiseFloor,
    };
  }

  /**
   * Calculate occupied bandwidth using power threshold method
   */
  private static calculateOccupiedBandwidth(
    psdArray: number[],
    sampleRate: number,
    threshold: number
  ): number {
    const binWidth = sampleRate / psdArray.length;
    
    // Find bins above threshold
    const aboveThreshold = psdArray.map((power, index) => ({
      index,
      power,
      aboveThreshold: power >= threshold,
    }));
    
    // Find first and last bin above threshold
    const firstBin = aboveThreshold.find(b => b.aboveThreshold)?.index ?? 0;
    const lastBin = aboveThreshold.reverse().find(b => b.aboveThreshold)?.index ?? psdArray.length - 1;
    
    // Calculate bandwidth
    const bandwidth = (lastBin - firstBin + 1) * binWidth;
    
    return bandwidth;
  }

  /**
   * Calculate SNR from time-domain IQ samples
   */
  static calculateSNRFromIQ(
    iqSamples: Float32Array,
    signalStartSample: number,
    signalEndSample: number,
    noiseStartSample: number,
    noiseEndSample: number
  ): number {
    // Calculate signal power
    let signalPower = 0;
    for (let i = signalStartSample; i < signalEndSample; i += 2) {
      const I = iqSamples[i];
      const Q = iqSamples[i + 1];
      signalPower += I * I + Q * Q;
    }
    signalPower /= (signalEndSample - signalStartSample) / 2;
    
    // Calculate noise power
    let noisePower = 0;
    for (let i = noiseStartSample; i < noiseEndSample; i += 2) {
      const I = iqSamples[i];
      const Q = iqSamples[i + 1];
      noisePower += I * I + Q * Q;
    }
    noisePower /= (noiseEndSample - noiseStartSample) / 2;
    
    // Calculate SNR in dB
    const snr = 10 * Math.log10(signalPower / noisePower);
    
    return snr;
  }

  /**
   * Calculate power spectral density from IQ samples
   */
  static calculatePSD(
    iqSamples: Float32Array,
    fftSize: number = 1024,
    windowType: 'hamming' | 'hann' | 'blackman' = 'hamming'
  ): Float32Array {
    const numFFTs = Math.floor(iqSamples.length / (fftSize * 2));
    const psd = new Float32Array(fftSize);
    
    // Apply window function
    const window = this.createWindow(fftSize, windowType);
    
    for (let fftIndex = 0; fftIndex < numFFTs; fftIndex++) {
      const offset = fftIndex * fftSize * 2;
      
      // Extract IQ samples for this FFT
      const real = new Float32Array(fftSize);
      const imag = new Float32Array(fftSize);
      
      for (let i = 0; i < fftSize; i++) {
        real[i] = iqSamples[offset + i * 2] * window[i];
        imag[i] = iqSamples[offset + i * 2 + 1] * window[i];
      }
      
      // Compute FFT (simplified - in production use Web Audio API or FFT library)
      const fftResult = this.simpleFFT(real, imag);
      
      // Accumulate power
      for (let i = 0; i < fftSize; i++) {
        const power = fftResult.real[i] * fftResult.real[i] + fftResult.imag[i] * fftResult.imag[i];
        psd[i] += power;
      }
    }
    
    // Average and convert to dB
    for (let i = 0; i < fftSize; i++) {
      psd[i] = 10 * Math.log10(psd[i] / numFFTs + 1e-12);
    }
    
    return psd;
  }

  /**
   * Create window function
   */
  private static createWindow(size: number, type: 'hamming' | 'hann' | 'blackman'): Float32Array {
    const window = new Float32Array(size);
    
    for (let i = 0; i < size; i++) {
      const n = i / (size - 1);
      
      switch (type) {
        case 'hamming':
          window[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * n);
          break;
        case 'hann':
          window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * n));
          break;
        case 'blackman':
          window[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * n) + 0.08 * Math.cos(4 * Math.PI * n);
          break;
      }
    }
    
    return window;
  }

  /**
   * Simple FFT implementation (Cooley-Tukey)
   * Note: In production, use Web Audio API or a proper FFT library
   */
  private static simpleFFT(
    real: Float32Array,
    imag: Float32Array
  ): { real: Float32Array; imag: Float32Array } {
    const N = real.length;
    
    // Bit reversal
    const bitReverse = (n: number, bits: number) => {
      let reversed = 0;
      for (let i = 0; i < bits; i++) {
        reversed = (reversed << 1) | (n & 1);
        n >>= 1;
      }
      return reversed;
    };
    
    const bits = Math.log2(N);
    const realOut = new Float32Array(N);
    const imagOut = new Float32Array(N);
    
    for (let i = 0; i < N; i++) {
      const j = bitReverse(i, bits);
      realOut[i] = real[j];
      imagOut[i] = imag[j];
    }
    
    // Butterfly operations
    for (let size = 2; size <= N; size *= 2) {
      const halfSize = size / 2;
      const step = N / size;
      
      for (let i = 0; i < N; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const k = i + j;
          const l = k + halfSize;
          
          const angle = -2 * Math.PI * j * step / N;
          const twiddleReal = Math.cos(angle);
          const twiddleImag = Math.sin(angle);
          
          const tReal = twiddleReal * realOut[l] - twiddleImag * imagOut[l];
          const tImag = twiddleReal * imagOut[l] + twiddleImag * realOut[l];
          
          realOut[l] = realOut[k] - tReal;
          imagOut[l] = imagOut[k] - tImag;
          realOut[k] += tReal;
          imagOut[k] += tImag;
        }
      }
    }
    
    return { real: realOut, imag: imagOut };
  }

  /**
   * Extract metrics from existing PSD plot data
   */
  static extractMetricsFromPSDPlot(
    frequencies: number[],
    powerDb: number[],
    sampleRate: number
  ): SignalMetrics {
    return this.extractMetrics(new Float32Array(powerDb), sampleRate);
  }

  /**
   * Calculate bandwidth using 99% power containment method
   */
  static calculate99PercentBandwidth(
    psdArray: number[],
    sampleRate: number
  ): number {
    // Convert dB to linear power
    const linearPower = psdArray.map(db => Math.pow(10, db / 10));
    
    // Calculate total power
    const totalPower = linearPower.reduce((sum, p) => sum + p, 0);
    
    // Find bins containing 99% of power
    const targetPower = totalPower * 0.99;
    let accumulatedPower = 0;
    let startBin = 0;
    let endBin = linearPower.length - 1;
    
    // Find center of power
    let centerBin = 0;
    let halfPower = totalPower / 2;
    for (let i = 0; i < linearPower.length; i++) {
      accumulatedPower += linearPower[i];
      if (accumulatedPower >= halfPower) {
        centerBin = i;
        break;
      }
    }
    
    // Expand from center until 99% power is contained
    accumulatedPower = linearPower[centerBin];
    let leftBin = centerBin;
    let rightBin = centerBin;
    
    while (accumulatedPower < targetPower && (leftBin > 0 || rightBin < linearPower.length - 1)) {
      const leftPower = leftBin > 0 ? linearPower[leftBin - 1] : 0;
      const rightPower = rightBin < linearPower.length - 1 ? linearPower[rightBin + 1] : 0;
      
      if (leftPower > rightPower) {
        leftBin--;
        accumulatedPower += leftPower;
      } else {
        rightBin++;
        accumulatedPower += rightPower;
      }
    }
    
    startBin = leftBin;
    endBin = rightBin;
    
    // Calculate bandwidth
    const binWidth = sampleRate / psdArray.length;
    const bandwidth = (endBin - startBin + 1) * binWidth;
    
    return bandwidth;
  }
}
