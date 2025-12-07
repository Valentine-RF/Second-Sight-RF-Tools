/**
 * Advanced Analysis Router
 * 
 * Combines protocol identification, blind source separation, and geolocation
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { fetchIQSamples } from '../iqDataFetcher';
import { detectProtocol, detectLTEPSS, schmidlCoxSync } from '../algorithms/protocolIdentification';
import { complexFastICA, nmfSpectrogram } from '../algorithms/blindSourceSeparation';
import {
  tdoaGeolocation,
  aoaGeolocation,
  rssGeolocation,
  hybridGeolocation,
  type SensorPosition,
} from '../algorithms/geolocation';

export const advancedAnalysisRouter = router({
  // ============ Protocol Identification ============
  
  /**
   * Detect protocol from IQ data
   */
  detectProtocol: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      sampleStart: z.number().min(0),
      sampleCount: z.number().min(1000).max(1000000),
      sampleRate: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { iqReal, iqImag } = await fetchIQSamples(
        '',
        'cf32_le',
        input.sampleStart,
        input.sampleCount
      );
      
      const result = detectProtocol(
        { i: iqReal, q: iqImag },
        input.sampleRate
      );
      
      return result;
    }),
  
  /**
   * Detect LTE PSS specifically
   */
  detectLTE: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      sampleStart: z.number().min(0),
      sampleCount: z.number().min(1000).max(1000000),
      sampleRate: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { iqReal, iqImag } = await fetchIQSamples(
        '',
        'cf32_le',
        input.sampleStart,
        input.sampleCount
      );
      
      const result = detectLTEPSS(
        { i: iqReal, q: iqImag },
        input.sampleRate
      );
      
      return result;
    }),
  
  /**
   * OFDM synchronization
   */
  ofdmSync: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      sampleStart: z.number().min(0),
      sampleCount: z.number().min(1000).max(1000000),
      symbolLength: z.number().optional().default(64),
    }))
    .mutation(async ({ ctx, input }) => {
      const { iqReal, iqImag } = await fetchIQSamples(
        '',
        'cf32_le',
        input.sampleStart,
        input.sampleCount
      );
      
      const result = schmidlCoxSync(
        { i: iqReal, q: iqImag },
        input.symbolLength
      );
      
      return result;
    }),
  
  // ============ Blind Source Separation ============
  
  /**
   * Complex FastICA for signal separation
   */
  fastICA: protectedProcedure
    .input(z.object({
      captureIds: z.array(z.number()).min(2).max(8),
      sampleStart: z.number().min(0),
      sampleCount: z.number().min(1000).max(100000),
      numSources: z.number().min(1).max(8),
      maxIterations: z.number().optional().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fetch mixtures from multiple captures
      const mixtures: Array<{ i: Float32Array; q: Float32Array }> = [];
      
      for (const captureId of input.captureIds) {
        const { iqReal, iqImag } = await fetchIQSamples(
          '',
          'cf32_le',
          input.sampleStart,
          input.sampleCount
        );
        mixtures.push({ i: iqReal, q: iqImag });
      }
      
      const result = complexFastICA(
        mixtures,
        input.numSources,
        input.maxIterations
      );
      
      return {
        sources: result.sources.map(src => ({
          i: Array.from(src.i),
          q: Array.from(src.q),
        })),
        convergence: result.convergence,
      };
    }),
  
  /**
   * NMF for spectrogram decomposition
   */
  nmf: protectedProcedure
    .input(z.object({
      spectrogram: z.array(z.array(z.number())),
      numComponents: z.number().min(1).max(20),
      maxIterations: z.number().optional().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const spectrogram = input.spectrogram.map(row => new Float32Array(row));
      
      const result = nmfSpectrogram(
        spectrogram,
        input.numComponents,
        input.maxIterations
      );
      
      return {
        W: result.W.map(row => Array.from(row)),
        H: result.H.map(row => Array.from(row)),
        reconstruction: result.reconstruction.map(row => Array.from(row)),
        iterations: result.iterations,
      };
    }),
  
  // ============ Geolocation ============
  
  /**
   * TDOA geolocation
   */
  tdoa: protectedProcedure
    .input(z.object({
      sensors: z.array(z.object({
        x: z.number(),
        y: z.number(),
        z: z.number().optional(),
        id: z.string(),
      })).min(3),
      timeDifferences: z.array(z.number()),
      speedOfLight: z.number().optional().default(299792458),
    }))
    .mutation(async ({ ctx, input }) => {
      const sensors: SensorPosition[] = input.sensors;
      
      const result = tdoaGeolocation(
        sensors,
        input.timeDifferences,
        input.speedOfLight
      );
      
      return result;
    }),
  
  /**
   * AOA geolocation
   */
  aoa: protectedProcedure
    .input(z.object({
      sensors: z.array(z.object({
        x: z.number(),
        y: z.number(),
        z: z.number().optional(),
        id: z.string(),
      })).min(2),
      bearings: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      const sensors: SensorPosition[] = input.sensors;
      
      const result = aoaGeolocation(
        sensors,
        input.bearings
      );
      
      return result;
    }),
  
  /**
   * RSS-based geolocation
   */
  rss: protectedProcedure
    .input(z.object({
      sensors: z.array(z.object({
        x: z.number(),
        y: z.number(),
        z: z.number().optional(),
        id: z.string(),
      })).min(3),
      rssi: z.array(z.number()),
      pathLossExponent: z.number().optional().default(2.0),
      referenceDistance: z.number().optional().default(1.0),
      referencePower: z.number().optional().default(-40),
    }))
    .mutation(async ({ ctx, input }) => {
      const sensors: SensorPosition[] = input.sensors;
      
      const result = rssGeolocation(
        sensors,
        input.rssi,
        input.pathLossExponent,
        input.referenceDistance,
        input.referencePower
      );
      
      return result;
    }),
  
  /**
   * Hybrid TDOA/AOA geolocation
   */
  hybrid: protectedProcedure
    .input(z.object({
      sensors: z.array(z.object({
        x: z.number(),
        y: z.number(),
        z: z.number().optional(),
        id: z.string(),
      })).min(3),
      timeDifferences: z.array(z.number()),
      bearings: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      const sensors: SensorPosition[] = input.sensors;
      
      const result = hybridGeolocation(
        sensors,
        input.timeDifferences,
        input.bearings
      );
      
      return result;
    }),
});
