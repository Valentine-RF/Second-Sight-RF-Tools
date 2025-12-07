/**
 * RF Geolocation Algorithms
 * 
 * Implements emitter localization techniques:
 * - Time Difference of Arrival (TDOA)
 * - Angle of Arrival (AOA)
 * - Received Signal Strength (RSS) based positioning
 * - Hybrid TDOA/AOA fusion
 */

export interface SensorPosition {
  x: number; // meters
  y: number; // meters
  z?: number; // meters (optional for 3D)
  id: string;
}

export interface GeolocationResult {
  position: {
    x: number;
    y: number;
    z?: number;
  };
  confidence: number; // 0-1
  method: 'TDOA' | 'AOA' | 'RSS' | 'HYBRID';
  gdop?: number; // Geometric Dilution of Precision
  error?: {
    horizontal: number; // meters
    vertical?: number; // meters
  };
}

/**
 * Time Difference of Arrival (TDOA) Geolocation
 * Uses hyperbolic positioning from time differences
 */
export function tdoaGeolocation(
  sensors: SensorPosition[],
  timeDifferences: number[], // Time differences in seconds (relative to reference sensor)
  speedOfLight: number = 299792458 // m/s
): GeolocationResult {
  const numSensors = sensors.length;
  
  if (numSensors < 3) {
    throw new Error('TDOA requires at least 3 sensors');
  }
  
  // Convert time differences to range differences
  const rangeDifferences = timeDifferences.map(td => td * speedOfLight);
  
  // Use least squares to solve hyperbolic equations
  // Reference sensor is sensors[0]
  const ref = sensors[0];
  
  // Build system of equations: ||x - s_i|| - ||x - s_0|| = r_i
  // Linearize using Taylor expansion around initial guess
  
  // Initial guess: centroid of sensors
  let x = 0, y = 0;
  for (const sensor of sensors) {
    x += sensor.x;
    y += sensor.y;
  }
  x /= numSensors;
  y /= numSensors;
  
  // Gauss-Newton iterations
  const maxIterations = 20;
  const tolerance = 1e-3;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Build Jacobian and residual
    const A: number[][] = [];
    const b: number[] = [];
    
    for (let i = 1; i < numSensors; i++) {
      const sensor = sensors[i];
      
      // Distance to current estimate
      const d_i = Math.sqrt((x - sensor.x) ** 2 + (y - sensor.y) ** 2);
      const d_0 = Math.sqrt((x - ref.x) ** 2 + (y - ref.y) ** 2);
      
      // Jacobian row
      const dfdx = (x - sensor.x) / d_i - (x - ref.x) / d_0;
      const dfdy = (y - sensor.y) / d_i - (y - ref.y) / d_0;
      
      A.push([dfdx, dfdy]);
      
      // Residual
      const predicted = d_i - d_0;
      const measured = rangeDifferences[i - 1];
      b.push(measured - predicted);
    }
    
    // Solve A * delta = b using least squares
    const delta = leastSquares(A, b);
    
    x += delta[0];
    y += delta[1];
    
    // Check convergence
    if (Math.sqrt(delta[0] ** 2 + delta[1] ** 2) < tolerance) {
      break;
    }
  }
  
  // Compute GDOP
  const gdop = computeGDOP(sensors, { x, y });
  
  return {
    position: { x, y },
    confidence: Math.max(0, 1 - gdop / 10),
    method: 'TDOA',
    gdop,
    error: {
      horizontal: gdop * 10, // Rough estimate
    },
  };
}

/**
 * Angle of Arrival (AOA) Geolocation
 * Triangulation from bearing angles
 */
export function aoaGeolocation(
  sensors: SensorPosition[],
  bearings: number[] // Bearing angles in radians
): GeolocationResult {
  const numSensors = sensors.length;
  
  if (numSensors < 2) {
    throw new Error('AOA requires at least 2 sensors');
  }
  
  // Build system of linear equations
  // Each bearing defines a line: y - y_i = tan(θ_i) * (x - x_i)
  // Rearrange: tan(θ_i) * x - y = tan(θ_i) * x_i - y_i
  
  const A: number[][] = [];
  const b: number[] = [];
  
  for (let i = 0; i < numSensors; i++) {
    const sensor = sensors[i];
    const theta = bearings[i];
    
    const tanTheta = Math.tan(theta);
    
    A.push([tanTheta, -1]);
    b.push(tanTheta * sensor.x - sensor.y);
  }
  
  // Solve using least squares
  const solution = leastSquares(A, b);
  const x = solution[0];
  const y = solution[1];
  
  // Compute confidence based on bearing intersection quality
  let sumAngleDiff = 0;
  for (let i = 0; i < numSensors - 1; i++) {
    const angleDiff = Math.abs(bearings[i] - bearings[i + 1]);
    sumAngleDiff += Math.min(angleDiff, Math.PI - angleDiff);
  }
  const avgAngleDiff = sumAngleDiff / (numSensors - 1);
  const confidence = Math.sin(avgAngleDiff); // Best when angles are perpendicular
  
  return {
    position: { x, y },
    confidence,
    method: 'AOA',
    error: {
      horizontal: 100 / confidence, // Rough estimate
    },
  };
}

/**
 * RSS-based Geolocation
 * Uses path loss model to estimate distance
 */
export function rssGeolocation(
  sensors: SensorPosition[],
  rssi: number[], // Received signal strength in dBm
  pathLossExponent: number = 2.0,
  referenceDistance: number = 1.0, // meters
  referencePower: number = -40 // dBm at reference distance
): GeolocationResult {
  const numSensors = sensors.length;
  
  if (numSensors < 3) {
    throw new Error('RSS requires at least 3 sensors');
  }
  
  // Convert RSSI to distance using path loss model
  // RSSI = P0 - 10*n*log10(d/d0)
  // d = d0 * 10^((P0 - RSSI)/(10*n))
  
  const distances: number[] = [];
  for (const rss of rssi) {
    const distance = referenceDistance * Math.pow(10, (referencePower - rss) / (10 * pathLossExponent));
    distances.push(distance);
  }
  
  // Trilateration using least squares
  const ref = sensors[0];
  const refDist = distances[0];
  
  // Initial guess: centroid
  let x = 0, y = 0;
  for (const sensor of sensors) {
    x += sensor.x;
    y += sensor.y;
  }
  x /= numSensors;
  y /= numSensors;
  
  // Gauss-Newton iterations
  for (let iter = 0; iter < 20; iter++) {
    const A: number[][] = [];
    const b: number[] = [];
    
    for (let i = 1; i < numSensors; i++) {
      const sensor = sensors[i];
      const d_i = distances[i];
      
      // Linearized equation
      const dx = x - sensor.x;
      const dy = y - sensor.y;
      const dist = Math.sqrt(dx ** 2 + dy ** 2);
      
      const dx0 = x - ref.x;
      const dy0 = y - ref.y;
      const dist0 = Math.sqrt(dx0 ** 2 + dy0 ** 2);
      
      A.push([
        dx / dist - dx0 / dist0,
        dy / dist - dy0 / dist0,
      ]);
      
      b.push((d_i ** 2 - refDist ** 2 - sensor.x ** 2 + ref.x ** 2 - sensor.y ** 2 + ref.y ** 2) / 2);
    }
    
    const delta = leastSquares(A, b);
    
    x += delta[0];
    y += delta[1];
    
    if (Math.sqrt(delta[0] ** 2 + delta[1] ** 2) < 1e-3) {
      break;
    }
  }
  
  return {
    position: { x, y },
    confidence: 0.6, // RSS is less accurate
    method: 'RSS',
    error: {
      horizontal: 50, // Typically large error
    },
  };
}

/**
 * Hybrid TDOA/AOA Geolocation
 * Fuses both measurements for improved accuracy
 */
export function hybridGeolocation(
  sensors: SensorPosition[],
  timeDifferences: number[],
  bearings: number[]
): GeolocationResult {
  // Get individual estimates
  const tdoaResult = tdoaGeolocation(sensors, timeDifferences);
  const aoaResult = aoaGeolocation(sensors, bearings);
  
  // Weighted fusion based on confidence
  const w1 = tdoaResult.confidence;
  const w2 = aoaResult.confidence;
  const totalWeight = w1 + w2;
  
  const x = (w1 * tdoaResult.position.x + w2 * aoaResult.position.x) / totalWeight;
  const y = (w1 * tdoaResult.position.y + w2 * aoaResult.position.y) / totalWeight;
  
  const confidence = Math.sqrt(w1 * w2); // Geometric mean
  
  return {
    position: { x, y },
    confidence,
    method: 'HYBRID',
    gdop: tdoaResult.gdop,
    error: {
      horizontal: Math.min(tdoaResult.error?.horizontal || 100, aoaResult.error?.horizontal || 100),
    },
  };
}

/**
 * Compute Geometric Dilution of Precision (GDOP)
 */
function computeGDOP(sensors: SensorPosition[], position: { x: number; y: number }): number {
  const numSensors = sensors.length;
  
  // Build geometry matrix
  const H: number[][] = [];
  
  for (const sensor of sensors) {
    const dx = position.x - sensor.x;
    const dy = position.y - sensor.y;
    const dist = Math.sqrt(dx ** 2 + dy ** 2);
    
    H.push([dx / dist, dy / dist]);
  }
  
  // GDOP = sqrt(trace((H^T H)^-1))
  const HtH = matrixMultiply(transpose(H), H);
  const inv = matrixInverse2x2(HtH);
  
  const trace = inv[0][0] + inv[1][1];
  return Math.sqrt(trace);
}

/**
 * Least squares solver: min ||Ax - b||^2
 */
function leastSquares(A: number[][], b: number[]): number[] {
  // Solve using normal equations: A^T A x = A^T b
  const At = transpose(A);
  const AtA = matrixMultiply(At, A);
  const Atb = matrixVectorMultiply(At, b);
  
  // Solve 2x2 system (for 2D positioning)
  if (AtA.length === 2) {
    const det = AtA[0][0] * AtA[1][1] - AtA[0][1] * AtA[1][0];
    
    if (Math.abs(det) < 1e-10) {
      return [0, 0]; // Singular matrix
    }
    
    const x = (AtA[1][1] * Atb[0] - AtA[0][1] * Atb[1]) / det;
    const y = (-AtA[1][0] * Atb[0] + AtA[0][0] * Atb[1]) / det;
    
    return [x, y];
  }
  
  return [0, 0];
}

/**
 * Matrix transpose
 */
function transpose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0].length;
  const result: number[][] = [];
  
  for (let j = 0; j < cols; j++) {
    const row: number[] = [];
    for (let i = 0; i < rows; i++) {
      row.push(A[i][j]);
    }
    result.push(row);
  }
  
  return result;
}

/**
 * Matrix multiplication
 */
function matrixMultiply(A: number[][], B: number[][]): number[][] {
  const rowsA = A.length;
  const colsA = A[0].length;
  const colsB = B[0].length;
  
  const result: number[][] = [];
  
  for (let i = 0; i < rowsA; i++) {
    const row: number[] = [];
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += A[i][k] * B[k][j];
      }
      row.push(sum);
    }
    result.push(row);
  }
  
  return result;
}

/**
 * Matrix-vector multiplication
 */
function matrixVectorMultiply(A: number[][], b: number[]): number[] {
  const result: number[] = [];
  
  for (const row of A) {
    let sum = 0;
    for (let i = 0; i < row.length; i++) {
      sum += row[i] * b[i];
    }
    result.push(sum);
  }
  
  return result;
}

/**
 * 2x2 matrix inverse
 */
function matrixInverse2x2(A: number[][]): number[][] {
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  
  if (Math.abs(det) < 1e-10) {
    return [[1, 0], [0, 1]]; // Return identity if singular
  }
  
  return [
    [A[1][1] / det, -A[0][1] / det],
    [-A[1][0] / det, A[0][0] / det],
  ];
}
