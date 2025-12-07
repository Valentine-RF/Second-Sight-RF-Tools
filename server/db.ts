import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  signalCaptures, 
  InsertSignalCapture,
  SignalCapture,
  annotations,
  InsertAnnotation,
  Annotation,
  processingJobs,
  InsertProcessingJob,
  ProcessingJob,
  chatMessages,
  InsertChatMessage,
  ChatMessage
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== Signal Captures ====================

/**
 * Create a new signal capture record
 * @param capture - Signal capture data to insert
 * @returns The inserted signal capture with generated ID
 */
export async function createSignalCapture(capture: InsertSignalCapture): Promise<SignalCapture> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(signalCaptures).values(capture);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(signalCaptures).where(eq(signalCaptures.id, insertedId)).limit(1);
  if (!inserted[0]) throw new Error("Failed to retrieve inserted signal capture");
  
  return inserted[0];
}

/**
 * Get all signal captures for a user, ordered by most recent first
 * @param userId - User ID to filter by
 * @returns Array of signal captures
 */
export async function getUserSignalCaptures(userId: number): Promise<SignalCapture[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(signalCaptures).where(eq(signalCaptures.userId, userId)).orderBy(desc(signalCaptures.createdAt));
}

/**
 * Get a single signal capture by ID
 * @param id - Signal capture ID
 * @returns Signal capture or undefined
 */
export async function getSignalCaptureById(id: number): Promise<SignalCapture | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(signalCaptures).where(eq(signalCaptures.id, id)).limit(1);
  return result[0];
}

/**
 * Update signal capture status
 * @param id - Signal capture ID
 * @param status - New status value
 */
export async function updateSignalCaptureStatus(id: number, status: "uploaded" | "processing" | "ready" | "error"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(signalCaptures).set({ status }).where(eq(signalCaptures.id, id));
}

/**
 * Delete a signal capture
 * @param id - Signal capture ID
 */
export async function deleteSignalCapture(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(signalCaptures).where(eq(signalCaptures.id, id));
}

// ==================== Annotations ====================

/**
 * Create a new annotation for a signal capture
 * @param annotation - Annotation data to insert
 * @returns The inserted annotation with generated ID
 */
export async function createAnnotation(annotation: InsertAnnotation): Promise<Annotation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(annotations).values(annotation);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(annotations).where(eq(annotations.id, insertedId)).limit(1);
  if (!inserted[0]) throw new Error("Failed to retrieve inserted annotation");
  
  return inserted[0];
}

/**
 * Get all annotations for a signal capture
 * @param captureId - Signal capture ID
 * @returns Array of annotations
 */
export async function getCaptureAnnotations(captureId: number): Promise<Annotation[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(annotations).where(eq(annotations.captureId, captureId)).orderBy(annotations.sampleStart);
}

/**
 * Update an annotation
 * @param id - Annotation ID
 * @param updates - Fields to update
 */
export async function updateAnnotation(id: number, updates: Partial<Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(annotations).set(updates).where(eq(annotations.id, id));
}

/**
 * Delete an annotation
 * @param id - Annotation ID
 */
export async function deleteAnnotation(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(annotations).where(eq(annotations.id, id));
}

// ==================== Processing Jobs ====================

/**
 * Create a new processing job
 * @param job - Processing job data to insert
 * @returns The inserted job with generated ID
 */
export async function createProcessingJob(job: InsertProcessingJob): Promise<ProcessingJob> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(processingJobs).values(job);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(processingJobs).where(eq(processingJobs.id, insertedId)).limit(1);
  if (!inserted[0]) throw new Error("Failed to retrieve inserted processing job");
  
  return inserted[0];
}

/**
 * Get a processing job by ID
 * @param id - Job ID
 * @returns Processing job or undefined
 */
export async function getProcessingJobById(id: number): Promise<ProcessingJob | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(processingJobs).where(eq(processingJobs.id, id)).limit(1);
  return result[0];
}

/**
 * Update processing job status and results
 * @param id - Job ID
 * @param updates - Fields to update
 */
export async function updateProcessingJob(
  id: number, 
  updates: Partial<Omit<ProcessingJob, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(processingJobs).set(updates).where(eq(processingJobs.id, id));
}

/**
 * Get all jobs for a capture
 * @param captureId - Signal capture ID
 * @returns Array of processing jobs
 */
export async function getCaptureJobs(captureId: number): Promise<ProcessingJob[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(processingJobs).where(eq(processingJobs.captureId, captureId)).orderBy(desc(processingJobs.createdAt));
}

// ==================== Chat Messages ====================

/**
 * Create a new chat message
 * @param message - Chat message data to insert
 * @returns The inserted message with generated ID
 */
export async function createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(chatMessages).values(message);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(chatMessages).where(eq(chatMessages.id, insertedId)).limit(1);
  if (!inserted[0]) throw new Error("Failed to retrieve inserted chat message");
  
  return inserted[0];
}

/**
 * Get chat history for a user, optionally filtered by capture
 * @param userId - User ID
 * @param captureId - Optional signal capture ID for context-specific chat
 * @param limit - Maximum number of messages to retrieve (default: 50)
 * @returns Array of chat messages ordered by creation time
 */
export async function getChatHistory(userId: number, captureId?: number, limit: number = 50): Promise<ChatMessage[]> {
  const db = await getDb();
  if (!db) return [];

  if (captureId !== undefined) {
    const messages = await db.select().from(chatMessages)
      .where(and(
        eq(chatMessages.userId, userId),
        eq(chatMessages.captureId, captureId)
      ))
      .orderBy(chatMessages.createdAt)
      .limit(limit);
    return messages;
  }
  
  const messages = await db.select().from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(chatMessages.createdAt)
    .limit(limit);
  return messages;
}
