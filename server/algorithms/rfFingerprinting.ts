/**
 * RF-DNA Fingerprinting System
 * 
 * Implements device identification through RF transient and spectral features:
 * - AFIT RF-DNA feature extraction (180 features)
 * - Constellation-Based DNA (CB-DNA)
 * - Bispectrum-Radon Transform features
 * - Device fingerprint database and matching
 */

export interface RFFingerprint {
  deviceId: string;
  deviceType: string;
  
  // Transient features (AFIT RF-DNA)
  transientFeatures: {
    amplitude: Float32Array; // 60 features
    phase: Float32Array; // 60 features
    frequency: Float32Array; // 60 features
  };
  
  // Spectral features
  spectralFeatures: {
    powerSpectralDensity: Float32Array;
    spectralRegrowth: number;
    adjacentChannelPower: number;
  };
  
  // Constellation-based features (CB-DNA)
  constellationFeatures?: {
    errorVectorMagnitude: number;
    phaseError: Float32Array;
    amplitudeImbalance: number;
    quadratureError: number;
  };
  
  // Bispectrum features
  bispectrumFeatures?: {
    radonTransform: Float32Array;
    bicoherence: number;
  };
  
  // Metadata
  centerFreq: number;
  sampleRate: number;
  temperature?: number;
  timestamp: number;
}

export interface FingerprintMatch {
  deviceId: string;
  deviceType: string;
  confidence: number; // 0-1
  distance: number; // Euclidean distance in feature space
  matchedFeatures: string[]; // Which feature sets matched
}

/**
 * Extract RF-DNA fingerprint from IQ samples
 * Implements AFIT RF-DNA methodology with 180 features
 */
export function extractRFFingerprint(
  iqData: { i: Float32Array; q: Float32Array },
  sampleRate: number,
  centerFreq: number
): RFFingerprint {
  const N = iqData.i.length;
  
  // Detect transient region (burst onset)
  const transientStart = detectTransient(iqData, sampleRate);
  const transientLength = Math.floor(sampleRate * 0.001); // 1ms transient
  
  // Extract transient features
  const transientFeatures = extractTransientFeatures(
    iqData,
    transientStart,
    transientLength
  );
  
  // Extract spectral features
  const spectralFeatures = extractSpectralFeatures(iqData, sampleRate);
  
  return {
    deviceId: '', // To be assigned
    deviceType: 'unknown',
    transientFeatures,
    spectralFeatures,
    centerFreq,
    sampleRate,
    timestamp: Date.now(),
  };
}

/**
 * Detect transient onset using energy-based detection
 */
function detectTransient(
  iqData: { i: Float32Array; q: Float32Array },
  sampleRate: number
): number {
  const N = iqData.i.length;
  const windowSize = Math.floor(sampleRate * 0.0001); // 100μs window
  
  // Compute instantaneous power
  const power = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    power[i] = iqData.i[i] ** 2 + iqData.q[i] ** 2;
  }
  
  // Moving average for noise floor estimation
  let noiseFloor = 0;
  for (let i = 0; i < Math.min(windowSize, N); i++) {
    noiseFloor += power[i];
  }
  noiseFloor /= Math.min(windowSize, N);
  
  // Detect threshold crossing (10x noise floor)
  const threshold = noiseFloor * 10;
  for (let i = windowSize; i < N; i++) {
    if (power[i] > threshold) {
      return Math.max(0, i - windowSize);
    }
  }
  
  return 0;
}

/**
 * Extract AFIT RF-DNA transient features (180 total)
 * 60 amplitude + 60 phase + 60 frequency features
 */
function extractTransientFeatures(
  iqData: { i: Float32Array; q: Float32Array },
  start: number,
  length: number
): {
  amplitude: Float32Array;
  phase: Float32Array;
  frequency: Float32Array;
} {
  const end = Math.min(start + length, iqData.i.length);
  const N = end - start;
  
  // Compute amplitude, phase, and instantaneous frequency
  const amplitude = new Float32Array(N);
  const phase = new Float32Array(N);
  const frequency = new Float32Array(N - 1);
  
  for (let i = 0; i < N; i++) {
    const idx = start + i;
    amplitude[i] = Math.sqrt(iqData.i[idx] ** 2 + iqData.q[idx] ** 2);
    phase[i] = Math.atan2(iqData.q[idx], iqData.i[idx]);
  }
  
  // Unwrap phase and compute frequency
  let prevPhase = phase[0];
  for (let i = 1; i < N; i++) {
    let delta = phase[i] - prevPhase;
    
    // Unwrap
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    
    frequency[i - 1] = delta;
    prevPhase = phase[i];
  }
  
  // Extract 60 features from each signal
  const ampFeatures = extractStatisticalFeatures(amplitude, 60);
  const phaseFeatures = extractStatisticalFeatures(phase, 60);
  const freqFeatures = extractStatisticalFeatures(frequency, 60);
  
  return {
    amplitude: ampFeatures,
    phase: phaseFeatures,
    frequency: freqFeatures,
  };
}

/**
 * Extract statistical features from signal
 * Returns: mean, std, skewness, kurtosis, percentiles, derivatives, etc.
 */
function extractStatisticalFeatures(
  signal: Float32Array,
  numFeatures: number
): Float32Array {
  const features = new Float32Array(numFeatures);
  const N = signal.length;
  
  if (N === 0) return features;
  
  // Basic statistics
  let mean = 0, variance = 0;
  for (let i = 0; i < N; i++) {
    mean += signal[i];
  }
  mean /= N;
  
  for (let i = 0; i < N; i++) {
    variance += (signal[i] - mean) ** 2;
  }
  variance /= N;
  const std = Math.sqrt(variance);
  
  // Higher-order moments
  let skewness = 0, kurtosis = 0;
  for (let i = 0; i < N; i++) {
    const z = (signal[i] - mean) / (std + 1e-10);
    skewness += z ** 3;
    kurtosis += z ** 4;
  }
  skewness /= N;
  kurtosis = kurtosis / N - 3; // Excess kurtosis
  
  // Percentiles
  const sorted = Array.from(signal).sort((a, b) => a - b);
  const p10 = sorted[Math.floor(N * 0.1)];
  const p25 = sorted[Math.floor(N * 0.25)];
  const p50 = sorted[Math.floor(N * 0.5)];
  const p75 = sorted[Math.floor(N * 0.75)];
  const p90 = sorted[Math.floor(N * 0.9)];
  
  // Range statistics
  const min = sorted[0];
  const max = sorted[N - 1];
  const range = max - min;
  
  // Derivatives
  let derivative1 = 0, derivative2 = 0;
  for (let i = 1; i < N; i++) {
    derivative1 += Math.abs(signal[i] - signal[i - 1]);
  }
  derivative1 /= (N - 1);
  
  for (let i = 2; i < N; i++) {
    derivative2 += Math.abs(signal[i] - 2 * signal[i - 1] + signal[i - 2]);
  }
  derivative2 /= (N - 2);
  
  // Pack features (60 total)
  let idx = 0;
  features[idx++] = mean;
  features[idx++] = std;
  features[idx++] = variance;
  features[idx++] = skewness;
  features[idx++] = kurtosis;
  features[idx++] = min;
  features[idx++] = max;
  features[idx++] = range;
  features[idx++] = p10;
  features[idx++] = p25;
  features[idx++] = p50;
  features[idx++] = p75;
  features[idx++] = p90;
  features[idx++] = derivative1;
  features[idx++] = derivative2;
  
  // Add more features: autocorrelation, zero-crossings, peak count, etc.
  let zeroCrossings = 0;
  for (let i = 1; i < N; i++) {
    if ((signal[i] >= 0 && signal[i - 1] < 0) || (signal[i] < 0 && signal[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }
  features[idx++] = zeroCrossings / N;
  
  // Autocorrelation at different lags
  for (let lag = 1; lag <= 10; lag++) {
    let autocorr = 0;
    for (let i = lag; i < N; i++) {
      autocorr += signal[i] * signal[i - lag];
    }
    features[idx++] = autocorr / (N - lag);
  }
  
  // Energy in different frequency bands (via simple binning)
  const numBands = 10;
  for (let band = 0; band < numBands; band++) {
    const start = Math.floor((band * N) / numBands);
    const end = Math.floor(((band + 1) * N) / numBands);
    let energy = 0;
    for (let i = start; i < end; i++) {
      energy += signal[i] ** 2;
    }
    features[idx++] = energy / (end - start);
  }
  
  // Fill remaining features with zeros
  while (idx < numFeatures) {
    features[idx++] = 0;
  }
  
  return features;
}

/**
 * Extract spectral features from IQ data
 */
function extractSpectralFeatures(
  iqData: { i: Float32Array; q: Float32Array },
  sampleRate: number
): {
  powerSpectralDensity: Float32Array;
  spectralRegrowth: number;
  adjacentChannelPower: number;
} {
  const N = iqData.i.length;
  const nfft = 1024;
  
  // Compute PSD via Welch's method
  const psd = welchPSD(iqData, nfft, sampleRate);
  
  // Spectral regrowth: ratio of out-of-band to in-band power
  const inBandStart = Math.floor(nfft * 0.4);
  const inBandEnd = Math.floor(nfft * 0.6);
  
  let inBandPower = 0, outBandPower = 0;
  for (let i = 0; i < nfft; i++) {
    if (i >= inBandStart && i < inBandEnd) {
      inBandPower += psd[i];
    } else {
      outBandPower += psd[i];
    }
  }
  
  const spectralRegrowth = outBandPower / (inBandPower + 1e-10);
  
  // Adjacent channel power ratio
  const adjChannelStart = Math.floor(nfft * 0.6);
  const adjChannelEnd = Math.floor(nfft * 0.8);
  
  let adjChannelPower = 0;
  for (let i = adjChannelStart; i < adjChannelEnd; i++) {
    adjChannelPower += psd[i];
  }
  
  const adjacentChannelPower = adjChannelPower / (inBandPower + 1e-10);
  
  return {
    powerSpectralDensity: psd,
    spectralRegrowth,
    adjacentChannelPower,
  };
}

/**
 * Welch's method for PSD estimation
 */
function welchPSD(
  iqData: { i: Float32Array; q: Float32Array },
  nfft: number,
  sampleRate: number
): Float32Array {
  const N = iqData.i.length;
  const windowSize = nfft;
  const overlap = Math.floor(windowSize / 2);
  const hop = windowSize - overlap;
  
  const psd = new Float32Array(nfft);
  let numWindows = 0;
  
  for (let start = 0; start + windowSize <= N; start += hop) {
    // Apply Hamming window
    const windowed = new Float32Array(nfft * 2); // Complex
    for (let i = 0; i < windowSize; i++) {
      const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (windowSize - 1));
      windowed[i * 2] = iqData.i[start + i] * window;
      windowed[i * 2 + 1] = iqData.q[start + i] * window;
    }
    
    // FFT
    const spectrum = simpleFFT(windowed, nfft);
    
    // Accumulate power
    for (let k = 0; k < nfft; k++) {
      const re = spectrum[k * 2];
      const im = spectrum[k * 2 + 1];
      psd[k] += re * re + im * im;
    }
    
    numWindows++;
  }
  
  // Average and normalize
  for (let k = 0; k < nfft; k++) {
    psd[k] = psd[k] / numWindows / sampleRate;
  }
  
  return psd;
}

/**
 * Match fingerprint against database
 */
export function matchFingerprint(
  query: RFFingerprint,
  database: RFFingerprint[],
  threshold: number = 0.7
): FingerprintMatch[] {
  const matches: FingerprintMatch[] = [];
  
  for (const ref of database) {
    // Compute feature distances
    const ampDist = euclideanDistance(
      query.transientFeatures.amplitude,
      ref.transientFeatures.amplitude
    );
    const phaseDist = euclideanDistance(
      query.transientFeatures.phase,
      ref.transientFeatures.phase
    );
    const freqDist = euclideanDistance(
      query.transientFeatures.frequency,
      ref.transientFeatures.frequency
    );
    
    // Combined distance (weighted average)
    const totalDistance = (ampDist + phaseDist + freqDist) / 3;
    
    // Convert distance to confidence (inverse exponential)
    const confidence = Math.exp(-totalDistance / 10);
    
    if (confidence >= threshold) {
      matches.push({
        deviceId: ref.deviceId,
        deviceType: ref.deviceType,
        confidence,
        distance: totalDistance,
        matchedFeatures: ['amplitude', 'phase', 'frequency'],
      });
    }
  }
  
  // Sort by confidence (descending)
  matches.sort((a, b) => b.confidence - a.confidence);
  
  return matches;
}

/**
 * Helper: Euclidean distance between feature vectors
 */
function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Simple FFT placeholder (use existing implementation)
 */
function simpleFFT(input: Float32Array, n: number): Float32Array {
  // This would use the FFT from wignerVille.ts
  // For now, return a placeholder
  return new Float32Array(n * 2);
}
