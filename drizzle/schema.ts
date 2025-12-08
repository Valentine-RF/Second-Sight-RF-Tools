import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, float } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * SigMF signal capture files uploaded by users.
 * Stores metadata and S3 references for .sigmf-meta and .sigmf-data files.
 */
export const signalCaptures = mysqlTable("signal_captures", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // File metadata
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Local storage paths (PRIMARY - always populated)
  localMetaPath: varchar("localMetaPath", { length: 512 }),
  localDataPath: varchar("localDataPath", { length: 512 }),
  
  // S3 storage references (OPTIONAL - populated when ENABLE_S3_SYNC=true)
  metaFileKey: varchar("metaFileKey", { length: 512 }), // .sigmf-meta file key
  metaFileUrl: varchar("metaFileUrl", { length: 1024 }),
  dataFileKey: varchar("dataFileKey", { length: 512 }), // .sigmf-data file key
  dataFileUrl: varchar("dataFileUrl", { length: 1024 }),
  s3SyncStatus: mysqlEnum("s3SyncStatus", ["none", "pending", "synced", "failed"]).default("none"),
  
  // SigMF global metadata (parsed from .sigmf-meta)
  datatype: varchar("datatype", { length: 64 }), // e.g., cf32_le, ci16_le
  sampleRate: float("sampleRate"), // Hz
  hardware: text("hardware"), // core:hw
  author: varchar("author", { length: 255 }), // core:author
  sha512: varchar("sha512", { length: 128 }), // integrity hash
  
  // File size for range request support
  dataFileSize: int("dataFileSize"), // bytes
  
  // Processing status
  status: mysqlEnum("status", ["uploaded", "processing", "ready", "error"]).default("uploaded").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SignalCapture = typeof signalCaptures.$inferSelect;
export type InsertSignalCapture = typeof signalCaptures.$inferInsert;

/**
 * Annotations for signal captures (time-frequency regions of interest).
 * Corresponds to SigMF annotations array with forensic analysis results.
 */
export const annotations = mysqlTable("annotations", {
  id: int("id").autoincrement().primaryKey(),
  captureId: int("captureId").notNull(),
  
  // Time-frequency bounds
  sampleStart: int("sampleStart").notNull(), // core:sample_start
  sampleCount: int("sampleCount").notNull(), // core:sample_count
  freqLowerEdge: float("freqLowerEdge"), // Hz, core:freq_lower_edge
  freqUpperEdge: float("freqUpperEdge"), // Hz, core:freq_upper_edge
  
  // Analysis results
  label: varchar("label", { length: 255 }), // User-defined label
  modulationType: varchar("modulationType", { length: 64 }), // QPSK, BPSK, 16-QAM, etc.
  confidence: float("confidence"), // 0.0 to 1.0
  estimatedSNR: float("estimatedSNR"), // dB
  estimatedCFO: float("estimatedCFO"), // Hz
  estimatedBaud: float("estimatedBaud"), // symbols/sec
  
  // Color coding for UI
  color: varchar("color", { length: 32 }).default("#3b82f6"), // Hex color for flag/overlay
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Annotation = typeof annotations.$inferSelect;
export type InsertAnnotation = typeof annotations.$inferInsert;

/**
 * Processing jobs for async GPU-accelerated tasks.
 * Tracks FAM computation, TorchSig inference, demodulation status.
 */
export const processingJobs = mysqlTable("processing_jobs", {
  id: int("id").autoincrement().primaryKey(),
  captureId: int("captureId").notNull(),
  annotationId: int("annotationId"), // Optional: linked to specific annotation
  
  jobType: mysqlEnum("jobType", ["fam", "classification", "demodulation", "snr_estimation", "cfo_estimation"]).notNull(),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  
  // Job parameters (JSON)
  parameters: text("parameters"), // JSON string of input params
  
  // Results (JSON)
  results: text("results"), // JSON string of output data
  
  // Error tracking
  errorMessage: text("errorMessage"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = typeof processingJobs.$inferInsert;

/**
 * Comparison sessions table for storing analyst notes and settings
 */
export const comparisonSessions = mysqlTable("comparison_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }),
  notes: text("notes"),
  captureIds: text("captureIds").notNull(), // JSON array of capture IDs
  settings: text("settings"), // JSON object for sync state, zoom, etc.
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ComparisonSession = typeof comparisonSessions.$inferSelect;
export type InsertComparisonSession = typeof comparisonSessions.$inferInsert;

/**
 * Chat messages for natural language interface.
 * Stores conversation history for signal analysis queries.
 */
export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  captureId: int("captureId"), // Optional: context-specific to a signal capture
  
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

/**
 * Batch jobs table for GPU-accelerated analysis queue.
 * Tracks sequential job processing to prevent GPU contention.
 */
export const batchJobs = mysqlTable("batch_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Job configuration
  jobType: varchar("jobType", { length: 64 }).notNull(), // wvd, fam, rf_dna, classification, demodulation
  parameters: text("parameters"), // JSON string of job parameters
  
  // Status tracking
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  progress: int("progress").default(0), // 0-100 percentage
  
  // Results
  resultUrl: varchar("resultUrl", { length: 1024 }), // S3 URL to result file
  errorMessage: text("errorMessage"),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
});

export type BatchJob = typeof batchJobs.$inferSelect;
export type InsertBatchJob = typeof batchJobs.$inferInsert;
