import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SNRResult {
  snr_db: number;
  snr_linear: number;
  signal_power_db: number;
  noise_power_db: number;
  m2: number;
  m4: number;
  m2m4_ratio: number;
  method: string;
  modulation_hint: string;
}

export interface CFOResult {
  cfo_hz: number;
  cfo_normalized: number;
  peak_freq_hz: number;
  method: string;
  sample_rate: number;
  symbol_rate: number | null;
}

export interface SNRCFOEstimationResult {
  snr: SNRResult;
  cfo: CFOResult | null;
  teletype?: {
    baudRate?: number;
    shift?: number;
    markFreq?: number;
    spaceFreq?: number;
    bandwidth?: number;
    toneCount?: number;
    [key: string]: any;
  };
}

export async function runSNRCFOEstimation(
  iqReal: Float32Array,
  iqImag: Float32Array,
  sampleRate: number,
  params: {
    modulationType?: string;
    symbolRate?: number;
    estimateCfo?: boolean;
  } = {}
): Promise<SNRCFOEstimationResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'python', 'snr_estimator.py');
    
    const python = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error('[SNR/CFO Python]', data.toString());
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`SNR/CFO estimation failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse SNR/CFO results: ${error}`));
      }
    });

    python.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });

    // Send input data
    const input = JSON.stringify({
      iq_real: Array.from(iqReal),
      iq_imag: Array.from(iqImag),
      sample_rate: sampleRate,
      params: {
        modulation_type: params.modulationType || 'QPSK',
        symbol_rate: params.symbolRate,
        estimate_cfo: params.estimateCfo !== false
      }
    });

    python.stdin.write(input);
    python.stdin.end();
  });
}

export interface CostasLoopResult {
  coarse_cfo_hz: number;
  fine_cfo_hz: number;
  total_cfo_hz: number;
  cfo_normalized: number;
  lock_detected: boolean;
  lock_time_samples: number | null;
  convergence_time_samples: number;
  phase_error_variance: number;
  loop_bandwidth: number;
  modulation_order: number;
  method: string;
}

export async function refineCFOWithCostasLoop(
  iqReal: Float32Array,
  iqImag: Float32Array,
  sampleRate: number,
  params: {
    coarseCfoHz?: number;
    modulationOrder?: number;
    loopBandwidth?: number;
  } = {}
): Promise<CostasLoopResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'python', 'costas_loop.py');
    
    const python = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error('[Costas Loop Python]', data.toString());
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Costas loop refinement failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        
        if (result.error) {
          reject(new Error(`Costas loop error: ${result.error}`));
          return;
        }
        
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse Costas loop results: ${error}`));
      }
    });

    python.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });

    // Send input data
    const input = JSON.stringify({
      iq_real: Array.from(iqReal),
      iq_imag: Array.from(iqImag),
      sample_rate: sampleRate,
      coarse_cfo_hz: params.coarseCfoHz || 0.0,
      modulation_order: params.modulationOrder || 4,
      loop_bandwidth: params.loopBandwidth || 0.01
    });

    python.stdin.write(input);
    python.stdin.end();
  });
}
