/**
 * Compressive Sensing Algorithms for Sparse Signal Recovery
 * 
 * Implements state-of-the-art sparse reconstruction algorithms:
 * - Orthogonal Matching Pursuit (OMP)
 * - Compressive Sampling Matching Pursuit (CoSaMP)
 * - Least Absolute Shrinkage and Selection Operator (LASSO)
 * - Fast Iterative Shrinkage-Thresholding Algorithm (FISTA)
 */

export interface CompressiveSensingResult {
  reconstructed: Float32Array;
  support: number[]; // Indices of non-zero elements
  iterations: number;
  residualNorm: number;
}

/**
 * Orthogonal Matching Pursuit (OMP)
 * Greedy algorithm for sparse signal recovery
 */
export function orthogonalMatchingPursuit(
  measurements: Float32Array,
  sensingMatrix: Float32Array[], // Each row is a sensing vector
  sparsity: number,
  maxIterations: number = 100
): CompressiveSensingResult {
  const m = measurements.length; // Number of measurements
  const n = sensingMatrix[0].length; // Signal dimension
  
  const support: number[] = [];
  const residual = new Float32Array(measurements);
  let iterations = 0;
  
  while (support.length < sparsity && iterations < maxIterations) {
    iterations++;
    
    // Find index with maximum correlation
    let maxCorr = 0;
    let maxIdx = -1;
    
    for (let j = 0; j < n; j++) {
      if (support.includes(j)) continue;
      
      let corr = 0;
      for (let i = 0; i < m; i++) {
        corr += residual[i] * sensingMatrix[i][j];
      }
      
      const absCorr = Math.abs(corr);
      if (absCorr > maxCorr) {
        maxCorr = absCorr;
        maxIdx = j;
      }
    }
    
    if (maxIdx === -1) break;
    
    support.push(maxIdx);
    
    // Solve least squares on support
    const reconstructed = leastSquaresOnSupport(measurements, sensingMatrix, support);
    
    // Update residual
    for (let i = 0; i < m; i++) {
      let prediction = 0;
      for (const idx of support) {
        prediction += sensingMatrix[i][idx] * reconstructed[idx];
      }
      residual[i] = measurements[i] - prediction;
    }
  }
  
  const reconstructed = leastSquaresOnSupport(measurements, sensingMatrix, support);
  const residualNorm = norm(residual);
  
  return { reconstructed, support, iterations, residualNorm };
}

/**
 * Compressive Sampling Matching Pursuit (CoSaMP)
 * More robust than OMP with backtracking
 */
export function compressiveSamplingMP(
  measurements: Float32Array,
  sensingMatrix: Float32Array[],
  sparsity: number,
  maxIterations: number = 100,
  tolerance: number = 1e-6
): CompressiveSensingResult {
  const m = measurements.length;
  const n = sensingMatrix[0].length;
  
  let x = new Float32Array(n); // Current estimate
  let residual = new Float32Array(measurements);
  let iterations = 0;
  
  while (iterations < maxIterations) {
    iterations++;
    
    // Compute proxy: A^T * residual
    const proxy = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < m; i++) {
        proxy[j] += sensingMatrix[i][j] * residual[i];
      }
    }
    
    // Identify 2*sparsity largest elements
    const indices = argTopK(proxy, 2 * sparsity);
    
    // Merge with current support
    const support = new Set<number>();
    for (let j = 0; j < n; j++) {
      if (Math.abs(x[j]) > 1e-10) support.add(j);
    }
    for (const idx of indices) {
      support.add(idx);
    }
    
    // Solve least squares on merged support
    const supportArray = Array.from(support);
    const xMerged = leastSquaresOnSupport(measurements, sensingMatrix, supportArray);
    
    // Prune to sparsity largest elements
    const pruned = argTopK(xMerged, sparsity);
    
    x = new Float32Array(n);
    for (const idx of pruned) {
      x[idx] = xMerged[idx];
    }
    
    // Update residual
    for (let i = 0; i < m; i++) {
      let prediction = 0;
      for (let j = 0; j < n; j++) {
        prediction += sensingMatrix[i][j] * x[j];
      }
      residual[i] = measurements[i] - prediction;
    }
    
    const residualNorm = norm(residual);
    if (residualNorm < tolerance) break;
  }
  
  const support: number[] = [];
  for (let j = 0; j < n; j++) {
    if (Math.abs(x[j]) > 1e-10) support.push(j);
  }
  
  return {
    reconstructed: x,
    support,
    iterations,
    residualNorm: norm(residual),
  };
}

/**
 * LASSO (Least Absolute Shrinkage and Selection Operator)
 * L1-regularized least squares via coordinate descent
 */
export function lasso(
  measurements: Float32Array,
  sensingMatrix: Float32Array[],
  lambda: number = 0.1,
  maxIterations: number = 1000,
  tolerance: number = 1e-6
): CompressiveSensingResult {
  const m = measurements.length;
  const n = sensingMatrix[0].length;
  
  let x = new Float32Array(n);
  let iterations = 0;
  
  // Precompute A^T * A diagonal and A^T * y
  const AtA_diag = new Float32Array(n);
  const Aty = new Float32Array(n);
  
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < m; i++) {
      AtA_diag[j] += sensingMatrix[i][j] * sensingMatrix[i][j];
      Aty[j] += sensingMatrix[i][j] * measurements[i];
    }
  }
  
  // Coordinate descent
  for (iterations = 0; iterations < maxIterations; iterations++) {
    const xOld = new Float32Array(x);
    
    for (let j = 0; j < n; j++) {
      // Compute residual without j-th component
      let rho = Aty[j];
      for (let k = 0; k < n; k++) {
        if (k !== j) {
          let AtA_jk = 0;
          for (let i = 0; i < m; i++) {
            AtA_jk += sensingMatrix[i][j] * sensingMatrix[i][k];
          }
          rho -= AtA_jk * x[k];
        }
      }
      
      // Soft thresholding
      x[j] = softThreshold(rho, lambda) / AtA_diag[j];
    }
    
    // Check convergence
    let diff = 0;
    for (let j = 0; j < n; j++) {
      diff += (x[j] - xOld[j]) ** 2;
    }
    
    if (Math.sqrt(diff) < tolerance) break;
  }
  
  // Compute residual
  const residual = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    let prediction = 0;
    for (let j = 0; j < n; j++) {
      prediction += sensingMatrix[i][j] * x[j];
    }
    residual[i] = measurements[i] - prediction;
  }
  
  const support: number[] = [];
  for (let j = 0; j < n; j++) {
    if (Math.abs(x[j]) > 1e-10) support.push(j);
  }
  
  return {
    reconstructed: x,
    support,
    iterations,
    residualNorm: norm(residual),
  };
}

/**
 * FISTA (Fast Iterative Shrinkage-Thresholding Algorithm)
 * Accelerated proximal gradient method for LASSO
 */
export function fista(
  measurements: Float32Array,
  sensingMatrix: Float32Array[],
  lambda: number = 0.1,
  maxIterations: number = 1000,
  tolerance: number = 1e-6
): CompressiveSensingResult {
  const m = measurements.length;
  const n = sensingMatrix[0].length;
  
  let x = new Float32Array(n);
  let y = new Float32Array(n);
  let t = 1;
  
  // Compute Lipschitz constant (largest eigenvalue of A^T A)
  let L = 0;
  for (let j = 0; j < n; j++) {
    let colNorm = 0;
    for (let i = 0; i < m; i++) {
      colNorm += sensingMatrix[i][j] ** 2;
    }
    L = Math.max(L, colNorm);
  }
  
  const stepSize = 1 / L;
  let iterations = 0;
  
  for (iterations = 0; iterations < maxIterations; iterations++) {
    const xOld = new Float32Array(x);
    
    // Compute gradient at y: A^T (A*y - b)
    const gradient = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < m; i++) {
        let Ay = 0;
        for (let k = 0; k < n; k++) {
          Ay += sensingMatrix[i][k] * y[k];
        }
        gradient[j] += sensingMatrix[i][j] * (Ay - measurements[i]);
      }
    }
    
    // Proximal gradient step with soft thresholding
    for (let j = 0; j < n; j++) {
      x[j] = softThreshold(y[j] - stepSize * gradient[j], lambda * stepSize);
    }
    
    // Nesterov momentum
    const tNew = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
    const momentum = (t - 1) / tNew;
    
    for (let j = 0; j < n; j++) {
      y[j] = x[j] + momentum * (x[j] - xOld[j]);
    }
    
    t = tNew;
    
    // Check convergence
    let diff = 0;
    for (let j = 0; j < n; j++) {
      diff += (x[j] - xOld[j]) ** 2;
    }
    
    if (Math.sqrt(diff) < tolerance) break;
  }
  
  // Compute residual
  const residual = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    let prediction = 0;
    for (let j = 0; j < n; j++) {
      prediction += sensingMatrix[i][j] * x[j];
    }
    residual[i] = measurements[i] - prediction;
  }
  
  const support: number[] = [];
  for (let j = 0; j < n; j++) {
    if (Math.abs(x[j]) > 1e-10) support.push(j);
  }
  
  return {
    reconstructed: x,
    support,
    iterations,
    residualNorm: norm(residual),
  };
}

/**
 * Helper: Soft thresholding operator
 */
function softThreshold(x: number, threshold: number): number {
  if (x > threshold) return x - threshold;
  if (x < -threshold) return x + threshold;
  return 0;
}

/**
 * Helper: Solve least squares on support set
 */
function leastSquaresOnSupport(
  measurements: Float32Array,
  sensingMatrix: Float32Array[],
  support: number[]
): Float32Array {
  const m = measurements.length;
  const n = sensingMatrix[0].length;
  const k = support.length;
  
  if (k === 0) return new Float32Array(n);
  
  // Build restricted matrix A_S
  const A_S: number[][] = [];
  for (let i = 0; i < m; i++) {
    const row: number[] = [];
    for (const j of support) {
      row.push(sensingMatrix[i][j]);
    }
    A_S.push(row);
  }
  
  // Solve A_S^T A_S x_S = A_S^T y using normal equations
  const AtA = Array(k).fill(0).map(() => Array(k).fill(0));
  const Aty = Array(k).fill(0);
  
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      for (let row = 0; row < m; row++) {
        AtA[i][j] += A_S[row][i] * A_S[row][j];
      }
    }
    for (let row = 0; row < m; row++) {
      Aty[i] += A_S[row][i] * measurements[row];
    }
  }
  
  // Solve using Cholesky decomposition
  const x_S = choleskysolve(AtA, Aty);
  
  // Expand to full dimension
  const x = new Float32Array(n);
  for (let i = 0; i < k; i++) {
    x[support[i]] = x_S[i];
  }
  
  return x;
}

/**
 * Helper: Find indices of top-k largest magnitude elements
 */
function argTopK(array: Float32Array, k: number): number[] {
  const indexed = Array.from(array).map((val, idx) => ({ val: Math.abs(val), idx }));
  indexed.sort((a, b) => b.val - a.val);
  return indexed.slice(0, k).map(item => item.idx);
}

/**
 * Helper: Compute L2 norm
 */
function norm(array: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < array.length; i++) {
    sum += array[i] ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Helper: Solve Ax = b using Cholesky decomposition
 */
function choleskysolve(A: number[][], b: number[]): number[] {
  const n = A.length;
  
  // Cholesky decomposition: A = L L^T
  const L = Array(n).fill(0).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(A[i][i] - sum, 1e-10));
      } else {
        L[i][j] = (A[i][j] - sum) / L[j][j];
      }
    }
  }
  
  // Forward substitution: L y = b
  const y = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < i; j++) {
      sum += L[i][j] * y[j];
    }
    y[i] = (b[i] - sum) / L[i][i];
  }
  
  // Backward substitution: L^T x = y
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += L[j][i] * x[j];
    }
    x[i] = (y[i] - sum) / L[i][i];
  }
  
  return x;
}
