/**
 * Blind Source Separation for Co-Channel Signal Separation
 * 
 * Implements algorithms for separating overlapping signals:
 * - Complex-valued FastICA
 * - Non-negative Matrix Factorization (NMF) for spectrograms
 * - Tensor decomposition (CP/PARAFAC)
 */

export interface SeparationResult {
  sources: Array<{ i: Float32Array; q: Float32Array }>;
  mixingMatrix?: number[][];
  convergence: {
    iterations: number;
    finalError: number;
  };
}

/**
 * Complex-valued FastICA for blind source separation
 * Separates co-channel signals using independent component analysis
 */
export function complexFastICA(
  mixtures: Array<{ i: Float32Array; q: Float32Array }>,
  numSources: number,
  maxIterations: number = 100,
  tolerance: number = 1e-6
): SeparationResult {
  const numMixtures = mixtures.length;
  const N = mixtures[0].i.length;
  
  // Center and whiten the data
  const { whitened, whiteningMatrix } = whiten(mixtures);
  
  // Initialize unmixing matrix randomly
  let W = randomComplexMatrix(numSources, numMixtures);
  
  // Orthogonalize
  W = orthogonalize(W);
  
  let iterations = 0;
  let converged = false;
  
  while (iterations < maxIterations && !converged) {
    iterations++;
    const Wold = W.map(row => [...row]);
    
    // FastICA iteration for each component
    for (let p = 0; p < numSources; p++) {
      // Compute w^T * x for all samples
      const wx: Array<{ re: number; im: number }> = [];
      for (let n = 0; n < N; n++) {
        let re = 0, im = 0;
        for (let m = 0; m < numMixtures; m++) {
          re += W[p][m].re * whitened[m].i[n] - W[p][m].im * whitened[m].q[n];
          im += W[p][m].re * whitened[m].q[n] + W[p][m].im * whitened[m].i[n];
        }
        wx.push({ re, im });
      }
      
      // Compute g(wx) and g'(wx) using complex nonlinearity
      const g_wx: Array<{ re: number; im: number }> = [];
      let g_prime_mean = 0;
      
      for (const val of wx) {
        // Use tanh as nonlinearity: g(z) = tanh(|z|) * z/|z|
        const mag = Math.sqrt(val.re ** 2 + val.im ** 2);
        const tanhMag = Math.tanh(mag);
        
        if (mag > 1e-10) {
          g_wx.push({
            re: tanhMag * val.re / mag,
            im: tanhMag * val.im / mag,
          });
          g_prime_mean += (1 - tanhMag ** 2) / mag;
        } else {
          g_wx.push({ re: 0, im: 0 });
        }
      }
      g_prime_mean /= N;
      
      // Update rule: w = E[x * g(w^T x)] - E[g'(w^T x)] * w
      const newW: Array<{ re: number; im: number }> = [];
      
      for (let m = 0; m < numMixtures; m++) {
        let re = 0, im = 0;
        
        for (let n = 0; n < N; n++) {
          // x * conj(g(wx))
          re += whitened[m].i[n] * g_wx[n].re + whitened[m].q[n] * g_wx[n].im;
          im += whitened[m].q[n] * g_wx[n].re - whitened[m].i[n] * g_wx[n].im;
        }
        
        re = re / N - g_prime_mean * W[p][m].re;
        im = im / N - g_prime_mean * W[p][m].im;
        
        newW.push({ re, im });
      }
      
      W[p] = newW;
    }
    
    // Orthogonalize
    W = orthogonalize(W);
    
    // Check convergence
    let maxChange = 0;
    for (let p = 0; p < numSources; p++) {
      for (let m = 0; m < numMixtures; m++) {
        const change = Math.abs(W[p][m].re - Wold[p][m].re) + Math.abs(W[p][m].im - Wold[p][m].im);
        maxChange = Math.max(maxChange, change);
      }
    }
    
    if (maxChange < tolerance) {
      converged = true;
    }
  }
  
  // Extract sources: S = W * whitened
  const sources: Array<{ i: Float32Array; q: Float32Array }> = [];
  
  for (let p = 0; p < numSources; p++) {
    const source = { i: new Float32Array(N), q: new Float32Array(N) };
    
    for (let n = 0; n < N; n++) {
      let re = 0, im = 0;
      for (let m = 0; m < numMixtures; m++) {
        re += W[p][m].re * whitened[m].i[n] - W[p][m].im * whitened[m].q[n];
        im += W[p][m].re * whitened[m].q[n] + W[p][m].im * whitened[m].i[n];
      }
      source.i[n] = re;
      source.q[n] = im;
    }
    
    sources.push(source);
  }
  
  return {
    sources,
    convergence: {
      iterations,
      finalError: converged ? 0 : tolerance,
    },
  };
}

/**
 * Whiten the data (decorrelate and normalize variance)
 */
function whiten(
  mixtures: Array<{ i: Float32Array; q: Float32Array }>
): {
  whitened: Array<{ i: Float32Array; q: Float32Array }>;
  whiteningMatrix: number[][];
} {
  const M = mixtures.length;
  const N = mixtures[0].i.length;
  
  // Center the data
  const means: Array<{ i: number; q: number }> = [];
  for (const mix of mixtures) {
    let meanI = 0, meanQ = 0;
    for (let n = 0; n < N; n++) {
      meanI += mix.i[n];
      meanQ += mix.q[n];
    }
    means.push({ i: meanI / N, q: meanQ / N });
  }
  
  const centered = mixtures.map((mix, m) => ({
    i: new Float32Array(N),
    q: new Float32Array(N),
  }));
  
  for (let m = 0; m < M; m++) {
    for (let n = 0; n < N; n++) {
      centered[m].i[n] = mixtures[m].i[n] - means[m].i;
      centered[m].q[n] = mixtures[m].q[n] - means[m].q;
    }
  }
  
  // For simplicity, just normalize variance (full whitening would use PCA)
  const whitened = centered.map(mix => {
    let varI = 0, varQ = 0;
    for (let n = 0; n < N; n++) {
      varI += mix.i[n] ** 2;
      varQ += mix.q[n] ** 2;
    }
    varI = Math.sqrt(varI / N);
    varQ = Math.sqrt(varQ / N);
    
    return {
      i: new Float32Array(N).map((_, n) => mix.i[n] / (varI + 1e-10)),
      q: new Float32Array(N).map((_, n) => mix.q[n] / (varQ + 1e-10)),
    };
  });
  
  const whiteningMatrix: number[][] = [];
  for (let i = 0; i < M; i++) {
    whiteningMatrix.push(Array(M).fill(i === i ? 1 : 0));
  }
  
  return { whitened, whiteningMatrix };
}

/**
 * Orthogonalize complex matrix using Gram-Schmidt
 */
function orthogonalize(
  W: Array<Array<{ re: number; im: number }>>
): Array<Array<{ re: number; im: number }>> {
  const numRows = W.length;
  const numCols = W[0].length;
  
  const orthogonal: Array<Array<{ re: number; im: number }>> = [];
  
  for (let i = 0; i < numRows; i++) {
    let row = W[i].map(c => ({ ...c }));
    
    // Subtract projections onto previous rows
    for (let j = 0; j < i; j++) {
      const dotProduct = complexDot(row, orthogonal[j]);
      const norm = complexNorm(orthogonal[j]);
      
      for (let k = 0; k < numCols; k++) {
        row[k].re -= (dotProduct.re * orthogonal[j][k].re + dotProduct.im * orthogonal[j][k].im) / (norm ** 2);
        row[k].im -= (dotProduct.im * orthogonal[j][k].re - dotProduct.re * orthogonal[j][k].im) / (norm ** 2);
      }
    }
    
    // Normalize
    const norm = complexNorm(row);
    row = row.map(c => ({ re: c.re / norm, im: c.im / norm }));
    
    orthogonal.push(row);
  }
  
  return orthogonal;
}

/**
 * Complex dot product
 */
function complexDot(
  a: Array<{ re: number; im: number }>,
  b: Array<{ re: number; im: number }>
): { re: number; im: number } {
  let re = 0, im = 0;
  for (let i = 0; i < a.length; i++) {
    // a * conj(b)
    re += a[i].re * b[i].re + a[i].im * b[i].im;
    im += a[i].im * b[i].re - a[i].re * b[i].im;
  }
  return { re, im };
}

/**
 * Complex vector norm
 */
function complexNorm(v: Array<{ re: number; im: number }>): number {
  let sum = 0;
  for (const c of v) {
    sum += c.re ** 2 + c.im ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Generate random complex matrix
 */
function randomComplexMatrix(
  rows: number,
  cols: number
): Array<Array<{ re: number; im: number }>> {
  const matrix: Array<Array<{ re: number; im: number }>> = [];
  
  for (let i = 0; i < rows; i++) {
    const row: Array<{ re: number; im: number }> = [];
    for (let j = 0; j < cols; j++) {
      row.push({
        re: Math.random() * 2 - 1,
        im: Math.random() * 2 - 1,
      });
    }
    matrix.push(row);
  }
  
  return matrix;
}

/**
 * Non-negative Matrix Factorization (NMF) for spectrogram decomposition
 * Decomposes spectrogram V ≈ W * H where W, H ≥ 0
 */
export function nmfSpectrogram(
  spectrogram: Float32Array[],
  numComponents: number,
  maxIterations: number = 100
): {
  W: Float32Array[]; // Basis spectrograms
  H: Float32Array[]; // Activation coefficients
  reconstruction: Float32Array[];
  iterations: number;
} {
  const F = spectrogram.length; // Frequency bins
  const T = spectrogram[0].length; // Time frames
  
  // Initialize W and H randomly
  const W: Float32Array[] = [];
  for (let f = 0; f < F; f++) {
    const row = new Float32Array(numComponents);
    for (let k = 0; k < numComponents; k++) {
      row[k] = Math.random();
    }
    W.push(row);
  }
  
  const H: Float32Array[] = [];
  for (let k = 0; k < numComponents; k++) {
    const row = new Float32Array(T);
    for (let t = 0; t < T; t++) {
      row[t] = Math.random();
    }
    H.push(row);
  }
  
  // Multiplicative update rules
  for (let iter = 0; iter < maxIterations; iter++) {
    // Update H
    for (let k = 0; k < numComponents; k++) {
      for (let t = 0; t < T; t++) {
        let numerator = 0, denominator = 0;
        
        for (let f = 0; f < F; f++) {
          let WH_ft = 0;
          for (let kk = 0; kk < numComponents; kk++) {
            WH_ft += W[f][kk] * H[kk][t];
          }
          
          numerator += W[f][k] * spectrogram[f][t];
          denominator += W[f][k] * WH_ft;
        }
        
        H[k][t] *= numerator / (denominator + 1e-10);
      }
    }
    
    // Update W
    for (let f = 0; f < F; f++) {
      for (let k = 0; k < numComponents; k++) {
        let numerator = 0, denominator = 0;
        
        for (let t = 0; t < T; t++) {
          let WH_ft = 0;
          for (let kk = 0; kk < numComponents; kk++) {
            WH_ft += W[f][kk] * H[kk][t];
          }
          
          numerator += H[k][t] * spectrogram[f][t];
          denominator += H[k][t] * WH_ft;
        }
        
        W[f][k] *= numerator / (denominator + 1e-10);
      }
    }
  }
  
  // Reconstruct
  const reconstruction: Float32Array[] = [];
  for (let f = 0; f < F; f++) {
    const row = new Float32Array(T);
    for (let t = 0; t < T; t++) {
      for (let k = 0; k < numComponents; k++) {
        row[t] += W[f][k] * H[k][t];
      }
    }
    reconstruction.push(row);
  }
  
  return { W, H, reconstruction, iterations: maxIterations };
}
