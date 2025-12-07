/**
 * Frequency Hopping Detection Module
 * 
 * Analyzes time-frequency patterns to detect frequency hopping sequences
 * and extract hop parameters (rate, dwell time, pattern)
 */

export interface FrequencyHop {
  time: number;        // Time of hop (seconds)
  frequency: number;   // Center frequency (Hz)
  duration: number;    // Dwell time (seconds)
  power: number;       // Signal power (dB)
}

export interface HoppingPattern {
  hops: FrequencyHop[];
  hopRate: number;           // Hops per second
  avgDwellTime: number;      // Average dwell time (seconds)
  frequencyRange: number;    // Total frequency span (Hz)
  uniqueFrequencies: number; // Number of distinct frequencies
  pattern: 'random' | 'sequential' | 'periodic' | 'unknown';
}

/**
 * Detect frequency hopping from spectrogram data
 * 
 * Algorithm:
 * 1. Compute time-frequency energy matrix
 * 2. Apply threshold to detect active frequencies
 * 3. Track frequency transitions over time
 * 4. Extract hop timing and dwell statistics
 * 5. Classify hopping pattern
 */
export function detectFrequencyHopping(
  spectrogram: Float32Array[],  // Array of FFT frames
  sampleRate: number,
  fftSize: number,
  hopSize: number,
  threshold: number = -60 // dB threshold for signal detection
): HoppingPattern | null {
  if (spectrogram.length < 2) {
    return null;
  }

  const hops: FrequencyHop[] = [];
  let currentFreq: number | null = null;
  let currentStartTime = 0;
  let currentPower = 0;

  const timeStep = hopSize / sampleRate;
  const freqBinWidth = sampleRate / fftSize;

  // Scan through spectrogram frames
  for (let frameIdx = 0; frameIdx < spectrogram.length; frameIdx++) {
    const frame = spectrogram[frameIdx];
    const time = frameIdx * timeStep;

    // Find peak frequency bin in this frame
    let maxBin = 0;
    let maxPower = -Infinity;

    for (let bin = 0; bin < frame.length; bin++) {
      const powerDb = 10 * Math.log10(frame[bin] + 1e-10);
      if (powerDb > maxPower && powerDb > threshold) {
        maxPower = powerDb;
        maxBin = bin;
      }
    }

    // Convert bin to frequency
    const peakFreq = maxBin * freqBinWidth - sampleRate / 2;

    // Detect frequency transition (hop)
    if (currentFreq === null) {
      // First hop
      currentFreq = peakFreq;
      currentStartTime = time;
      currentPower = maxPower;
    } else {
      const freqDiff = Math.abs(peakFreq - currentFreq);
      const isHop = freqDiff > freqBinWidth * 5; // Hop threshold: 5 bins

      if (isHop) {
        // Record previous hop
        hops.push({
          time: currentStartTime,
          frequency: currentFreq,
          duration: time - currentStartTime,
          power: currentPower,
        });

        // Start new hop
        currentFreq = peakFreq;
        currentStartTime = time;
        currentPower = maxPower;
      }
    }
  }

  // Record final hop
  if (currentFreq !== null && hops.length > 0) {
    const finalTime = (spectrogram.length - 1) * timeStep;
    hops.push({
      time: currentStartTime,
      frequency: currentFreq,
      duration: finalTime - currentStartTime,
      power: currentPower,
    });
  }

  if (hops.length < 2) {
    return null; // Not enough hops detected
  }

  // Calculate statistics
  const totalTime = hops[hops.length - 1].time + hops[hops.length - 1].duration - hops[0].time;
  const hopRate = (hops.length - 1) / totalTime;
  const avgDwellTime = hops.reduce((sum, hop) => sum + hop.duration, 0) / hops.length;

  const frequencies = hops.map(h => h.frequency);
  const minFreq = Math.min(...frequencies);
  const maxFreq = Math.max(...frequencies);
  const frequencyRange = maxFreq - minFreq;

  const uniqueFreqs = new Set(frequencies.map(f => Math.round(f / freqBinWidth))).size;

  // Classify pattern
  let pattern: 'random' | 'sequential' | 'periodic' | 'unknown' = 'unknown';

  // Check for periodic pattern (repeating sequence)
  const freqSequence = frequencies.map(f => Math.round(f / freqBinWidth));
  const isPeriodic = checkPeriodicity(freqSequence);
  if (isPeriodic) {
    pattern = 'periodic';
  } else {
    // Check for sequential pattern (monotonic increase/decrease)
    const isSequential = checkSequential(freqSequence);
    if (isSequential) {
      pattern = 'sequential';
    } else {
      pattern = 'random';
    }
  }

  return {
    hops,
    hopRate,
    avgDwellTime,
    frequencyRange,
    uniqueFrequencies: uniqueFreqs,
    pattern,
  };
}

/**
 * Check if frequency sequence is periodic (repeating pattern)
 */
function checkPeriodicity(sequence: number[]): boolean {
  if (sequence.length < 6) return false;

  // Try different period lengths
  for (let period = 2; period <= sequence.length / 2; period++) {
    let matches = 0;
    let total = 0;

    for (let i = period; i < sequence.length; i++) {
      const expected = sequence[i % period];
      const actual = sequence[i];
      total++;
      if (Math.abs(expected - actual) <= 1) {
        matches++;
      }
    }

    const matchRate = matches / total;
    if (matchRate > 0.8) {
      return true; // 80% match indicates periodicity
    }
  }

  return false;
}

/**
 * Check if frequency sequence is sequential (monotonic)
 */
function checkSequential(sequence: number[]): boolean {
  if (sequence.length < 3) return false;

  let increasing = 0;
  let decreasing = 0;

  for (let i = 1; i < sequence.length; i++) {
    if (sequence[i] > sequence[i - 1]) increasing++;
    if (sequence[i] < sequence[i - 1]) decreasing++;
  }

  const total = sequence.length - 1;
  const increasingRate = increasing / total;
  const decreasingRate = decreasing / total;

  return increasingRate > 0.7 || decreasingRate > 0.7;
}

/**
 * Generate visualization data for hop pattern
 */
export function generateHopVisualization(pattern: HoppingPattern): {
  times: number[];
  frequencies: number[];
  powers: number[];
} {
  return {
    times: pattern.hops.map(h => h.time),
    frequencies: pattern.hops.map(h => h.frequency),
    powers: pattern.hops.map(h => h.power),
  };
}
