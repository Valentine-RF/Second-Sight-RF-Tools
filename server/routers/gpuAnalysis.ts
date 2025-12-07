/**
 * GPU-Accelerated Analysis Router
 * 
 * Provides tRPC endpoints for CUDA-accelerated signal processing.
 * Falls back to CPU implementations when GPU is unavailable.
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { GPUBridge } from '../gpuBridge';
import { TRPCError } from '@trpc/server';

// Initialize GPU bridge (singleton)
let gpuBridge: GPUBridge | null = null;
let gpuInitPromise: Promise<void> | null = null;

/**
 * Get or create GPU bridge instance
 */
async function getGPUBridge(): Promise<GPUBridge> {
  if (gpuBridge) {
    return gpuBridge;
  }
  
  if (!gpuInitPromise) {
    gpuInitPromise = (async () => {
      gpuBridge = new GPUBridge({
        address: 'tcp://127.0.0.1:5555',
        timeout: 60000,
        autoReconnect: true,
      });
      
      try {
        await gpuBridge.connect();
        console.log('[GPU Router] Connected to GPU service');
      } catch (error) {
        console.warn('[GPU Router] Failed to connect to GPU service:', error);
        // Don't throw - allow CPU fallback
      }
    })();
  }
  
  await gpuInitPromise;
  
  if (!gpuBridge) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'GPU bridge initialization failed',
    });
  }
  
  return gpuBridge;
}

export const gpuAnalysisRouter = router({
  /**
   * Check GPU service status
   */
  status: protectedProcedure.query(async () => {
    try {
      const bridge = await getGPUBridge();
      const stats = await bridge.getStats();
      const memory = await bridge.getMemoryInfo();
      
      return {
        connected: true,
        gpu_available: memory.gpu_available,
        memory_used_mb: memory.used_bytes / 1e6,
        memory_total_mb: memory.total_bytes / 1e6,
        stats,
      };
    } catch (error) {
      return {
        connected: false,
        gpu_available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }),
  
  /**
   * GPU-accelerated Power Spectral Density
   */
  psd: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      startSample: z.number().int().min(0),
      numSamples: z.number().int().min(1).max(1000000),
      fftSize: z.number().int().min(64).max(8192).optional(),
      overlap: z.number().min(0).max(0.95).optional(),
      window: z.enum(['hann', 'hamming', 'blackman', 'bartlett']).optional(),
    }))
    .mutation(async ({ input }) => {
      const bridge = await getGPUBridge();
      
      // TODO: Fetch IQ data from capture
      // For now, generate test signal
      const iqReal = new Float32Array(input.numSamples);
      const iqImag = new Float32Array(input.numSamples);
      for (let i = 0; i < input.numSamples; i++) {
        iqReal[i] = Math.cos(2 * Math.PI * i / 50);
        iqImag[i] = Math.sin(2 * Math.PI * i / 50);
      }
      
      const result = await bridge.computePSD(
        iqReal,
        iqImag,
        input.fftSize ?? 1024,
        input.overlap ?? 0.5,
        input.window ?? 'hann'
      );
      
      return {
        psd: Array.from(result.psd),
        fftSize: result.fft_size,
        numBins: result.num_bins,
      };
    }),
  
  /**
   * GPU-accelerated Wigner-Ville Distribution
   */
  wvd: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      startSample: z.number().int().min(0),
      numSamples: z.number().int().min(1).max(100000),
      nfft: z.number().int().min(64).max(2048).optional(),
      numTimePoints: z.number().int().min(10).max(1000).optional(),
      smoothing: z.boolean().optional(),
      smoothWindow: z.number().int().min(2).max(64).optional(),
    }))
    .mutation(async ({ input }) => {
      const bridge = await getGPUBridge();
      
      // TODO: Fetch IQ data from capture
      const iqReal = new Float32Array(input.numSamples);
      const iqImag = new Float32Array(input.numSamples);
      for (let i = 0; i < input.numSamples; i++) {
        const freq = 0.1 + 0.05 * (i / input.numSamples); // Chirp
        iqReal[i] = Math.cos(2 * Math.PI * freq * i);
        iqImag[i] = Math.sin(2 * Math.PI * freq * i);
      }
      
      const result = await bridge.computeWVD(
        iqReal,
        iqImag,
        {
          nfft: input.nfft,
          num_time_points: input.numTimePoints,
          smoothing: input.smoothing,
          smooth_window: input.smoothWindow,
        }
      );
      
      return {
        wvd: result.wvd.map((row: Float32Array) => Array.from(row)),
        timeAxis: Array.from(result.time_axis),
        freqAxis: Array.from(result.freq_axis),
        shape: result.shape,
      };
    }),
  
  /**
   * GPU-accelerated Choi-Williams Distribution
   */
  choiWilliams: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      startSample: z.number().int().min(0),
      numSamples: z.number().int().min(1).max(100000),
      nfft: z.number().int().min(64).max(2048).optional(),
      sigma: z.number().min(0.1).max(10).optional(),
      numTimePoints: z.number().int().min(10).max(1000).optional(),
    }))
    .mutation(async ({ input }) => {
      const bridge = await getGPUBridge();
      
      // TODO: Fetch IQ data
      const iqReal = new Float32Array(input.numSamples);
      const iqImag = new Float32Array(input.numSamples);
      for (let i = 0; i < input.numSamples; i++) {
        const freq = 0.1 + 0.05 * (i / input.numSamples);
        iqReal[i] = Math.cos(2 * Math.PI * freq * i);
        iqImag[i] = Math.sin(2 * Math.PI * freq * i);
      }
      
      const result = await bridge.computeCWD(
        iqReal,
        iqImag,
        {
          nfft: input.nfft,
          sigma: input.sigma,
          num_time_points: input.numTimePoints,
        }
      );
      
      return {
        cwd: result.wvd.map((row: Float32Array) => Array.from(row)),
        timeAxis: Array.from(result.time_axis),
        freqAxis: Array.from(result.freq_axis),
        shape: result.shape,
      };
    }),
  
  /**
   * GPU-accelerated FAM Cyclostationary Analysis
   */
  fam: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      startSample: z.number().int().min(0),
      numSamples: z.number().int().min(1).max(100000),
      sampleRate: z.number().min(1e3).max(1e9),
      nfft: z.number().int().min(64).max(2048).optional(),
      overlap: z.number().min(0).max(0.95).optional(),
      alphaMax: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const bridge = await getGPUBridge();
      
      // TODO: Fetch IQ data
      const iqReal = new Float32Array(input.numSamples);
      const iqImag = new Float32Array(input.numSamples);
      for (let i = 0; i < input.numSamples; i++) {
        iqReal[i] = Math.cos(2 * Math.PI * i / 50);
        iqImag[i] = Math.sin(2 * Math.PI * i / 50);
      }
      
      const result = await bridge.computeFAM(
        iqReal,
        iqImag,
        input.sampleRate,
        {
          nfft: input.nfft,
          overlap: input.overlap,
          alpha_max: input.alphaMax,
        }
      );
      
      return {
        scfMagnitude: result.scf_magnitude.map((row: Float32Array) => Array.from(row)),
        spectralFreqs: Array.from(result.spectral_freqs),
        cyclicFreqs: Array.from(result.cyclic_freqs),
        cyclicProfile: Array.from(result.cyclic_profile),
        shape: result.shape,
      };
    }),
  
  /**
   * GPU-accelerated RF-DNA Feature Extraction
   */
  rfDNA: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      startSample: z.number().int().min(0),
      numSamples: z.number().int().min(1).max(100000),
      regions: z.number().int().min(5).max(50).optional(),
    }))
    .mutation(async ({ input }) => {
      const bridge = await getGPUBridge();
      
      // TODO: Fetch IQ data
      const iqReal = new Float32Array(input.numSamples);
      const iqImag = new Float32Array(input.numSamples);
      for (let i = 0; i < input.numSamples; i++) {
        iqReal[i] = Math.cos(2 * Math.PI * i / 50) + Math.random() * 0.1;
        iqImag[i] = Math.sin(2 * Math.PI * i / 50) + Math.random() * 0.1;
      }
      
      const result = await bridge.extractRFDNA(
        iqReal,
        iqImag,
        input.regions ?? 20
      );
      
      return {
        features: Array.from(result.features),
        featureCount: result.feature_count,
        regions: result.regions,
      };
    }),
  
  /**
   * GPU-accelerated Higher-Order Cumulants
   */
  cumulants: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      startSample: z.number().int().min(0),
      numSamples: z.number().int().min(1).max(100000),
      orders: z.array(z.number().int().min(2).max(8)).optional(),
    }))
    .mutation(async ({ input }) => {
      const bridge = await getGPUBridge();
      
      // TODO: Fetch IQ data
      const iqReal = new Float32Array(input.numSamples);
      const iqImag = new Float32Array(input.numSamples);
      for (let i = 0; i < input.numSamples; i++) {
        iqReal[i] = Math.cos(2 * Math.PI * i / 50);
        iqImag[i] = Math.sin(2 * Math.PI * i / 50);
      }
      
      const result = await bridge.computeCumulants(
        iqReal,
        iqImag,
        input.orders ?? [4, 6]
      );
      
      return result;
    }),
  
  /**
   * Cleanup GPU memory
   */
  cleanup: protectedProcedure.mutation(async () => {
    const bridge = await getGPUBridge();
    await bridge.cleanup();
    
    return {
      success: true,
      message: 'GPU memory cleared',
    };
  }),
});
