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
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { nanoid } from 'nanoid';
import { generateSigMFMetadata as generateRawIQMetadata, isValidDatatype, validateFileSize, type RawIQMetadata } from './sigmfGenerator';
import { runFAMAnalysis, classifyModulation } from './pythonBridge';
import { fetchIQSamples, validateSampleRange } from './iqDataFetcher';
import { parseIQData, computeSCF, classifyModulation as classifyModulationJS } from './dsp';
import { runSNRCFOEstimation } from './snrCfoBridge';

// Helper to convert flat array to 2D matrix
function convertToNestedArray(flat: Float32Array, rows: number, cols: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < rows; i++) {
    result.push(Array.from(flat.slice(i * cols, (i + 1) * cols)));
  }
  return result;
}

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
     * Upload raw IQ file with manual metadata parameters
     * Automatically generates SigMF metadata wrapper
     */
    uploadRawIQ: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        datatype: z.string(),
        sampleRate: z.number(),
        centerFrequency: z.number().optional(),
        hardware: z.string().optional(),
        author: z.string().optional(),
        dataFileSize: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Validate datatype
        if (!isValidDatatype(input.datatype)) {
          throw new Error(`Invalid datatype: ${input.datatype}. Must be a valid SigMF datatype (e.g., cf32_le, ci16_le, cu8)`);
        }
        
        // Validate file size matches datatype
        if (!validateFileSize(input.dataFileSize, input.datatype)) {
          throw new Error(`File size ${input.dataFileSize} bytes is not a valid multiple of sample size for datatype ${input.datatype}`);
        }

        // Generate SigMF metadata
        const metadataParams: RawIQMetadata = {
          name: input.name,
          description: input.description,
          datatype: input.datatype,
          sampleRate: input.sampleRate,
          centerFrequency: input.centerFrequency,
          hardware: input.hardware,
          author: input.author || ctx.user.name || undefined,
        };
        
        const metadataJson = generateRawIQMetadata(metadataParams);
        
        // Generate unique file keys for S3
        const fileId = nanoid();
        const metaFileKey = `${ctx.user.id}/signals/${fileId}.sigmf-meta`;
        const dataFileKey = `${ctx.user.id}/signals/${fileId}.sigmf-data`;

        // Upload metadata file to S3
        const metaResult = await storagePut(
          metaFileKey,
          metadataJson,
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
          datatype: input.datatype,
          sampleRate: input.sampleRate,
          hardware: input.hardware || null,
          author: input.author || ctx.user.name || null,
          sha512: null, // Will be calculated after data upload
          dataFileSize: input.dataFileSize,
          status: "uploaded",
        });

        return {
          captureId: capture.id,
          metaFileUrl: metaResult.url,
          dataFileKey,
          generatedMetadata: metadataJson,
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

    /**
     * Run FAM (Cyclostationary) Analysis on a signal region
     */
    analyzeCycles: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        sampleStart: z.number(),
        sampleCount: z.number(),
        nfft: z.number().optional(),
        overlap: z.number().optional(),
        alphaMax: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const capture = await getSignalCaptureById(input.captureId);
        if (!capture) throw new Error("Capture not found");
        if (!capture.dataFileUrl) throw new Error("Data file not available");

        // Validate sample range
        const isValid = validateSampleRange(
          capture.datatype || 'cf32_le',
          input.sampleStart,
          input.sampleCount,
          capture.dataFileSize || 0
        );
        if (!isValid) throw new Error("Invalid sample range");

        // Fetch IQ samples from S3
        const { iqReal, iqImag } = await fetchIQSamples(
          capture.dataFileUrl,
          capture.datatype || 'cf32_le',
          input.sampleStart,
          input.sampleCount
        );
        
        // Run Python FAM algorithm with GPU acceleration
        try {
          const result = await runFAMAnalysis(
            iqReal,
            iqImag,
            capture.sampleRate || 1e6,
            {
              nfft: input.nfft || 256,
              overlap: input.overlap || 0.5,
              alpha_max: input.alphaMax || 1.0,
            }
          );
          
          // Convert Python result to frontend format
          return {
            alpha: Array.from(result.cyclic_freqs),
            freq: Array.from(result.spectral_freqs),
            scf: convertToNestedArray(result.scf_magnitude, result.shape.cyclic, result.shape.spectral),
            cyclicProfile: Array.from(result.cyclic_profile),
          };
        } catch (pythonError) {
          // Fallback to JavaScript if Python fails
          console.warn('Python FAM failed, falling back to JavaScript:', pythonError);
          const samples = Array.from(iqReal).map((re, i) => ({ re, im: iqImag[i] }));
          const jsResult = computeSCF(samples, 32, 64);
          
          return {
            alpha: jsResult.alpha,
            freq: jsResult.freq,
            scf: jsResult.scf,
            cyclicProfile: jsResult.cyclicProfile,
          };
        }
      }),

    /**
     * Classify modulation type using TorchSig ML
     */
    classifyModulation: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        sampleStart: z.number(),
        sampleCount: z.number(),
        topK: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const capture = await getSignalCaptureById(input.captureId);
        if (!capture) throw new Error("Capture not found");
        if (!capture.dataFileUrl) throw new Error("Data file not available");

        // Validate sample range
        const isValid = validateSampleRange(
          capture.datatype || 'cf32_le',
          input.sampleStart,
          input.sampleCount,
          capture.dataFileSize || 0
        );
        if (!isValid) throw new Error("Invalid sample range");

        // Fetch IQ samples from S3
        const { iqReal, iqImag } = await fetchIQSamples(
          capture.dataFileUrl,
          capture.datatype || 'cf32_le',
          input.sampleStart,
          input.sampleCount
        );
        
        // Run Python TorchSig classification with GPU acceleration
        try {
          const result = await classifyModulation(
            iqReal,
            iqImag,
            {
              top_k: input.topK || 5,
            }
          );
          
          return {
            predictions: result.predictions.map(p => ({
              modulation: p.modulation,
              confidence: p.confidence,
              probability: p.probability,
            })),
            warning: result.warning,
          };
        } catch (pythonError) {
          // Fallback to JavaScript if Python fails
          console.warn('Python classification failed, falling back to JavaScript:', pythonError);
          const samples = Array.from(iqReal).map((re, i) => ({ re, im: iqImag[i] }));
          const classifications = classifyModulationJS(samples);
          
          const topK = input.topK || 3;
          return {
            predictions: classifications.slice(0, topK).map(c => ({
              modulation: c.modulation,
              confidence: c.confidence,
              probability: c.confidence / 100,
            })),
          };
        }
      }),

    /**
     * Estimate SNR and CFO using M2M4 and power methods
     */
    estimateSNRCFO: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        sampleStart: z.number(),
        sampleCount: z.number(),
        modulationType: z.string().optional(),
        symbolRate: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const capture = await getSignalCaptureById(input.captureId);
        if (!capture) throw new Error("Capture not found");
        if (!capture.dataFileUrl) throw new Error("Data file not available");
        if (!capture.sampleRate) throw new Error("Sample rate not available");

        // Fetch IQ samples
        const { iqReal, iqImag } = await fetchIQSamples(
          capture.dataFileUrl,
          capture.datatype || 'cf32_le',
          input.sampleStart,
          input.sampleCount
        );

        try {
          // Run Python SNR/CFO estimation
          const result = await runSNRCFOEstimation(
            iqReal,
            iqImag,
            capture.sampleRate,
            {
              modulationType: input.modulationType,
              symbolRate: input.symbolRate,
              estimateCfo: true,
            }
          );

          return result;
        } catch (pythonError) {
          console.warn('Python SNR/CFO estimation failed:', pythonError);
          throw new Error('SNR/CFO estimation failed');
        }
      }),

    /**
     * Export forensic report as PDF
     */
    exportReport: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        includeAnnotations: z.boolean().optional(),
        includeClassification: z.boolean().optional(),
        includeCyclicProfile: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const capture = await getSignalCaptureById(input.captureId);
        if (!capture) throw new Error("Capture not found");

        const reportData: any = {
          capture: {
            name: capture.name,
            description: capture.description,
            sampleRate: capture.sampleRate,
            centerFrequency: null, // Not in schema
            datatype: capture.datatype,
            hardware: capture.hardware,
            author: capture.author,
            createdAt: capture.createdAt,
          },
        };

        // Include annotations if requested
        if (input.includeAnnotations) {
          const annotations = await getCaptureAnnotations(input.captureId);
          reportData.annotations = annotations.map(ann => ({
            label: ann.label || 'Unlabeled',
            sampleStart: ann.sampleStart,
            sampleEnd: ann.sampleStart + ann.sampleCount,
            color: ann.color,
            notes: null,
          }));
        }

        // Generate PDF
        const { generateForensicReport } = await import('./pdfReportGenerator');
        const pdfBuffer = await generateForensicReport(reportData);

        // Return base64 for client download
        return {
          pdf: pdfBuffer.toString('base64'),
          filename: `${capture.name.replace(/[^a-z0-9]/gi, '_')}_report.pdf`,
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
     * Export annotations to SigMF format for a single capture
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

        return { metadata, captureName: capture.name };
      }),

    /**
     * Batch export annotations for multiple captures to SigMF format
     */
    exportBatch: protectedProcedure
      .input(z.object({ captureIds: z.array(z.number()) }))
      .query(async ({ input, ctx }) => {
        const exports: Array<{
          captureId: number;
          captureName: string;
          metadata: string;
          annotationCount: number;
        }> = [];

        for (const captureId of input.captureIds) {
          const capture = await getSignalCaptureById(captureId);
          if (!capture) continue; // Skip missing captures

          const annotations = await getCaptureAnnotations(captureId);
          
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

          exports.push({
            captureId,
            captureName: capture.name,
            metadata,
            annotationCount: annotations.length,
          });
        }

        return { exports };
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

  // Advanced signal processing routers
  advancedProcessing: router({
    // Higher-order statistics
    calculateCumulants: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        orders: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input }) => {
        // Mock I/Q data - in production would load from S3
        const mockSignal = Array.from({ length: 1000 }, (_, i) => ({
          real: Math.cos(2 * Math.PI * i / 100) + Math.random() * 0.1,
          imag: Math.sin(2 * Math.PI * i / 100) + Math.random() * 0.1,
        }));
        
        const signalJson = JSON.stringify(mockSignal).replace(/'/g, "\\'");
        const { stdout } = await execAsync(
          `python3.11 server/signal_processing.py cumulants '${signalJson}'`
        );
        
        return JSON.parse(stdout);
      }),
    
    // Wavelet packet decomposition
    waveletDecomposition: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        wavelet: z.enum(['db4', 'db6', 'db8', 'morlet']).optional(),
        level: z.number().min(1).max(5).optional(),
      }))
      .mutation(async ({ input }) => {
        const mockSignal = Array.from({ length: 1024 }, (_, i) => 
          Math.cos(2 * Math.PI * i / 64) + Math.random() * 0.2
        );
        
        const wavelet = input.wavelet || 'db4';
        const signalJson = JSON.stringify(mockSignal).replace(/'/g, "\\'");
        const { stdout } = await execAsync(
          `python3.11 server/signal_processing.py wavelet '${signalJson}' ${wavelet}`
        );
        
        return JSON.parse(stdout);
      }),
    
    // Synchrosqueezing transform
    synchrosqueezingTransform: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        sampleRate: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const mockSignal = Array.from({ length: 512 }, (_, i) => ({
          real: Math.cos(2 * Math.PI * i / 32),
          imag: Math.sin(2 * Math.PI * i / 32),
        }));
        
        const sampleRate = input.sampleRate || 1e6;
        const signalJson = JSON.stringify(mockSignal).replace(/'/g, "\\'");
        const { stdout } = await execAsync(
          `python3.11 server/signal_processing.py synchrosqueeze '${signalJson}' ${sampleRate}`
        );
        
        return JSON.parse(stdout);
      }),
    
    // Bispectrum analysis
    bispectrumAnalysis: protectedProcedure
      .input(z.object({
        captureId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const mockSignal = Array.from({ length: 256 }, (_, i) => ({
          real: Math.cos(2 * Math.PI * i / 16) * (1 + 0.3 * Math.cos(2 * Math.PI * i / 8)),
          imag: Math.sin(2 * Math.PI * i / 16) * (1 + 0.3 * Math.cos(2 * Math.PI * i / 8)),
        }));
        
        const signalJson = JSON.stringify(mockSignal).replace(/'/g, "\\'");
        const { stdout } = await execAsync(
          `python3.11 server/signal_processing.py bispectrum '${signalJson}'`
        );
        
        return JSON.parse(stdout);
      }),
  }),
  
  // RF-DNA fingerprinting and ML classification
  rfDna: router({
    // Extract RF-DNA features
    extractFeatures: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        regions: z.number().min(5).max(50).optional(),
      }))
      .mutation(async ({ input }) => {
        const mockSignal = Array.from({ length: 2000 }, (_, i) => ({
          real: Math.cos(2 * Math.PI * i / 100) * (1 + 0.05 * Math.random()),
          imag: Math.sin(2 * Math.PI * i / 100) * (1 + 0.05 * Math.random()),
        }));
        
        const signalJson = JSON.stringify(mockSignal).replace(/'/g, "\\'");
        const { stdout } = await execAsync(
          `python3.11 server/rf_dna.py rf_dna '${signalJson}'`
        );
        
        return JSON.parse(stdout);
      }),
    
    // Constellation-Based DNA
    constellationDna: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        modulation: z.enum(['QPSK', 'QAM16', 'QAM64']).optional(),
      }))
      .mutation(async ({ input }) => {
        const mockSignal = Array.from({ length: 1000 }, (_, i) => ({
          real: Math.cos(2 * Math.PI * i / 4) + Math.random() * 0.1,
          imag: Math.sin(2 * Math.PI * i / 4) + Math.random() * 0.1,
        }));
        
        const modulation = input.modulation || 'QPSK';
        const signalJson = JSON.stringify(mockSignal).replace(/'/g, "\\'");
        const { stdout } = await execAsync(
          `python3.11 server/rf_dna.py cb_dna '${signalJson}' ${modulation}`
        );
        
        return JSON.parse(stdout);
      }),
    
    // Preamble detection
    detectPreamble: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        preambleType: z.enum(['802.11', 'LTE', '5G_NR']).optional(),
      }))
      .mutation(async ({ input }) => {
        const mockSignal = Array.from({ length: 512 }, (_, i) => ({
          real: Math.cos(2 * Math.PI * i / 16),
          imag: Math.sin(2 * Math.PI * i / 16),
        }));
        
        const preambleType = input.preambleType || '802.11';
        const signalJson = JSON.stringify(mockSignal).replace(/'/g, "\\'");
        const { stdout } = await execAsync(
          `python3.11 server/rf_dna.py preamble '${signalJson}' ${preambleType}`
        );
        
        return JSON.parse(stdout);
      }),
    
    // Anomaly detection
    detectAnomaly: protectedProcedure
      .input(z.object({
        captureId: z.number(),
        threshold: z.number().min(0).max(1).optional(),
      }))
      .mutation(async ({ input }) => {
        const mockSignal = Array.from({ length: 1000 }, (_, i) => ({
          real: Math.cos(2 * Math.PI * i / 50) + (Math.random() - 0.5) * 0.5,
          imag: Math.sin(2 * Math.PI * i / 50) + (Math.random() - 0.5) * 0.5,
        }));
        
        const threshold = input.threshold || 0.5;
        const signalJson = JSON.stringify(mockSignal).replace(/'/g, "\\'");
        const { stdout } = await execAsync(
          `python3.11 server/rf_dna.py anomaly '${signalJson}' ${threshold}`
        );
        
        return JSON.parse(stdout);
      }),
    
    // Device classification
    classifyDevice: protectedProcedure
      .input(z.object({
        features: z.array(z.number()),
        numDevices: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const featuresJson = JSON.stringify(input.features).replace(/'/g, "\\'");
        const { stdout } = await execAsync(
          `python3.11 server/rf_dna.py classify '${featuresJson}'`
        );
        
        return JSON.parse(stdout);
      }),
  }),
});

export type AppRouter = typeof appRouter;
