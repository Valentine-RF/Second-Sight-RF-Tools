import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import { getDb } from '../db';
import { apiKeys } from '../../drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';
import { randomBytes } from 'crypto';

/**
 * Generate a secure random API key
 */
function generateApiKey(): string {
  return `sk_${randomBytes(32).toString('hex')}`;
}

export const apiKeysRouter = router({
  /**
   * List all API keys for current user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    
    return db.select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, ctx.user.id))
      .orderBy(desc(apiKeys.createdAt));
  }),
  
  /**
   * Create a new API key
   */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      rateLimit: z.number().int().min(1).max(10000).default(100),
      expiresInDays: z.number().int().min(1).max(365).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      
      const key = generateApiKey();
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;
      
      await db.insert(apiKeys).values({
        userId: ctx.user.id,
        name: input.name,
        key,
        rateLimit: input.rateLimit,
        requestCount: 0,
        isActive: true,
        createdAt: new Date(),
        expiresAt,
      });
      
      // Fetch the created key to get its ID
      const created = await db.select()
        .from(apiKeys)
        .where(eq(apiKeys.key, key))
        .limit(1);
      
      return {
        id: created[0].id,
        key, // Only returned once at creation
        name: input.name,
        rateLimit: input.rateLimit,
        expiresAt,
      };
    }),
  
  /**
   * Update API key settings
   */
  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).max(255).optional(),
      rateLimit: z.number().int().min(1).max(10000).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      
      // Verify ownership
      const existing = await db.select()
        .from(apiKeys)
        .where(and(
          eq(apiKeys.id, input.id),
          eq(apiKeys.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (existing.length === 0) {
        throw new Error('API key not found');
      }
      
      const updates: any = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.rateLimit !== undefined) updates.rateLimit = input.rateLimit;
      if (input.isActive !== undefined) updates.isActive = input.isActive;
      
      await db.update(apiKeys)
        .set(updates)
        .where(eq(apiKeys.id, input.id));
      
      return { success: true };
    }),
  
  /**
   * Delete an API key
   */
  delete: protectedProcedure
    .input(z.object({
      id: z.number().int(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      
      // Verify ownership
      const existing = await db.select()
        .from(apiKeys)
        .where(and(
          eq(apiKeys.id, input.id),
          eq(apiKeys.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (existing.length === 0) {
        throw new Error('API key not found');
      }
      
      await db.delete(apiKeys)
        .where(eq(apiKeys.id, input.id));
      
      return { success: true };
    }),
  
  /**
   * Get usage statistics for an API key
   */
  getStats: protectedProcedure
    .input(z.object({
      id: z.number().int(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      
      const result = await db.select()
        .from(apiKeys)
        .where(and(
          eq(apiKeys.id, input.id),
          eq(apiKeys.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (result.length === 0) {
        throw new Error('API key not found');
      }
      
      const keyData = result[0];
      
      return {
        requestCount: keyData.requestCount,
        lastUsed: keyData.lastUsed,
        rateLimit: keyData.rateLimit,
        isActive: keyData.isActive,
        expiresAt: keyData.expiresAt,
      };
    }),
});
