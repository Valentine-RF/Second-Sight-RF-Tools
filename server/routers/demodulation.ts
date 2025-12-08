import { z } from 'zod';
import { publicProcedure, router } from '../_core/trpc';
import { demodulationBridge } from '../demodulationBridge';

/**
 * tRPC Router for Advanced Demodulation
 * 
 * Exposes endpoints for:
 * - CFO estimation
 * - SNR estimation
 * - Costas loop carrier recovery
 * - Timing recovery
 * - Complete demodulation pipeline
 */

export const demodulationRouter = router({
  /**
   * Estimate Carrier Frequency Offset
   */
  estimateCFO: publicProcedure
    .input(z.object({
      iqSamples: z.array(z.number()),
      sampleRate: z.number().positive(),
      method: z.enum(['power', 'kay', 'fitz']).default('power'),
    }))
    .mutation(async ({ input }) => {
      const iqArray = new Float32Array(input.iqSamples);
      const result = await demodulationBridge.estimateCFO(
        iqArray,
        input.sampleRate,
        input.method
      );
      return result;
    }),

  /**
   * Estimate Signal-to-Noise Ratio
   */
  estimateSNR: publicProcedure
    .input(z.object({
      iqSamples: z.array(z.number()),
      modulationType: z.string().default('qpsk'),
    }))
    .mutation(async ({ input }) => {
      const iqArray = new Float32Array(input.iqSamples);
      const result = await demodulationBridge.estimateSNR(
        iqArray,
        input.modulationType
      );
      return result;
    }),

  /**
   * Apply Costas Loop for carrier recovery
   */
  costasCorrect: publicProcedure
    .input(z.object({
      iqSamples: z.array(z.number()),
      loopBandwidth: z.number().min(0.001).max(0.1).default(0.01),
      damping: z.number().min(0.5).max(1.0).default(0.707),
      mode: z.enum(['bpsk', 'qpsk']).default('qpsk'),
    }))
    .mutation(async ({ input }) => {
      const iqArray = new Float32Array(input.iqSamples);
      const result = await demodulationBridge.costasCorrect(
        iqArray,
        input.loopBandwidth,
        input.damping,
        input.mode
      );
      return result;
    }),

  /**
   * Recover symbols with timing recovery
   */
  recoverSymbols: publicProcedure
    .input(z.object({
      iqSamples: z.array(z.number()),
      samplesPerSymbol: z.number().positive(),
      method: z.enum(['gardner', 'mueller_muller']).default('gardner'),
    }))
    .mutation(async ({ input }) => {
      const iqArray = new Float32Array(input.iqSamples);
      const result = await demodulationBridge.recoverSymbols(
        iqArray,
        input.samplesPerSymbol,
        input.method
      );
      return result;
    }),

  /**
   * Complete demodulation pipeline
   */
  demodulate: publicProcedure
    .input(z.object({
      iqSamples: z.array(z.number()),
      sampleRate: z.number().positive(),
      modulationType: z.string(),
      samplesPerSymbol: z.number().positive(),
    }))
    .mutation(async ({ input }) => {
      const iqArray = new Float32Array(input.iqSamples);
      const result = await demodulationBridge.demodulate(
        iqArray,
        input.sampleRate,
        input.modulationType,
        input.samplesPerSymbol
      );
      return result;
    }),

  /**
   * Get supported modulation types
   */
  getSupportedModulations: publicProcedure
    .query(() => {
      return {
        modulations: [
          { value: 'bpsk', label: 'BPSK', samplesPerSymbol: 8 },
          { value: 'qpsk', label: 'QPSK', samplesPerSymbol: 8 },
          { value: '8psk', label: '8-PSK', samplesPerSymbol: 8 },
          { value: '16qam', label: '16-QAM', samplesPerSymbol: 8 },
          { value: '64qam', label: '64-QAM', samplesPerSymbol: 8 },
          { value: 'gmsk', label: 'GMSK', samplesPerSymbol: 10 },
          { value: '2fsk', label: '2-FSK', samplesPerSymbol: 8 },
          { value: '4fsk', label: '4-FSK', samplesPerSymbol: 8 },
          { value: 'ofdm', label: 'OFDM', samplesPerSymbol: 64 },
        ],
        cfoMethods: [
          { value: 'power', label: 'Power Method (Fast)', description: 'Autocorrelation-based, good for most cases' },
          { value: 'kay', label: 'Kay Estimator (High SNR)', description: 'Optimal for high SNR scenarios' },
          { value: 'fitz', label: 'Fitz ML (Robust)', description: 'Maximum likelihood, more robust' },
        ],
        timingMethods: [
          { value: 'gardner', label: 'Gardner TED', description: 'Non-data-aided, works for most PSK/QAM' },
          { value: 'mueller_muller', label: 'Mueller-Muller', description: 'Data-aided, better performance' },
        ],
      };
    }),
});
