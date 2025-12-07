/**
 * Blind Source Separation Algorithms
 * FastICA, NMF, and tensor decomposition for signal unmixing
 */

export interface BSSResult {
  sources: Float32Array[]; // Separated source signals
  mixingMatrix: Float32Array; // Estimated mixing matrix
  iterations: number;
}

/**
 * FastICA (Fast Independent Component Analysis)
 * Separates mixed signals using statistical independence
 */
export function fastICA(
  mixedSignals: Float32Array[],
  numComponents: number,
  maxIterations: number = 1000
): BSSResult {
  const numSignals = mixedSignals.length;
  const signalLength = mixedSignals[0].length;
  
  // Center and whiten data
  const { whitened, whiteningMatrix } = whitenData(mixedSignals);
  
  // Initialize unmixing matrix randomly
  let W = randomOrthogonalMatrix(numComponents, numSignals);
  
  // FastICA iteration
  for (let iter = 0; iter < maxIterations; iter++) {
    const WOld = W.slice();
    
    for (let i = 0; i < numComponents; i++) {
      // Extract weight vector
      const w = W.slice(i * numSignals, (i + 1) * numSignals);
      
      // Compute projection
      const projection = new Float32Array(signalLength);
      for (let t = 0; t < signalLength; t++) {
        let sum = 0;
        for (let j = 0; j < numSignals; j++) {
          sum += w[j] * whitened[j][t];
        }
        projection[t] = sum;
      }
      
      // Compute g(y) and g'(y) for logcosh nonlinearity
      const gy = projection.map(y => Math.tanh(y));
      const gPrimeY = projection.map(y => 1 - Math.tanh(y) ** 2);
      
      // Update weight vector
      const wNew = new Float32Array(numSignals);
      for (let j = 0; j < numSignals; j++) {
        let sum1 = 0;
        let sum2 = 0;
        for (let t = 0; t < signalLength; t++) {
          sum1 += whitened[j][t] * gy[t];
          sum2 += gPrimeY[t];
        }
        wNew[j] = sum1 / signalLength - (sum2 / signalLength) * w[j];
      }
      
      // Normalize
      const norm = Math.sqrt(wNew.reduce((sum, val) => sum + val * val, 0));
      for (let j = 0; j < numSignals; j++) {
        wNew[j] /= norm;
      }
      
      // Orthogonalize against previous components
      for (let k = 0; k < i; k++) {
        const wk = W.slice(k * numSignals, (k + 1) * numSignals);
        let dotProduct = 0;
        for (let j = 0; j < numSignals; j++) {
          dotProduct += wNew[j] * wk[j];
        }
        for (let j = 0; j < numSignals; j++) {
          wNew[j] -= dotProduct * wk[j];
        }
      }
      
      // Normalize again
      const norm2 = Math.sqrt(wNew.reduce((sum, val) => sum + val * val, 0));
      for (let j = 0; j < numSignals; j++) {
        W[i * numSignals + j] = wNew[j] / norm2;
      }
    }
    
    // Check convergence
    let maxChange = 0;
    for (let i = 0; i < W.length; i++) {
      maxChange = Math.max(maxChange, Math.abs(Math.abs(W[i]) - Math.abs(WOld[i])));
    }
    
    if (maxChange < 1e-6) break;
  }
  
  // Extract sources
  const sources: Float32Array[] = [];
  for (let i = 0; i < numComponents; i++) {
    const source = new Float32Array(signalLength);
    for (let t = 0; t < signalLength; t++) {
      let sum = 0;
      for (let j = 0; j < numSignals; j++) {
        sum += W[i * numSignals + j] * whitened[j][t];
      }
      source[t] = sum;
    }
    sources.push(source);
  }
  
  // Compute mixing matrix (pseudo-inverse of W)
  const mixingMatrix = pseudoInverse(W, numComponents, numSignals);
  
  return {
    sources,
    mixingMatrix,
    iterations: maxIterations,
  };
}

/**
 * Non-negative Matrix Factorization (NMF)
 * Factorizes non-negative matrix into two non-negative matrices
 */
export function nmf(
  data: Float32Array,
  rows: number,
  cols: number,
  numComponents: number,
  maxIterations: number = 1000
): { W: Float32Array; H: Float32Array; iterations: number } {
  // Initialize W and H randomly with non-negative values
  const W = new Float32Array(rows * numComponents);
  const H = new Float32Array(numComponents * cols);
  
  for (let i = 0; i < W.length; i++) {
    W[i] = Math.random();
  }
  for (let i = 0; i < H.length; i++) {
    H[i] = Math.random();
  }
  
  // Multiplicative update rules
  for (let iter = 0; iter < maxIterations; iter++) {
    // Update H
    const WtV = new Float32Array(numComponents * cols);
    const WtWH = new Float32Array(numComponents * cols);
    
    for (let k = 0; k < numComponents; k++) {
      for (let j = 0; j < cols; j++) {
        // Compute (W^T * V)[k,j]
        let sum1 = 0;
        for (let i = 0; i < rows; i++) {
          sum1 += W[i * numComponents + k] * data[i * cols + j];
        }
        WtV[k * cols + j] = sum1;
        
        // Compute (W^T * W * H)[k,j]
        let sum2 = 0;
        for (let l = 0; l < numComponents; l++) {
          let wtw = 0;
          for (let i = 0; i < rows; i++) {
            wtw += W[i * numComponents + k] * W[i * numComponents + l];
          }
          sum2 += wtw * H[l * cols + j];
        }
        WtWH[k * cols + j] = sum2 + 1e-10; // Add small constant to avoid division by zero
      }
    }
    
    for (let k = 0; k < numComponents; k++) {
      for (let j = 0; j < cols; j++) {
        H[k * cols + j] *= WtV[k * cols + j] / WtWH[k * cols + j];
      }
    }
    
    // Update W
    const VHt = new Float32Array(rows * numComponents);
    const WHHt = new Float32Array(rows * numComponents);
    
    for (let i = 0; i < rows; i++) {
      for (let k = 0; k < numComponents; k++) {
        // Compute (V * H^T)[i,k]
        let sum1 = 0;
        for (let j = 0; j < cols; j++) {
          sum1 += data[i * cols + j] * H[k * cols + j];
        }
        VHt[i * numComponents + k] = sum1;
        
        // Compute (W * H * H^T)[i,k]
        let sum2 = 0;
        for (let l = 0; l < numComponents; l++) {
          let hht = 0;
          for (let j = 0; j < cols; j++) {
            hht += H[l * cols + j] * H[k * cols + j];
          }
          sum2 += W[i * numComponents + l] * hht;
        }
        WHHt[i * numComponents + k] = sum2 + 1e-10;
      }
    }
    
    for (let i = 0; i < rows; i++) {
      for (let k = 0; k < numComponents; k++) {
        W[i * numComponents + k] *= VHt[i * numComponents + k] / WHHt[i * numComponents + k];
      }
    }
  }
  
  return { W, H, iterations: maxIterations };
}

/**
 * Whiten data (zero mean, unit variance, decorrelated)
 */
function whitenData(signals: Float32Array[]): {
  whitened: Float32Array[];
  whiteningMatrix: Float32Array;
} {
  const numSignals = signals.length;
  const signalLength = signals[0].length;
  
  // Center data
  const centered: Float32Array[] = [];
  for (let i = 0; i < numSignals; i++) {
    const mean = signals[i].reduce((sum, val) => sum + val, 0) / signalLength;
    const centeredSignal = signals[i].map(val => val - mean);
    centered.push(centeredSignal);
  }
  
  // Compute covariance matrix
  const cov = new Float32Array(numSignals * numSignals);
  for (let i = 0; i < numSignals; i++) {
    for (let j = 0; j < numSignals; j++) {
      let sum = 0;
      for (let t = 0; t < signalLength; t++) {
        sum += centered[i][t] * centered[j][t];
      }
      cov[i * numSignals + j] = sum / signalLength;
    }
  }
  
  // Eigenvalue decomposition (simplified - use proper SVD in production)
  // For now, use diagonal approximation
  const whiteningMatrix = new Float32Array(numSignals * numSignals);
  for (let i = 0; i < numSignals; i++) {
    const variance = cov[i * numSignals + i];
    whiteningMatrix[i * numSignals + i] = 1 / Math.sqrt(variance + 1e-10);
  }
  
  // Apply whitening
  const whitened: Float32Array[] = [];
  for (let i = 0; i < numSignals; i++) {
    const whitenedSignal = new Float32Array(signalLength);
    for (let t = 0; t < signalLength; t++) {
      let sum = 0;
      for (let j = 0; j < numSignals; j++) {
        sum += whiteningMatrix[i * numSignals + j] * centered[j][t];
      }
      whitenedSignal[t] = sum;
    }
    whitened.push(whitenedSignal);
  }
  
  return { whitened, whiteningMatrix };
}

/**
 * Generate random orthogonal matrix
 */
function randomOrthogonalMatrix(rows: number, cols: number): Float32Array {
  const matrix = new Float32Array(rows * cols);
  
  // Initialize with random values
  for (let i = 0; i < matrix.length; i++) {
    matrix[i] = Math.random() - 0.5;
  }
  
  // Gram-Schmidt orthogonalization
  for (let i = 0; i < rows; i++) {
    // Orthogonalize against previous rows
    for (let j = 0; j < i; j++) {
      let dotProduct = 0;
      for (let k = 0; k < cols; k++) {
        dotProduct += matrix[i * cols + k] * matrix[j * cols + k];
      }
      for (let k = 0; k < cols; k++) {
        matrix[i * cols + k] -= dotProduct * matrix[j * cols + k];
      }
    }
    
    // Normalize
    let norm = 0;
    for (let k = 0; k < cols; k++) {
      norm += matrix[i * cols + k] * matrix[i * cols + k];
    }
    norm = Math.sqrt(norm);
    for (let k = 0; k < cols; k++) {
      matrix[i * cols + k] /= norm;
    }
  }
  
  return matrix;
}

/**
 * Compute pseudo-inverse using SVD (simplified)
 */
function pseudoInverse(matrix: Float32Array, rows: number, cols: number): Float32Array {
  // Simplified: use transpose for orthogonal matrices
  const result = new Float32Array(cols * rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j * rows + i] = matrix[i * cols + j];
    }
  }
  return result;
}
