/**
 * SCF Cross-Section Extraction
 * 
 * Extracts 2D slices from 3D Spectral Correlation Function (SCF) data
 * along alpha (cyclic frequency) or tau (lag) axes.
 */

export interface SCFData {
  alpha: number[];  // Cyclic frequency axis
  tau: number[];    // Lag axis
  scf: number[][];  // SCF magnitude [alpha_idx][tau_idx]
}

export interface CrossSectionResult {
  axis: number[];       // Independent variable (tau for alpha-slice, alpha for tau-slice)
  values: number[];     // SCF magnitude along the slice
  slicePosition: number; // Position of the slice plane
  sliceType: 'alpha' | 'tau';
}

/**
 * Extract cross-section at fixed alpha (cyclic frequency)
 * Returns SCF magnitude as a function of tau
 */
export function extractAlphaSlice(
  scfData: SCFData,
  alphaValue: number,
  interpolate: boolean = true
): CrossSectionResult {
  const { alpha, tau, scf } = scfData;

  if (alpha.length === 0 || tau.length === 0) {
    throw new Error('Empty SCF data');
  }

  // Find closest alpha index or interpolate
  if (!interpolate) {
    // Nearest neighbor
    const alphaIdx = findNearestIndex(alpha, alphaValue);
    
    return {
      axis: [...tau],
      values: scf[alphaIdx].map(v => v),
      slicePosition: alpha[alphaIdx],
      sliceType: 'alpha',
    };
  }

  // Linear interpolation between two alpha values
  const { lowerIdx, upperIdx, weight } = findInterpolationIndices(alpha, alphaValue);
  
  if (lowerIdx === upperIdx) {
    // Exact match
    return {
      axis: [...tau],
      values: scf[lowerIdx].map(v => v),
      slicePosition: alpha[lowerIdx],
      sliceType: 'alpha',
    };
  }

  // Interpolate between two alpha slices
  const interpolatedValues = tau.map((_, tauIdx) => {
    const lowerValue = scf[lowerIdx][tauIdx];
    const upperValue = scf[upperIdx][tauIdx];
    return lowerValue * (1 - weight) + upperValue * weight;
  });

  return {
    axis: [...tau],
    values: interpolatedValues,
    slicePosition: alphaValue,
    sliceType: 'alpha',
  };
}

/**
 * Extract cross-section at fixed tau (lag)
 * Returns SCF magnitude as a function of alpha
 */
export function extractTauSlice(
  scfData: SCFData,
  tauValue: number,
  interpolate: boolean = true
): CrossSectionResult {
  const { alpha, tau, scf } = scfData;

  if (alpha.length === 0 || tau.length === 0) {
    throw new Error('Empty SCF data');
  }

  // Find closest tau index or interpolate
  if (!interpolate) {
    // Nearest neighbor
    const tauIdx = findNearestIndex(tau, tauValue);
    
    return {
      axis: [...alpha],
      values: scf.map(alphaSlice => alphaSlice[tauIdx]),
      slicePosition: tau[tauIdx],
      sliceType: 'tau',
    };
  }

  // Linear interpolation between two tau values
  const { lowerIdx, upperIdx, weight } = findInterpolationIndices(tau, tauValue);
  
  if (lowerIdx === upperIdx) {
    // Exact match
    return {
      axis: [...alpha],
      values: scf.map(alphaSlice => alphaSlice[lowerIdx]),
      slicePosition: tau[lowerIdx],
      sliceType: 'tau',
    };
  }

  // Interpolate between two tau slices
  const interpolatedValues = alpha.map((_, alphaIdx) => {
    const lowerValue = scf[alphaIdx][lowerIdx];
    const upperValue = scf[alphaIdx][upperIdx];
    return lowerValue * (1 - weight) + upperValue * weight;
  });

  return {
    axis: [...alpha],
    values: interpolatedValues,
    slicePosition: tauValue,
    sliceType: 'tau',
  };
}

/**
 * Find nearest index in sorted array
 */
function findNearestIndex(arr: number[], value: number): number {
  if (value <= arr[0]) return 0;
  if (value >= arr[arr.length - 1]) return arr.length - 1;

  let minDist = Infinity;
  let nearestIdx = 0;

  for (let i = 0; i < arr.length; i++) {
    const dist = Math.abs(arr[i] - value);
    if (dist < minDist) {
      minDist = dist;
      nearestIdx = i;
    }
  }

  return nearestIdx;
}

/**
 * Find interpolation indices and weight for linear interpolation
 */
function findInterpolationIndices(
  arr: number[],
  value: number
): { lowerIdx: number; upperIdx: number; weight: number } {
  // Handle edge cases
  if (value <= arr[0]) {
    return { lowerIdx: 0, upperIdx: 0, weight: 0 };
  }
  if (value >= arr[arr.length - 1]) {
    const lastIdx = arr.length - 1;
    return { lowerIdx: lastIdx, upperIdx: lastIdx, weight: 0 };
  }

  // Binary search for bracketing indices
  let left = 0;
  let right = arr.length - 1;

  while (right - left > 1) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] <= value) {
      left = mid;
    } else {
      right = mid;
    }
  }

  const lowerIdx = left;
  const upperIdx = right;
  const lowerValue = arr[lowerIdx];
  const upperValue = arr[upperIdx];

  // Calculate interpolation weight
  const weight = (value - lowerValue) / (upperValue - lowerValue);

  return { lowerIdx, upperIdx, weight };
}

/**
 * Extract multiple cross-sections at regular intervals
 */
export function extractMultipleAlphaSlices(
  scfData: SCFData,
  alphaStart: number,
  alphaEnd: number,
  numSlices: number,
  interpolate: boolean = true
): CrossSectionResult[] {
  const alphaValues = linspace(alphaStart, alphaEnd, numSlices);
  return alphaValues.map(alpha => extractAlphaSlice(scfData, alpha, interpolate));
}

/**
 * Extract multiple tau slices at regular intervals
 */
export function extractMultipleTauSlices(
  scfData: SCFData,
  tauStart: number,
  tauEnd: number,
  numSlices: number,
  interpolate: boolean = true
): CrossSectionResult[] {
  const tauValues = linspace(tauStart, tauEnd, numSlices);
  return tauValues.map(tau => extractTauSlice(scfData, tau, interpolate));
}

/**
 * Generate linearly spaced array
 */
function linspace(start: number, end: number, num: number): number[] {
  if (num <= 1) return [start];
  
  const step = (end - start) / (num - 1);
  return Array.from({ length: num }, (_, i) => start + i * step);
}

/**
 * Find peak in cross-section
 */
export function findCrossSectionPeak(crossSection: CrossSectionResult): {
  position: number;
  magnitude: number;
  index: number;
} {
  let maxMagnitude = -Infinity;
  let maxIndex = 0;

  for (let i = 0; i < crossSection.values.length; i++) {
    if (crossSection.values[i] > maxMagnitude) {
      maxMagnitude = crossSection.values[i];
      maxIndex = i;
    }
  }

  return {
    position: crossSection.axis[maxIndex],
    magnitude: maxMagnitude,
    index: maxIndex,
  };
}

/**
 * Calculate cross-section statistics
 */
export function calculateCrossSectionStats(crossSection: CrossSectionResult): {
  mean: number;
  max: number;
  min: number;
  peakPosition: number;
  peakMagnitude: number;
} {
  const values = crossSection.values;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const peak = findCrossSectionPeak(crossSection);

  return {
    mean,
    max,
    min,
    peakPosition: peak.position,
    peakMagnitude: peak.magnitude,
  };
}

/**
 * Export cross-section to CSV format
 */
export function crossSectionToCSV(crossSection: CrossSectionResult): string {
  const header = crossSection.sliceType === 'alpha'
    ? `Tau,SCF_Magnitude,Alpha=${crossSection.slicePosition}\n`
    : `Alpha,SCF_Magnitude,Tau=${crossSection.slicePosition}\n`;

  const rows = crossSection.axis.map((axisValue, i) => 
    `${axisValue},${crossSection.values[i]}`
  ).join('\n');

  return header + rows;
}
