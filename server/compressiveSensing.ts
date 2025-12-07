/**
 * Compressive Sensing Algorithms
 * Sparse signal reconstruction from undersampled measurements
 */

export interface CompressiveSensingResult {
  reconstructed: Float32Array;
  iterations: number;
  residualNorm: number;
  sparsity: number;
}

/**
 * Orthogonal Matching Pursuit (OMP)
 * Greedy algorithm for sparse approximation
 */
export function orthogonalMatchingPursuit(
  measurements: Float32Array,
  sensingMatrix: Float32Array,
  sparsityLevel: number,
  maxIterations: number = 100
): CompressiveSensingResult {
  const m = measurements.length;
  const n = Math.floor(sensingMatrix.length / m);
  
  const residual = new Float32Array(measurements);
  const support: number[] = [];
  const reconstructed = new Float32Array(n);
  
  for (let iter = 0; iter < Math.min(sparsityLevel, maxIterations); iter++) {
    // Find column with maximum correlation to residual
    let maxCorr = 0;
    let maxIdx = 0;
    
    for (let j = 0; j < n; j++) {
      if (support.includes(j)) continue;
      
      let corr = 0;
      for (let i = 0; i < m; i++) {
        corr += residual[i] * sensingMatrix[i * n + j];
      }
      
      const absCorr = Math.abs(corr);
      if (absCorr > maxCorr) {
        maxCorr = absCorr;
        maxIdx = j;
      }
    }
    
    support.push(maxIdx);
    
    // Least squares on support
    const supportMatrix: number[][] = [];
    for (let i = 0; i < m; i++) {
      const row: number[] = [];
      for (const j of support) {
        row.push(sensingMatrix[i * n + j]);
      }
      supportMatrix.push(row);
    }
    
    const coeffs = leastSquares(supportMatrix, Array.from(measurements));
    
    // Update reconstructed signal
    reconstructed.fill(0);
    for (let k = 0; k < support.length; k++) {
      reconstructed[support[k]] = coeffs[k];
    }
    
    // Update residual
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let k = 0; k < support.length; k++) {
        sum += sensingMatrix[i * n + support[k]] * coeffs[k];
      }
      residual[i] = measurements[i] - sum;
    }
  }
  
  const residualNorm = Math.sqrt(residual.reduce((sum, val) => sum + val * val, 0));
  
  return {
    reconstructed,
    iterations: support.length,
    residualNorm,
    sparsity: support.length,
  };
}

/**
 * Compressive Sampling Matching Pursuit (CoSaMP)
 * Improved version of OMP with backtracking
 */
export function compressiveSamplingMatchingPursuit(
  measurements: Float32Array,
  sensingMatrix: Float32Array,
  sparsityLevel: number,
  maxIterations: number = 100
): CompressiveSensingResult {
  const m = measurements.length;
  const n = Math.floor(sensingMatrix.length / m);
  
  let residual = new Float32Array(measurements);
  let reconstructed = new Float32Array(n);
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Identify 2*sparsityLevel largest components
    const proxy = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      let corr = 0;
      for (let i = 0; i < m; i++) {
        corr += residual[i] * sensingMatrix[i * n + j];
      }
      proxy[j] = Math.abs(corr);
    }
    
    const indices = Array.from({length: n}, (_, i) => i)
      .sort((a, b) => proxy[b] - proxy[a])
      .slice(0, 2 * sparsityLevel);
    
    // Least squares on expanded support
    const supportMatrix: number[][] = [];
    for (let i = 0; i < m; i++) {
      const row: number[] = [];
      for (const j of indices) {
        row.push(sensingMatrix[i * n + j]);
      }
      supportMatrix.push(row);
    }
    
    const coeffs = leastSquares(supportMatrix, Array.from(measurements));
    
    // Prune to sparsityLevel largest coefficients
    const absCoeffs = coeffs.map((c, i) => ({val: Math.abs(c), idx: indices[i], coeff: c}));
    absCoeffs.sort((a, b) => b.val - a.val);
    
    const newReconstructed = new Float32Array(n);
    for (let k = 0; k < Math.min(sparsityLevel, absCoeffs.length); k++) {
      newReconstructed[absCoeffs[k].idx] = absCoeffs[k].coeff;
    }
    
    // Update residual
    const newResidual = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        sum += sensingMatrix[i * n + j] * newReconstructed[j];
      }
      newResidual[i] = measurements[i] - sum;
    }
    
    // Check convergence
    const change = Math.sqrt(
      newReconstructed.reduce((sum, val, idx) => sum + Math.pow(val - reconstructed[idx], 2), 0)
    );
    
    reconstructed = newReconstructed;
    residual = newResidual;
    
    if (change < 1e-6) break;
  }
  
  const residualNorm = Math.sqrt(residual.reduce((sum, val) => sum + val * val, 0));
  const sparsity = reconstructed.filter(x => Math.abs(x) > 1e-6).length;
  
  return {
    reconstructed,
    iterations: maxIterations,
    residualNorm,
    sparsity,
  };
}

/**
 * LASSO (Least Absolute Shrinkage and Selection Operator)
 * L1-regularized least squares via coordinate descent
 */
export function lasso(
  measurements: Float32Array,
  sensingMatrix: Float32Array,
  lambda: number,
  maxIterations: number = 1000
): CompressiveSensingResult {
  const m = measurements.length;
  const n = Math.floor(sensingMatrix.length / m);
  
  const reconstructed = new Float32Array(n);
  
  for (let iter = 0; iter < maxIterations; iter++) {
    let maxChange = 0;
    
    for (let j = 0; j < n; j++) {
      // Compute partial residual
      let partialResidual = 0;
      for (let i = 0; i < m; i++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          if (k !== j) {
            sum += sensingMatrix[i * n + k] * reconstructed[k];
          }
        }
        partialResidual += sensingMatrix[i * n + j] * (measurements[i] - sum);
      }
      
      // Compute column norm squared
      let normSq = 0;
      for (let i = 0; i < m; i++) {
        normSq += sensingMatrix[i * n + j] * sensingMatrix[i * n + j];
      }
      
      // Soft thresholding
      const oldVal = reconstructed[j];
      if (partialResidual > lambda) {
        reconstructed[j] = (partialResidual - lambda) / normSq;
      } else if (partialResidual < -lambda) {
        reconstructed[j] = (partialResidual + lambda) / normSq;
      } else {
        reconstructed[j] = 0;
      }
      
      maxChange = Math.max(maxChange, Math.abs(reconstructed[j] - oldVal));
    }
    
    if (maxChange < 1e-6) break;
  }
  
  // Compute residual
  const residual = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += sensingMatrix[i * n + j] * reconstructed[j];
    }
    residual[i] = measurements[i] - sum;
  }
  
  const residualNorm = Math.sqrt(residual.reduce((sum, val) => sum + val * val, 0));
  const sparsity = reconstructed.filter(x => Math.abs(x) > 1e-6).length;
  
  return {
    reconstructed,
    iterations: maxIterations,
    residualNorm,
    sparsity,
  };
}

/**
 * FISTA (Fast Iterative Shrinkage-Thresholding Algorithm)
 * Accelerated proximal gradient method for L1 minimization
 */
export function fista(
  measurements: Float32Array,
  sensingMatrix: Float32Array,
  lambda: number,
  maxIterations: number = 1000
): CompressiveSensingResult {
  const m = measurements.length;
  const n = Math.floor(sensingMatrix.length / m);
  
  let x = new Float32Array(n);
  let y = new Float32Array(n);
  let t = 1;
  
  // Compute Lipschitz constant (largest eigenvalue of A^T A)
  let L = 0;
  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < m; i++) {
      sum += sensingMatrix[i * n + j] * sensingMatrix[i * n + j];
    }
    L = Math.max(L, sum);
  }
  const stepSize = 1 / L;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Gradient step
    const gradient = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < m; i++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += sensingMatrix[i * n + k] * y[k];
        }
        gradient[j] += sensingMatrix[i * n + j] * (sum - measurements[i]);
      }
    }
    
    // Proximal step (soft thresholding)
    const xNew = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const val = y[j] - stepSize * gradient[j];
      const threshold = lambda * stepSize;
      if (val > threshold) {
        xNew[j] = val - threshold;
      } else if (val < -threshold) {
        xNew[j] = val + threshold;
      } else {
        xNew[j] = 0;
      }
    }
    
    // Acceleration
    const tNew = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
    const factor = (t - 1) / tNew;
    
    for (let j = 0; j < n; j++) {
      y[j] = xNew[j] + factor * (xNew[j] - x[j]);
    }
    
    // Check convergence
    const change = Math.sqrt(
      xNew.reduce((sum, val, idx) => sum + Math.pow(val - x[idx], 2), 0)
    );
    
    x = xNew;
    t = tNew;
    
    if (change < 1e-6) break;
  }
  
  // Compute residual
  const residual = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += sensingMatrix[i * n + j] * x[j];
    }
    residual[i] = measurements[i] - sum;
  }
  
  const residualNorm = Math.sqrt(residual.reduce((sum, val) => sum + val * val, 0));
  const sparsity = x.filter(val => Math.abs(val) > 1e-6).length;
  
  return {
    reconstructed: x,
    iterations: maxIterations,
    residualNorm,
    sparsity,
  };
}

/**
 * Least squares solver using QR decomposition
 */
function leastSquares(A: number[][], b: number[]): number[] {
  const m = A.length;
  const n = A[0].length;
  
  // Simple pseudo-inverse for small matrices
  // For production, use proper QR or SVD decomposition
  const AtA: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  const Atb: number[] = Array(n).fill(0);
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < m; k++) {
        AtA[i][j] += A[k][i] * A[k][j];
      }
    }
    for (let k = 0; k < m; k++) {
      Atb[i] += A[k][i] * b[k];
    }
  }
  
  // Solve using Gaussian elimination
  return gaussianElimination(AtA, Atb);
}

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);
  
  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Partial pivoting
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    
    // Eliminate column
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }
  
  // Back substitution
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j];
    }
    x[i] /= augmented[i][i];
  }
  
  return x;
}
