/**
 * Compressive Sensing Router
 * 
 * Exposes sparse signal recovery algorithms via tRPC
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import {
  orthogonalMatchingPursuit,
  compressiveSamplingMP,
  lasso,
  fista,
} from '../algorithms/compressiveSensing';

export const compressiveSensingRouter = router({
  /**
   * Orthogonal Matching Pursuit (OMP)
   */
  omp: protectedProcedure
    .input(z.object({
      measurements: z.array(z.number()),
      sensingMatrix: z.array(z.array(z.number())),
      sparsity: z.number().min(1),
      maxIterations: z.number().optional().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const measurements = new Float32Array(input.measurements);
      const sensingMatrix = input.sensingMatrix.map(row => new Float32Array(row));
      
      const result = orthogonalMatchingPursuit(
        measurements,
        sensingMatrix,
        input.sparsity,
        input.maxIterations
      );
      
      return {
        reconstructed: Array.from(result.reconstructed),
        support: result.support,
        iterations: result.iterations,
        residualNorm: result.residualNorm,
      };
    }),
  
  /**
   * Compressive Sampling Matching Pursuit (CoSaMP)
   */
  cosamp: protectedProcedure
    .input(z.object({
      measurements: z.array(z.number()),
      sensingMatrix: z.array(z.array(z.number())),
      sparsity: z.number().min(1),
      maxIterations: z.number().optional().default(100),
      tolerance: z.number().optional().default(1e-6),
    }))
    .mutation(async ({ ctx, input }) => {
      const measurements = new Float32Array(input.measurements);
      const sensingMatrix = input.sensingMatrix.map(row => new Float32Array(row));
      
      const result = compressiveSamplingMP(
        measurements,
        sensingMatrix,
        input.sparsity,
        input.maxIterations,
        input.tolerance
      );
      
      return {
        reconstructed: Array.from(result.reconstructed),
        support: result.support,
        iterations: result.iterations,
        residualNorm: result.residualNorm,
      };
    }),
  
  /**
   * LASSO (Least Absolute Shrinkage and Selection Operator)
   */
  lasso: protectedProcedure
    .input(z.object({
      measurements: z.array(z.number()),
      sensingMatrix: z.array(z.array(z.number())),
      lambda: z.number().optional().default(0.1),
      maxIterations: z.number().optional().default(1000),
      tolerance: z.number().optional().default(1e-6),
    }))
    .mutation(async ({ ctx, input }) => {
      const measurements = new Float32Array(input.measurements);
      const sensingMatrix = input.sensingMatrix.map(row => new Float32Array(row));
      
      const result = lasso(
        measurements,
        sensingMatrix,
        input.lambda,
        input.maxIterations,
        input.tolerance
      );
      
      return {
        reconstructed: Array.from(result.reconstructed),
        support: result.support,
        iterations: result.iterations,
        residualNorm: result.residualNorm,
      };
    }),
  
  /**
   * FISTA (Fast Iterative Shrinkage-Thresholding Algorithm)
   */
  fista: protectedProcedure
    .input(z.object({
      measurements: z.array(z.number()),
      sensingMatrix: z.array(z.array(z.number())),
      lambda: z.number().optional().default(0.1),
      maxIterations: z.number().optional().default(1000),
      tolerance: z.number().optional().default(1e-6),
    }))
    .mutation(async ({ ctx, input }) => {
      const measurements = new Float32Array(input.measurements);
      const sensingMatrix = input.sensingMatrix.map(row => new Float32Array(row));
      
      const result = fista(
        measurements,
        sensingMatrix,
        input.lambda,
        input.maxIterations,
        input.tolerance
      );
      
      return {
        reconstructed: Array.from(result.reconstructed),
        support: result.support,
        iterations: result.iterations,
        residualNorm: result.residualNorm,
      };
    }),
});
