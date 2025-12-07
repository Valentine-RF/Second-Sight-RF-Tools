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
