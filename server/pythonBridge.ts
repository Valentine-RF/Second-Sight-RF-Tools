/**
 * Python Bridge - Interface between Node.js/tRPC and Python DSP/ML scripts
 * 
 * Spawns Python child processes and handles stdin/stdout communication
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PYTHON_DIR = path.join(__dirname, 'python');
const PYTHON_BIN = 'python3.11';

export interface FAMParams {
  nfft?: number;
  overlap?: number;
  alpha_max?: number;
  use_gpu?: boolean;
}

export interface FAMResult {
  scf_magnitude: Float32Array;
  spectral_freqs: Float32Array;
  cyclic_freqs: Float32Array;
  cyclic_profile: Float32Array;
  shape: {
    cyclic: number;
    spectral: number;
  };
}

export interface ClassificationParams {
  model_path?: string;
  use_gpu?: boolean;
  top_k?: number;
}

export interface ClassificationResult {
  predictions: Array<{
    modulation: string;
    probability: number;
    confidence: number;
    mock?: boolean;
  }>;
  all_probabilities: Record<string, number>;
  warning?: string;
}

/**
 * Run FAM (Fast Averaging Method) algorithm on IQ samples
 */
export async function runFAMAnalysis(
  iqReal: Float32Array,
  iqImag: Float32Array,
  sampleRate: number,
  params: FAMParams = {}
): Promise<FAMResult> {
  const scriptPath = path.join(PYTHON_DIR, 'fam_algorithm.py');
  
  const input = {
    iq_real: Array.from(iqReal),
    iq_imag: Array.from(iqImag),
    sample_rate: sampleRate,
    params: {
      nfft: params.nfft || 256,
      overlap: params.overlap || 0.5,
      alpha_max: params.alpha_max || 0.5,
      use_gpu: params.use_gpu !== false,
    },
  };
  
  console.log(`[PythonBridge] Running FAM on ${iqReal.length} samples...`);
  
  return new Promise((resolve, reject) => {
    const python = spawn(PYTHON_BIN, [scriptPath]);
    
    const chunks: Buffer[] = [];
    const stderrChunks: string[] = [];
    
    // Send input via stdin
    python.stdin.write(JSON.stringify(input));
    python.stdin.end();
    
    // Collect stdout (Arrow binary data)
    python.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    // Collect stderr (debug logs)
    python.stderr.on('data', (chunk: Buffer) => {
      const msg = chunk.toString();
      stderrChunks.push(msg);
      console.log('[FAM stderr]', msg.trim());
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        const errorMsg = stderrChunks.join('');
        reject(new Error(`FAM algorithm failed (code ${code}): ${errorMsg}`));
        return;
      }
      
      try {
        // Parse Apache Arrow IPC stream
        const arrowBuffer = Buffer.concat(chunks);
        const result = parseArrowFAMResult(arrowBuffer);
        console.log(`[PythonBridge] FAM complete. SCF shape: ${result.shape.cyclic}x${result.shape.spectral}`);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse FAM result: ${error}`));
      }
    });
    
    python.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });
  });
}

/**
 * Classify modulation type using TorchSig
 */
export async function classifyModulation(
  iqReal: Float32Array,
  iqImag: Float32Array,
  params: ClassificationParams = {}
): Promise<ClassificationResult> {
  const scriptPath = path.join(PYTHON_DIR, 'classify_modulation.py');
  
  const input = {
    iq_real: Array.from(iqReal),
    iq_imag: Array.from(iqImag),
    params: {
      model_path: params.model_path,
      use_gpu: params.use_gpu !== false,
      top_k: params.top_k || 5,
    },
  };
  
  console.log(`[PythonBridge] Classifying modulation for ${iqReal.length} samples...`);
  
  return new Promise((resolve, reject) => {
    const python = spawn(PYTHON_BIN, [scriptPath]);
    
    let stdoutData = '';
    const stderrChunks: string[] = [];
    
    // Send input via stdin
    python.stdin.write(JSON.stringify(input));
    python.stdin.end();
    
    // Collect stdout (JSON result)
    python.stdout.on('data', (chunk: Buffer) => {
      stdoutData += chunk.toString();
    });
    
    // Collect stderr (debug logs)
    python.stderr.on('data', (chunk: Buffer) => {
      const msg = chunk.toString();
      stderrChunks.push(msg);
      console.log('[Classifier stderr]', msg.trim());
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        const errorMsg = stderrChunks.join('');
        reject(new Error(`Classification failed (code ${code}): ${errorMsg}`));
        return;
      }
      
      try {
        const result: ClassificationResult = JSON.parse(stdoutData);
        console.log(`[PythonBridge] Classification complete. Top: ${result.predictions[0].modulation} (${result.predictions[0].confidence.toFixed(1)}%)`);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse classification result: ${error}`));
      }
    });
    
    python.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });
  });
}

/**
 * Parse Apache Arrow IPC stream from FAM algorithm
 * 
 * TODO: Use apache-arrow library for proper parsing
 * For now, we'll use a simplified approach
 */
function parseArrowFAMResult(buffer: Buffer): FAMResult {
  // This is a placeholder - in production, use apache-arrow library
  // For now, we'll return mock data structure
  
  // In production:
  // import * as arrow from 'apache-arrow';
  // const table = arrow.tableFromIPC(buffer);
  // const scf_magnitude = table.getChild('scf_magnitude').toArray();
  // etc.
  
  throw new Error('Arrow parsing not yet implemented - install apache-arrow library');
  
  // Mock return for type checking
  return {
    scf_magnitude: new Float32Array(),
    spectral_freqs: new Float32Array(),
    cyclic_freqs: new Float32Array(),
    cyclic_profile: new Float32Array(),
    shape: { cyclic: 0, spectral: 0 },
  };
}
