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
  ChatMessage,
  comparisonSessions,
  InsertComparisonSession,
} from '../drizzle/schema';
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

type MemoryIds = {
  users: number;
  captures: number;
  annotations: number;
  jobs: number;
  chats: number;
  comparisons: number;
};

type MemoryStore = {
  signalCaptures: SignalCapture[];
  annotations: Annotation[];
  processingJobs: ProcessingJob[];
  chatMessages: ChatMessage[];
  comparisonSessions: (InsertComparisonSession & { id: number; createdAt: Date; updatedAt: Date })[];
};

const memoryIds: MemoryIds = {
  users: 1,
  captures: 1,
  annotations: 1,
  jobs: 1,
  chats: 1,
  comparisons: 1,
};

const memoryStore: MemoryStore = {
  signalCaptures: [],
  annotations: [],
  processingJobs: [],
  chatMessages: [],
  comparisonSessions: [],
};

function useMemoryStore() {
  return !process.env.DATABASE_URL;
}

function nextId(key: keyof MemoryIds) {
  const current = memoryIds[key];
  memoryIds[key] += 1;
  return current;
}

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

function buildSignalCaptureRecord(capture: InsertSignalCapture): SignalCapture {
  const now = new Date();
  return {
    ...capture,
    id: nextId('captures'),
    status: capture.status ?? 'uploaded',
    createdAt: capture.createdAt ?? now,
    updatedAt: capture.updatedAt ?? now,
  } as SignalCapture;
}

function buildAnnotationRecord(annotation: InsertAnnotation): Annotation {
  const now = new Date();
  return {
    ...annotation,
    id: nextId('annotations'),
    color: annotation.color ?? '#3b82f6',
    createdAt: annotation.createdAt ?? now,
    updatedAt: annotation.updatedAt ?? now,
  } as Annotation;
}

function buildProcessingJobRecord(job: InsertProcessingJob): ProcessingJob {
  const now = new Date();
  return {
    ...job,
    id: nextId('jobs'),
    status: job.status ?? 'pending',
    createdAt: job.createdAt ?? now,
    updatedAt: job.updatedAt ?? now,
    completedAt: job.completedAt ?? null,
  } as ProcessingJob;
}

function buildChatMessageRecord(message: InsertChatMessage): ChatMessage {
  const now = new Date();
  return {
    ...message,
    id: nextId('chats'),
    createdAt: message.createdAt ?? now,
  } as ChatMessage;
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
  if (!db && useMemoryStore()) {
    const record = buildSignalCaptureRecord(capture);
    memoryStore.signalCaptures.push(record);
    return record;
  }
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
  if (!db && useMemoryStore()) {
    return memoryStore.signalCaptures
      .filter((capture) => capture.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
  }
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
  if (!db && useMemoryStore()) {
    return memoryStore.signalCaptures.find((capture) => capture.id === id);
  }
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
  if (!db && useMemoryStore()) {
    const capture = memoryStore.signalCaptures.find((c) => c.id === id);
    if (!capture) return;
    capture.status = status;
    capture.updatedAt = new Date();
    return;
  }
  if (!db) throw new Error("Database not available");

  await db.update(signalCaptures).set({ status }).where(eq(signalCaptures.id, id));
}

/**
 * Delete a signal capture
 * @param id - Signal capture ID
 */
export async function deleteSignalCapture(id: number): Promise<void> {
  const db = await getDb();
  if (!db && useMemoryStore()) {
    memoryStore.signalCaptures = memoryStore.signalCaptures.filter((capture) => capture.id !== id);
    memoryStore.annotations = memoryStore.annotations.filter((annotation) => annotation.captureId !== id);
    return;
  }
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
  if (!db && useMemoryStore()) {
    const record = buildAnnotationRecord(annotation);
    memoryStore.annotations.push(record);
    return record;
  }
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
  if (!db && useMemoryStore()) {
    return memoryStore.annotations
      .filter((annotation) => annotation.captureId === captureId)
      .sort((a, b) => a.sampleStart - b.sampleStart);
  }
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
  if (!db && useMemoryStore()) {
    const annotation = memoryStore.annotations.find((a) => a.id === id);
    if (!annotation) return;
    Object.assign(annotation, updates);
    annotation.updatedAt = new Date();
    return;
  }
  if (!db) throw new Error("Database not available");

  await db.update(annotations).set(updates).where(eq(annotations.id, id));
}

/**
 * Delete an annotation
 * @param id - Annotation ID
 */
export async function deleteAnnotation(id: number): Promise<void> {
  const db = await getDb();
  if (!db && useMemoryStore()) {
    memoryStore.annotations = memoryStore.annotations.filter((annotation) => annotation.id !== id);
    return;
  }
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
  if (!db && useMemoryStore()) {
    const record = buildProcessingJobRecord(job);
    memoryStore.processingJobs.push(record);
    return record;
  }
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
  if (!db && useMemoryStore()) {
    return memoryStore.processingJobs.find((job) => job.id === id);
  }
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
  if (!db && useMemoryStore()) {
    const job = memoryStore.processingJobs.find((j) => j.id === id);
    if (!job) return;
    Object.assign(job, updates);
    job.updatedAt = new Date();
    return;
  }
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
  if (!db && useMemoryStore()) {
    return memoryStore.processingJobs
      .filter((job) => job.captureId === captureId)
      .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
  }
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
  if (!db && useMemoryStore()) {
    const record = buildChatMessageRecord(message);
    memoryStore.chatMessages.push(record);
    return record;
  }
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
  if (!db && useMemoryStore()) {
    const messages = memoryStore.chatMessages.filter((msg) => msg.userId === userId && (captureId === undefined || msg.captureId === captureId));
    const ordered = messages.sort((a, b) => (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0));
    return ordered.slice(0, limit);
  }
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

// Comparison Sessions
export async function createComparisonSession(session: InsertComparisonSession) {
  const db = await getDb();
  if (!db && useMemoryStore()) {
    const now = new Date();
    const record = { ...session, id: nextId('comparisons'), createdAt: now, updatedAt: now };
    memoryStore.comparisonSessions.push(record);
    return [{ insertId: record.id }];
  }
  if (!db) throw new Error('Database not available');
  
  const result = await db.insert(comparisonSessions).values(session);
  return result;
}

export async function updateComparisonSession(id: number, updates: Partial<InsertComparisonSession>) {
  const db = await getDb();
  if (!db && useMemoryStore()) {
    const session = memoryStore.comparisonSessions.find((s) => s.id === id);
    if (!session) return;
    Object.assign(session, updates);
    session.updatedAt = new Date();
    return;
  }
  if (!db) throw new Error('Database not available');
  
  await db.update(comparisonSessions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(comparisonSessions.id, id));
}

export async function getComparisonSession(id: number) {
  const db = await getDb();
  if (!db && useMemoryStore()) {
    return memoryStore.comparisonSessions.find((session) => session.id === id);
  }
  if (!db) return undefined;
  
  const result = await db.select()
    .from(comparisonSessions)
    .where(eq(comparisonSessions.id, id))
    .limit(1);
  
  return result[0];
}

export async function getUserComparisonSessions(userId: number) {
  const db = await getDb();
  if (!db && useMemoryStore()) {
    return memoryStore.comparisonSessions
      .filter((session) => session.userId === userId)
      .sort((a, b) => (b.updatedAt?.getTime?.() ?? 0) - (a.updatedAt?.getTime?.() ?? 0));
  }
  if (!db) return [];
  
  return db.select()
    .from(comparisonSessions)
    .where(eq(comparisonSessions.userId, userId))
    .orderBy(desc(comparisonSessions.updatedAt));
}

export async function deleteComparisonSession(id: number) {
  const db = await getDb();
  if (!db && useMemoryStore()) {
    memoryStore.comparisonSessions = memoryStore.comparisonSessions.filter((session) => session.id !== id);
    return;
  }
  if (!db) throw new Error('Database not available');
  
  await db.delete(comparisonSessions).where(eq(comparisonSessions.id, id));
}
