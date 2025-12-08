import { spawn } from 'child_process';
import path from 'path';

/**
 * TypeScript Bridge for Advanced Demodulation Pipeline
 * 
 * Provides interface to Python CUDA-accelerated demodulation algorithms:
 * - CFO Estimation (Power, Kay, Fitz methods)
 * - Costas Loop carrier recovery
 * - M2M4 SNR Estimation
 * - Matched Filter
 * - Timing Recovery (Gardner, Mueller-Muller)
 * - Complete Demodulation Pipeline
 */

export interface CFOEstimate {
  cfo_hz: number;
  cfo_normalized: number;
  confidence: number;
  method: string;
}

export interface SNREstimate {
  snr_db: number;
  signal_power: number;
  noise_power: number;
  method: string;
}

export interface TimingRecoveryResult {
  symbols: number[];
  timing_error: number[];
  samples_per_symbol: number;
  method: string;
}

export interface CostasLoopResult {
  corrected_samples: { real: number; imag: number }[];
  phase_trajectory: number[];
  freq_trajectory: number[];
}

export interface DemodulationResult {
  symbols: number[];
  bits: string;
  cfo: CFOEstimate;
  snr: SNREstimate;
  timing: TimingRecoveryResult;
}

class DemodulationBridge {
  private pythonPath: string;
  private scriptPath: string;

  constructor() {
    this.pythonPath = 'python3.11';
    this.scriptPath = path.join(__dirname, 'python', 'demodulation_pipeline.py');
  }

  private async runPython(command: string, args: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, [
        this.scriptPath,
        command,
        JSON.stringify(args)
      ]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse Python output: ${stdout}`));
        }
      });
    });
  }

  /**
   * Estimate Carrier Frequency Offset
   * 
   * @param iqSamples - Complex IQ samples as interleaved [I,Q,I,Q,...]
   * @param sampleRate - Sample rate in Hz
   * @param method - 'power', 'kay', or 'fitz'
   * @returns CFO estimate
   */
  async estimateCFO(
    iqSamples: Float32Array,
    sampleRate: number,
    method: 'power' | 'kay' | 'fitz' = 'power'
  ): Promise<CFOEstimate> {
    const result = await this.runPython('estimate_cfo', {
      iq_samples: Array.from(iqSamples),
      sample_rate: sampleRate,
      method
    });
    return result;
  }

  /**
   * Estimate Signal-to-Noise Ratio
   * 
   * @param iqSamples - Complex IQ samples as interleaved [I,Q,I,Q,...]
   * @param modulationType - Modulation type for optimal estimation
   * @returns SNR estimate
   */
  async estimateSNR(
    iqSamples: Float32Array,
    modulationType: string = 'qpsk'
  ): Promise<SNREstimate> {
    const result = await this.runPython('estimate_snr', {
      iq_samples: Array.from(iqSamples),
      modulation_type: modulationType
    });
    return result;
  }

  /**
   * Apply Costas Loop for carrier recovery
   * 
   * @param iqSamples - Complex IQ samples as interleaved [I,Q,I,Q,...]
   * @param loopBandwidth - Normalized loop bandwidth (0.001 - 0.1)
   * @param damping - Damping factor (0.5 - 1.0)
   * @param mode - 'bpsk' or 'qpsk'
   * @returns Corrected samples and phase/frequency trajectories
   */
  async costasCorrect(
    iqSamples: Float32Array,
    loopBandwidth: number = 0.01,
    damping: number = 0.707,
    mode: 'bpsk' | 'qpsk' = 'qpsk'
  ): Promise<CostasLoopResult> {
    const result = await this.runPython('costas_correct', {
      iq_samples: Array.from(iqSamples),
      loop_bandwidth: loopBandwidth,
      damping,
      mode
    });
    
    // Convert flat arrays to complex format
    const correctedSamples = [];
    for (let i = 0; i < result.corrected_samples.length; i += 2) {
      correctedSamples.push({
        real: result.corrected_samples[i],
        imag: result.corrected_samples[i + 1]
      });
    }
    
    return {
      corrected_samples: correctedSamples,
      phase_trajectory: result.phase_trajectory,
      freq_trajectory: result.freq_trajectory
    };
  }

  /**
   * Recover symbols with timing recovery
   * 
   * @param iqSamples - Complex IQ samples as interleaved [I,Q,I,Q,...]
   * @param samplesPerSymbol - Nominal samples per symbol
   * @param method - 'gardner' or 'mueller_muller'
   * @returns Recovered symbols and timing error
   */
  async recoverSymbols(
    iqSamples: Float32Array,
    samplesPerSymbol: number,
    method: 'gardner' | 'mueller_muller' = 'gardner'
  ): Promise<TimingRecoveryResult> {
    const result = await this.runPython('recover_symbols', {
      iq_samples: Array.from(iqSamples),
      samples_per_symbol: samplesPerSymbol,
      method
    });
    return result;
  }

  /**
   * Complete demodulation pipeline
   * 
   * @param iqSamples - Complex IQ samples as interleaved [I,Q,I,Q,...]
   * @param sampleRate - Sample rate in Hz
   * @param modulationType - Modulation type ('bpsk', 'qpsk', etc.)
   * @param samplesPerSymbol - Nominal samples per symbol
   * @returns Complete demodulation result
   */
  async demodulate(
    iqSamples: Float32Array,
    sampleRate: number,
    modulationType: string,
    samplesPerSymbol: number
  ): Promise<DemodulationResult> {
    const result = await this.runPython('demodulate', {
      iq_samples: Array.from(iqSamples),
      sample_rate: sampleRate,
      modulation_type: modulationType,
      samples_per_symbol: samplesPerSymbol
    });
    return result;
  }
}

// Singleton instance
export const demodulationBridge = new DemodulationBridge();

// Convenience exports
export async function estimateCFO(
  iqSamples: Float32Array,
  sampleRate: number,
  method?: 'power' | 'kay' | 'fitz'
): Promise<CFOEstimate> {
  return demodulationBridge.estimateCFO(iqSamples, sampleRate, method);
}

export async function estimateSNR(
  iqSamples: Float32Array,
  modulationType?: string
): Promise<SNREstimate> {
  return demodulationBridge.estimateSNR(iqSamples, modulationType);
}

export async function costasCorrect(
  iqSamples: Float32Array,
  loopBandwidth?: number,
  damping?: number,
  mode?: 'bpsk' | 'qpsk'
): Promise<CostasLoopResult> {
  return demodulationBridge.costasCorrect(iqSamples, loopBandwidth, damping, mode);
}

export async function recoverSymbols(
  iqSamples: Float32Array,
  samplesPerSymbol: number,
  method?: 'gardner' | 'mueller_muller'
): Promise<TimingRecoveryResult> {
  return demodulationBridge.recoverSymbols(iqSamples, samplesPerSymbol, method);
}

export async function demodulate(
  iqSamples: Float32Array,
  sampleRate: number,
  modulationType: string,
  samplesPerSymbol: number
): Promise<DemodulationResult> {
  return demodulationBridge.demodulate(iqSamples, sampleRate, modulationType, samplesPerSymbol);
}
