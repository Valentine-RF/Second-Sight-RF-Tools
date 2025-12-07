import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { trainingDatasets, modelVersions } from "../../drizzle/schema";
import { getDb } from "../db";
import { eq, desc } from "drizzle-orm";

export const trainingRouter = router({
  // List all datasets for the current user
  listDatasets: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const datasets = await db
      .select()
      .from(trainingDatasets)
      .where(eq(trainingDatasets.userId, ctx.user.id))
      .orderBy(desc(trainingDatasets.createdAt));
    return datasets;
  }),

  // Upload a new dataset
  uploadDataset: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        format: z.enum(["radioml", "gnuradio", "custom"]),
        sampleCount: z.number(),
        modulationTypes: z.string(), // JSON string
        sampleRate: z.number().optional(),
        fileSize: z.number(),
        filePath: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(trainingDatasets).values({
        userId: ctx.user.id,
        name: input.name,
        description: input.description,
        format: input.format,
        sampleCount: input.sampleCount,
        modulationTypes: input.modulationTypes,
        sampleRate: input.sampleRate,
        fileSize: input.fileSize,
        filePath: input.filePath,
      });
      return { id: result.insertId };
    }),

  // Delete a dataset
  deleteDataset: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .delete(trainingDatasets)
        .where(eq(trainingDatasets.id, input.id));
      return { success: true };
    }),

  // List all trained models for the current user
  listModels: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const models = await db
      .select()
      .from(modelVersions)
      .where(eq(modelVersions.userId, ctx.user.id))
      .orderBy(desc(modelVersions.createdAt));
    return models;
  }),

  // Start training a new model
  startTraining: protectedProcedure
    .input(
      z.object({
        datasetId: z.number(),
        epochs: z.number(),
        batchSize: z.number(),
        learningRate: z.number(),
        validationSplit: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // In a real implementation, this would start a background training job
      // For now, we'll create a placeholder model entry
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(modelVersions).values({
        userId: ctx.user.id,
        name: `Model ${new Date().toISOString()}`,
        description: `Trained on dataset ${input.datasetId}`,
        datasetId: input.datasetId,
        epochs: input.epochs,
        batchSize: input.batchSize,
        learningRate: input.learningRate,
        accuracy: null,
        loss: null,
        confusionMatrix: null,
        modelPath: `models/model_${Date.now()}.json`,
        isActive: false,
      });
      return { id: result.insertId };
    }),

  // Set a model as active
  setActiveModel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      // Deactivate all other models
      await db
        .update(modelVersions)
        .set({ isActive: false })
        .where(eq(modelVersions.userId, ctx.user.id));

      // Activate the selected model
      await db
        .update(modelVersions)
        .set({ isActive: true })
        .where(eq(modelVersions.id, input.id));

      return { success: true };
    }),
});
