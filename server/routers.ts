import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getUserSignalCaptures,
  getSignalCaptureById,
  createSignalCapture,
  deleteSignalCapture,
  updateSignalCaptureStatus,
  getCaptureAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getCaptureJobs,
  createProcessingJob,
  updateProcessingJob,
  getProcessingJobById,
  createChatMessage,
  getChatHistory,
  createComparisonSession,
  updateComparisonSession,
  getComparisonSession,
  getUserComparisonSessions,
  deleteComparisonSession,
} from "./db";
import { parseSigMFMetadata, annotationToSigMF, generateSigMFMetadata } from "./sigmf";
import { storagePut, storageGet } from "./storage";
import { invokeLLM } from "./_core/llm";
import { nanoid } from "nanoid";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Signal Captures Management
  captures: router({
    /**
     * List all signal captures for the current user
     */
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserSignalCaptures(ctx.user.id);
    }),

    /**
     * Get a single signal capture by ID
     */
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getSignalCaptureById(input.id);
      }),

    /**
     * Upload SigMF metadata and get presigned URLs for data upload
     * Client will upload .sigmf-meta and .sigmf-data files to S3
     */
    initUpload: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        metadataJson: z.string(), // Raw JSON content of .sigmf-meta file
      }))
      .mutation(async ({ ctx, input }) => {
        // Parse and validate SigMF metadata
        const metadata = parseSigMFMetadata(input.metadataJson);
        
        // Generate unique file keys for S3
        const fileId = nanoid();
        const metaFileKey = `${ctx.user.id}/signals/${fileId}.sigmf-meta`;
        const dataFileKey = `${ctx.user.id}/signals/${fileId}.sigmf-data`;

        // Upload metadata file to S3
        const metaResult = await storagePut(
          metaFileKey,
          input.metadataJson,
          "application/json"
        );

        // Create database record
        const capture = await createSignalCapture({
          userId: ctx.user.id,
          name: input.name,
          description: input.description || null,
          metaFileKey,
          metaFileUrl: metaResult.url,
          dataFileKey,
          dataFileUrl: "", // Will be updated after data upload
          datatype: metadata.global["core:datatype"],
          sampleRate: metadata.global["core:sample_rate"],
          hardware: metadata.global["core:hw"] || null,
          author: metadata.global["core:author"] || null,
          sha512: metadata.global["core:sha512"] || null,
          dataFileSize: null,
          status: "uploaded",
        });

        return {
          captureId: capture.id,
          metaFileUrl: metaResult.url,
          dataFileKey,
        };
      }),

    /**
     * Complete upload after data file is uploaded to S3
     */
    completeUpload: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        dataFileUrl: z.string(),
        dataFileSize: z.number(),
      }))
      .mutation(async ({ input }) => {
        const capture = await getSignalCaptureById(input.captureId);
        if (!capture) throw new Error("Capture not found");

        // Update capture with data file info
        await updateSignalCaptureStatus(input.captureId, "ready");
        
        return { success: true };
      }),

    /**
     * Delete a signal capture and its S3 files
     */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // TODO: Delete S3 files before deleting database record
        await deleteSignalCapture(input.id);
        return { success: true };
      }),

    /**
     * Get signal data range for visualization
     * Returns binary data as base64 for specified sample range
     */
    getDataRange: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        sampleStart: z.number(),
        sampleCount: z.number(),
      }))
      .query(async ({ input }) => {
        const capture = await getSignalCaptureById(input.captureId);
        if (!capture) throw new Error("Capture not found");

        // TODO: Implement HTTP Range request to fetch specific samples
        // This will use Apache Arrow for zero-copy serialization
        
        return {
          sampleStart: input.sampleStart,
          sampleCount: input.sampleCount,
          datatype: capture.datatype,
          sampleRate: capture.sampleRate,
          // data: arrowBuffer (to be implemented)
        };
      }),
  }),

  // Annotations Management
  annotations: router({
    /**
     * List all annotations for a signal capture
     */
    list: protectedProcedure
      .input(z.object({ captureId: z.number() }))
      .query(async ({ input }) => {
        return getCaptureAnnotations(input.captureId);
      }),

    /**
     * Create a new annotation from user selection
     */
    create: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        sampleStart: z.number(),
        sampleCount: z.number(),
        freqLowerEdge: z.number().optional(),
        freqUpperEdge: z.number().optional(),
        label: z.string().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return createAnnotation({
          captureId: input.captureId,
          sampleStart: input.sampleStart,
          sampleCount: input.sampleCount,
          freqLowerEdge: input.freqLowerEdge || null,
          freqUpperEdge: input.freqUpperEdge || null,
          label: input.label || null,
          color: input.color || "#3b82f6",
          modulationType: null,
          confidence: null,
          estimatedSNR: null,
          estimatedCFO: null,
          estimatedBaud: null,
        });
      }),

    /**
     * Update annotation with analysis results
     */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        label: z.string().optional(),
        modulationType: z.string().optional(),
        confidence: z.number().optional(),
        estimatedSNR: z.number().optional(),
        estimatedCFO: z.number().optional(),
        estimatedBaud: z.number().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await updateAnnotation(id, updates);
        return { success: true };
      }),

    /**
     * Delete an annotation
     */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteAnnotation(input.id);
        return { success: true };
      }),

    /**
     * Export annotations to SigMF format
     */
    exportSigMF: protectedProcedure
      .input(z.object({ captureId: z.number() }))
      .query(async ({ input }) => {
        const capture = await getSignalCaptureById(input.captureId);
        if (!capture) throw new Error("Capture not found");

        const annotations = await getCaptureAnnotations(input.captureId);
        
        // Convert annotations to SigMF format
        const sigmfAnnotations = annotations.map(annotationToSigMF);

        // Generate complete metadata file
        const metadata = generateSigMFMetadata(
          {
            "core:datatype": capture.datatype || "cf32_le",
            "core:sample_rate": capture.sampleRate || 0,
            "core:hw": capture.hardware || undefined,
            "core:author": capture.author || undefined,
            "core:sha512": capture.sha512 || undefined,
          },
          [],
          sigmfAnnotations
        );

        return { metadata };
      }),
  }),

  // Signal Processing Jobs
  processing: router({
    /**
     * Start cyclostationary analysis (FAM algorithm)
     */
    analyzeCycles: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        annotationId: z.number().optional(),
        sampleStart: z.number(),
        sampleCount: z.number(),
      }))
      .mutation(async ({ input }) => {
        // Create processing job
        const job = await createProcessingJob({
          captureId: input.captureId,
          annotationId: input.annotationId || null,
          jobType: "fam",
          parameters: JSON.stringify({
            sampleStart: input.sampleStart,
            sampleCount: input.sampleCount,
          }),
          results: null,
          errorMessage: null,
          completedAt: null,
        });

        // TODO: Queue job for async processing
        // This will run FAM algorithm on GPU and store results

        return { jobId: job.id };
      }),

    /**
     * Classify modulation type using TorchSig
     */
    classifyModulation: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        annotationId: z.number().optional(),
        sampleStart: z.number(),
        sampleCount: z.number(),
      }))
      .mutation(async ({ input }) => {
        const job = await createProcessingJob({
          captureId: input.captureId,
          annotationId: input.annotationId || null,
          jobType: "classification",
          parameters: JSON.stringify({
            sampleStart: input.sampleStart,
            sampleCount: input.sampleCount,
          }),
          results: null,
          errorMessage: null,
          completedAt: null,
        });

        // TODO: Queue job for TorchSig inference

        return { jobId: job.id };
      }),

    /**
     * Estimate SNR using M2M4 estimator
     */
    estimateSNR: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        annotationId: z.number().optional(),
        sampleStart: z.number(),
        sampleCount: z.number(),
      }))
      .mutation(async ({ input }) => {
        const job = await createProcessingJob({
          captureId: input.captureId,
          annotationId: input.annotationId || null,
          jobType: "snr_estimation",
          parameters: JSON.stringify({
            sampleStart: input.sampleStart,
            sampleCount: input.sampleCount,
          }),
          results: null,
          errorMessage: null,
          completedAt: null,
        });

        // TODO: Queue job for SNR estimation

        return { jobId: job.id };
      }),

    /**
     * Get job status and results
     */
    getJob: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input }) => {
        return getProcessingJobById(input.jobId);
      }),

    /**
     * List all jobs for a capture
     */
    listJobs: protectedProcedure
      .input(z.object({ captureId: z.number() }))
      .query(async ({ input }) => {
        return getCaptureJobs(input.captureId);
      }),
  }),

  // Natural Language Interface
  chat: router({
    /**
     * Send a message and get AI response
     */
    sendMessage: protectedProcedure
      .input(z.object({
        message: z.string(),
        captureId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Save user message
        await createChatMessage({
          userId: ctx.user.id,
          captureId: input.captureId || null,
          role: "user",
          content: input.message,
        });

        // Get conversation history for context
        const history = await getChatHistory(ctx.user.id, input.captureId, 10);

        // Build messages for LLM
        const messages = [
          {
            role: "system" as const,
            content: "You are a forensic RF signal analysis assistant. Help users understand signal characteristics, modulation schemes, and analysis results. Provide clear explanations in plain language."
          },
          ...history.slice(-10).map(msg => ({
            role: msg.role as "user" | "assistant",
            content: msg.content
          })),
        ];

        // Get LLM response
        const response = await invokeLLM({ messages });
        const content = response.choices[0]?.message?.content;
        const assistantMessage = typeof content === 'string' ? content : "I apologize, but I couldn't generate a response.";

        // Save assistant message
        await createChatMessage({
          userId: ctx.user.id,
          captureId: input.captureId || null,
          role: "assistant",
          content: assistantMessage,
        });

        return { message: assistantMessage };
      }),

    /**
     * Get chat history
     */
    getHistory: protectedProcedure
      .input(z.object({
        captureId: z.number().optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return getChatHistory(ctx.user.id, input.captureId, input.limit);
      }),
  }),

  comparisonSessions: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        notes: z.string().optional(),
        captureIds: z.array(z.number()),
        settings: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await createComparisonSession({
          userId: ctx.user.id,
          name: input.name,
          notes: input.notes,
          captureIds: JSON.stringify(input.captureIds),
          settings: input.settings ? JSON.stringify(input.settings) : undefined,
        });
        return { success: true, id: result[0]?.insertId };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        notes: z.string().optional(),
        settings: z.any().optional(),
      }))
      .mutation(async ({ input }) => {
        await updateComparisonSession(input.id, {
          notes: input.notes,
          settings: input.settings ? JSON.stringify(input.settings) : undefined,
        });
        return { success: true };
      }),
    
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const session = await getComparisonSession(input.id);
        if (!session) return null;
        return {
          ...session,
          captureIds: JSON.parse(session.captureIds),
          settings: session.settings ? JSON.parse(session.settings) : null,
        };
      }),
    
    list: protectedProcedure
      .query(async ({ ctx }) => {
        const sessions = await getUserComparisonSessions(ctx.user.id);
        return sessions.map(s => ({
          ...s,
          captureIds: JSON.parse(s.captureIds),
          settings: s.settings ? JSON.parse(s.settings) : null,
        }));
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteComparisonSession(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
