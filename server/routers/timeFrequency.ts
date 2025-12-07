/**
 * Time-Frequency Analysis Router
 * 
 * Exposes WVD and Cohen's class distributions via tRPC
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { fetchIQSamples } from '../iqDataFetcher';
import {
  wignerVilleDistribution,
  pseudoWignerVille,
  smoothedPseudoWignerVille,
  choiWilliamsDistribution,
  bornJordanDistribution,
  wvdToDb,
} from '../algorithms/wignerVille';

export const timeFrequencyRouter = router({
  /**
   * Compute Wigner-Ville Distribution
   */
  wvd: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      sampleStart: z.number().min(0),
      sampleCount: z.number().min(64).max(1000000),
      nfft: z.number().optional().default(256),
      smoothing: z.boolean().optional().default(false),
      windowSize: z.number().optional().default(32),
      toDb: z.boolean().optional().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fetch IQ samples
      // TODO: Get dataFileUrl and datatype from capture metadata
      const { iqReal, iqImag } = await fetchIQSamples(
        '', // dataFileUrl - to be fetched from DB
        'cf32_le', // datatype - default complex float32
        input.sampleStart,
        input.sampleCount
      );
      
      // Compute WVD
      const { wvd, timeAxis, freqAxis } = wignerVilleDistribution(
        { i: iqReal, q: iqImag },
        {
          nfft: input.nfft,
          smoothing: input.smoothing,
          windowSize: input.windowSize,
        }
      );
      
      // Convert to dB if requested
      const result = input.toDb ? wvdToDb(wvd) : wvd;
      
      return {
        wvd: result.map(slice => Array.from(slice)),
        timeAxis: Array.from(timeAxis),
        freqAxis: Array.from(freqAxis),
        dimensions: {
          time: result.length,
          frequency: input.nfft,
        },
      };
    }),
  
  /**
   * Compute Pseudo Wigner-Ville Distribution
   */
  pwvd: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      sampleStart: z.number().min(0),
      sampleCount: z.number().min(64).max(1000000),
      windowSize: z.number().optional().default(32),
      nfft: z.number().optional().default(256),
      toDb: z.boolean().optional().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Get dataFileUrl and datatype from capture metadata
      const { iqReal, iqImag } = await fetchIQSamples(
        '', // dataFileUrl
        'cf32_le', // datatype
        input.sampleStart,
        input.sampleCount
      );
      
      const { pwvd, timeAxis, freqAxis } = pseudoWignerVille(
        { i: iqReal, q: iqImag },
        input.windowSize,
        input.nfft
      );
      
      const result = input.toDb ? wvdToDb(pwvd) : pwvd;
      
      return {
        pwvd: result.map(slice => Array.from(slice)),
        timeAxis: Array.from(timeAxis),
        freqAxis: Array.from(freqAxis),
        dimensions: {
          time: result.length,
          frequency: input.nfft,
        },
      };
    }),
  
  /**
   * Compute Smoothed Pseudo Wigner-Ville Distribution
   */
  spwvd: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      sampleStart: z.number().min(0),
      sampleCount: z.number().min(64).max(1000000),
      timeWindowSize: z.number().optional().default(16),
      freqWindowSize: z.number().optional().default(32),
      nfft: z.number().optional().default(256),
      toDb: z.boolean().optional().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Get dataFileUrl and datatype from capture metadata
      const { iqReal, iqImag } = await fetchIQSamples(
        '', // dataFileUrl
        'cf32_le', // datatype
        input.sampleStart,
        input.sampleCount
      );
      
      const { spwvd, timeAxis, freqAxis } = smoothedPseudoWignerVille(
        { i: iqReal, q: iqImag },
        input.timeWindowSize,
        input.freqWindowSize,
        input.nfft
      );
      
      const result = input.toDb ? wvdToDb(spwvd) : spwvd;
      
      return {
        spwvd: result.map(slice => Array.from(slice)),
        timeAxis: Array.from(timeAxis),
        freqAxis: Array.from(freqAxis),
        dimensions: {
          time: result.length,
          frequency: input.nfft,
        },
      };
    }),
  
  /**
   * Compute Choi-Williams Distribution
   */
  choiWilliams: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      sampleStart: z.number().min(0),
      sampleCount: z.number().min(64).max(1000000),
      sigma: z.number().optional().default(1.0),
      nfft: z.number().optional().default(256),
      toDb: z.boolean().optional().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Get dataFileUrl and datatype from capture metadata
      const { iqReal, iqImag } = await fetchIQSamples(
        '', // dataFileUrl
        'cf32_le', // datatype
        input.sampleStart,
        input.sampleCount
      );
      
      const { cwd, timeAxis, freqAxis } = choiWilliamsDistribution(
        { i: iqReal, q: iqImag },
        input.sigma,
        input.nfft
      );
      
      const result = input.toDb ? wvdToDb(cwd) : cwd;
      
      return {
        cwd: result.map(slice => Array.from(slice)),
        timeAxis: Array.from(timeAxis),
        freqAxis: Array.from(freqAxis),
        dimensions: {
          time: result.length,
          frequency: input.nfft,
        },
      };
    }),
  
  /**
   * Compute Born-Jordan Distribution
   */
  bornJordan: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      sampleStart: z.number().min(0),
      sampleCount: z.number().min(64).max(1000000),
      nfft: z.number().optional().default(256),
      toDb: z.boolean().optional().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Get dataFileUrl and datatype from capture metadata
      const { iqReal, iqImag } = await fetchIQSamples(
        '', // dataFileUrl
        'cf32_le', // datatype
        input.sampleStart,
        input.sampleCount
      );
      
      const { bjd, timeAxis, freqAxis } = bornJordanDistribution(
        { i: iqReal, q: iqImag },
        input.nfft
      );
      
      const result = input.toDb ? wvdToDb(bjd) : bjd;
      
      return {
        bjd: result.map(slice => Array.from(slice)),
        timeAxis: Array.from(timeAxis),
        freqAxis: Array.from(freqAxis),
        dimensions: {
          time: result.length,
          frequency: input.nfft,
        },
      };
    }),
});
