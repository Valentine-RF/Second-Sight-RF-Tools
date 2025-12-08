import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SNRResult {
  snr_db: number | null;
  snr_linear: number;
  signal_power_db: number | null;
  noise_power_db: number | null;
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
  } = {},
): Promise<SNRCFOEstimationResult> {
  try {
    const pythonResult = await runPythonEstimator(iqReal, iqImag, sampleRate, params);
    return normalizeSNRResult(pythonResult);
  } catch (error) {
    console.warn('[SNR/CFO] Falling back to Node estimator:', error);
    return estimateInNode(iqReal, iqImag, sampleRate, params);
  }
}

function normalizeSNRResult(result: SNRCFOEstimationResult): SNRCFOEstimationResult {
  const snrDb = Number.isFinite(result.snr.snr_db) ? result.snr.snr_db : null;
  const signalPower = Number.isFinite(result.snr.signal_power_db) ? result.snr.signal_power_db : null;
  const noisePower = Number.isFinite(result.snr.noise_power_db) ? result.snr.noise_power_db : null;

  return {
    ...result,
    snr: {
      ...result.snr,
      snr_db: snrDb,
      signal_power_db: signalPower,
      noise_power_db: noisePower,
    },
  };
}

function estimateInNode(
  iqReal: Float32Array,
  iqImag: Float32Array,
  sampleRate: number,
  params: { modulationType?: string; symbolRate?: number; estimateCfo?: boolean },
): SNRCFOEstimationResult {
  const { m2, m4, snrLinear, snrDb, signalPowerDb, noisePowerDb } = estimateSNR(iqReal, iqImag);

  const cfo = params.estimateCfo === false
    ? null
    : estimateCFO(iqReal, iqImag, sampleRate, params.symbolRate ?? null);

  return {
    snr: {
      snr_db: snrDb,
      snr_linear: snrLinear,
      signal_power_db: signalPowerDb,
      noise_power_db: noisePowerDb,
      m2,
      m4,
      m2m4_ratio: m2 > 0 ? m4 / (m2 * m2) : 0,
      method: 'M2M4',
      modulation_hint: params.modulationType ?? 'QPSK',
    },
    cfo,
  };
}

function estimateSNR(iqReal: Float32Array, iqImag: Float32Array) {
  let powerSum = 0;
  let powerSqSum = 0;
  const n = iqReal.length;

  for (let i = 0; i < n; i++) {
    const power = iqReal[i] * iqReal[i] + iqImag[i] * iqImag[i];
    powerSum += power;
    powerSqSum += power * power;
  }

  const m2 = n > 0 ? powerSum / n : 0;
  const m4 = n > 0 ? powerSqSum / n : 0;
  const denominator = m4 - m2 * m2;
  const snrLinear = denominator > 0 ? m2 * m2 / denominator - 1 : 0;
  const snrDb = snrLinear > 0 ? 10 * Math.log10(snrLinear) : null;
  const noisePower = snrLinear > 0 ? m2 / (snrLinear + 1) : null;
  const signalPowerDb = m2 > 0 ? 10 * Math.log10(m2) : null;
  const noisePowerDb = noisePower && noisePower > 0 ? 10 * Math.log10(noisePower) : null;

  return { m2, m4, snrLinear, snrDb, signalPowerDb, noisePowerDb };
}

function estimateCFO(
  iqReal: Float32Array,
  iqImag: Float32Array,
  sampleRate: number,
  symbolRate: number | null,
): CFOResult {
  let accRe = 0;
  let accIm = 0;
  let count = 0;

  for (let i = 0; i < iqReal.length - 1; i++) {
    const re1 = iqReal[i];
    const im1 = iqImag[i];
    const re2 = iqReal[i + 1];
    const im2 = iqImag[i + 1];

    accRe += re1 * re2 + im1 * im2;
    accIm += re1 * im2 - im1 * re2;
    count += 1;
  }

  const avgRe = count > 0 ? accRe / count : 0;
  const avgIm = count > 0 ? accIm / count : 0;
  const angle = Math.atan2(avgIm, avgRe);
  const cfoHz = (angle / (2 * Math.PI)) * sampleRate;

  return {
    cfo_hz: cfoHz,
    cfo_normalized: sampleRate > 0 ? cfoHz / sampleRate : 0,
    peak_freq_hz: cfoHz,
    method: 'Autocorrelation + PSD',
    sample_rate: sampleRate,
    symbol_rate: symbolRate,
  };
}

function runPythonEstimator(
  iqReal: Float32Array,
  iqImag: Float32Array,
  sampleRate: number,
  params: { modulationType?: string; symbolRate?: number; estimateCfo?: boolean },
) {
  return new Promise<SNRCFOEstimationResult>((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'python', 'snr_estimator.py');

    const python = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
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

    const input = JSON.stringify({
      iq_real: Array.from(iqReal),
      iq_imag: Array.from(iqImag),
      sample_rate: sampleRate,
      params: {
        modulation_type: params.modulationType || 'QPSK',
        symbol_rate: params.symbolRate,
        estimate_cfo: params.estimateCfo !== false,
      },
    });

    python.stdin.write(input);
    python.stdin.end();
  });
}
