/**
 * Batch Job Router - tRPC endpoints for BullMQ job queue
 * 
 * Provides API for submitting, monitoring, and managing batch analysis jobs.
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { jobQueue } from '../lib/job-queue';
import { getDb } from '../db';
import { batchJobs } from '../../drizzle/schema';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const batchRouter = router({
  /**
   * Submit a new batch job
   */
  submit: protectedProcedure
    .input(z.object({
      type: z.enum(['wvd', 'fam', 'rf_dna', 'classification', 'demodulation']),
      parameters: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input, ctx }) => {
      // Create job record in database
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const [job] = await db.insert(batchJobs).values({
        userId: ctx.user.id,
        jobType: input.type,
        status: 'pending',
        parameters: JSON.stringify(input.parameters),
        createdAt: new Date(),
      });

      const jobId = job.insertId;

      // Add job to queue
      await jobQueue.add(input.type, {
        jobId,
        userId: ctx.user.id,
        type: input.type,
        parameters: input.parameters,
      }, {
        jobId: jobId.toString(),
        attempts: 3,
      });

      return {
        jobId,
        status: 'pending',
      };
    }),

  /**
   * List user's batch jobs
   */
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const jobs = await db
        .select()
        .from(batchJobs)
        .where(eq(batchJobs.userId, ctx.user.id))
        .orderBy(desc(batchJobs.createdAt))
        .limit(50);

      return jobs.map((job: any) => ({
        id: job.id,
        type: job.jobType,
        status: job.status,
        progress: job.progress || 0,
        parameters: job.parameters ? JSON.parse(job.parameters) : {},
        result: job.resultUrl,
        error: job.errorMessage,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      }));
    }),

  /**
   * Get job details
   */
  get: protectedProcedure
    .input(z.object({
      jobId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const [job] = await db
        .select()
        .from(batchJobs)
        .where(eq(batchJobs.id, input.jobId));

      if (!job) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Job not found',
        });
      }

      if (job.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied',
        });
      }

      return {
        id: job.id,
        type: job.jobType,
        status: job.status,
        progress: job.progress || 0,
        parameters: job.parameters ? JSON.parse(job.parameters) : {},
        result: job.resultUrl,
        error: job.errorMessage,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      };
    }),

  /**
   * Get queue statistics
   */
  stats: protectedProcedure
    .query(async () => {
      const waiting = await jobQueue.getWaitingCount();
      const active = await jobQueue.getActiveCount();
      const completed = await jobQueue.getCompletedCount();
      const failed = await jobQueue.getFailedCount();

      return {
        waiting,
        active,
        completed,
        failed,
        total: waiting + active + completed + failed,
      };
    }),

  /**
   * Cancel a job
   */
  cancel: protectedProcedure
    .input(z.object({
      jobId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const [job] = await db
        .select()
        .from(batchJobs)
        .where(eq(batchJobs.id, input.jobId));

      if (!job) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Job not found',
        });
      }

      if (job.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied',
        });
      }

      // Remove from queue
      const queueJob = await jobQueue.getJob(input.jobId.toString());
      if (queueJob) {
        queueJob.status = 'failed';
      }

      // Update database
      await db
        .update(batchJobs)
        .set({
          status: 'failed',
          errorMessage: 'Cancelled by user',
          completedAt: new Date(),
        })
        .where(eq(batchJobs.id, input.jobId));

      return {
        success: true,
      };
    }),
});
