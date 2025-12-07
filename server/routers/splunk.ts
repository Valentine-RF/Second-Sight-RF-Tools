import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { getDb } from '../db';
import { splunkConfig } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { initSplunkClient, SplunkEventType } from '../splunkClient';

export const splunkRouter = router({
  /**
   * Get Splunk configuration for current user
   */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    
    const result = await db.select()
      .from(splunkConfig)
      .where(eq(splunkConfig.userId, ctx.user.id))
      .limit(1);
    
    if (result.length === 0) return null;
    
    // Don't expose the full HEC token
    const config = result[0];
    return {
      ...config,
      hecToken: config.hecToken ? `${config.hecToken.substring(0, 8)}...` : '',
    };
  }),
  
  /**
   * Create or update Splunk configuration
   */
  saveConfig: protectedProcedure
    .input(z.object({
      hecUrl: z.string().url(),
      hecToken: z.string().min(1),
      index: z.string().default('main'),
      source: z.string().default('second-sight-rf'),
      sourcetype: z.string().default('rf_signal_analysis'),
      enabledEventTypes: z.array(z.nativeEnum(SplunkEventType)).optional(),
      verifySsl: z.boolean().default(true),
      batchSize: z.number().int().min(1).max(100).default(10),
      flushInterval: z.number().int().min(1000).max(60000).default(5000),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      
      // Check if config exists
      const existing = await db.select()
        .from(splunkConfig)
        .where(eq(splunkConfig.userId, ctx.user.id))
        .limit(1);
      
      const enabledEventTypesJson = input.enabledEventTypes 
        ? JSON.stringify(input.enabledEventTypes)
        : JSON.stringify(Object.values(SplunkEventType)); // Enable all by default
      
      if (existing.length === 0) {
        // Create new config
        await db.insert(splunkConfig).values({
          userId: ctx.user.id,
          hecUrl: input.hecUrl,
          hecToken: input.hecToken,
          index: input.index,
          source: input.source,
          sourcetype: input.sourcetype,
          enabledEventTypes: enabledEventTypesJson,
          verifySsl: input.verifySsl,
          batchSize: input.batchSize,
          flushInterval: input.flushInterval,
          isActive: input.isActive,
        });
      } else {
        // Update existing config
        await db.update(splunkConfig)
          .set({
            hecUrl: input.hecUrl,
            hecToken: input.hecToken,
            index: input.index,
            source: input.source,
            sourcetype: input.sourcetype,
            enabledEventTypes: enabledEventTypesJson,
            verifySsl: input.verifySsl,
            batchSize: input.batchSize,
            flushInterval: input.flushInterval,
            isActive: input.isActive,
            updatedAt: new Date(),
          })
          .where(eq(splunkConfig.userId, ctx.user.id));
      }
      
      // Initialize Splunk client with new config
      if (input.isActive) {
        initSplunkClient({
          hecUrl: input.hecUrl,
          hecToken: input.hecToken,
          index: input.index,
          source: input.source,
          sourcetype: input.sourcetype,
          verifySsl: input.verifySsl,
          batchSize: input.batchSize,
          flushInterval: input.flushInterval,
        });
      }
      
      return { success: true };
    }),
  
  /**
   * Test Splunk connection
   */
  testConnection: protectedProcedure
    .input(z.object({
      hecUrl: z.string().url(),
      hecToken: z.string().min(1),
      index: z.string().optional(),
      verifySsl: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      
      // Create temporary client for testing
      const { SplunkClient } = await import('../splunkClient');
      const testClient = new SplunkClient({
        hecUrl: input.hecUrl,
        hecToken: input.hecToken,
        index: input.index || 'main',
        verifySsl: input.verifySsl,
      });
      
      const result = await testClient.testConnection();
      testClient.stop();
      
      // Update test status in database
      await db.update(splunkConfig)
        .set({
          lastTestAt: new Date(),
          lastTestSuccess: result.success,
          lastTestMessage: result.message,
        })
        .where(eq(splunkConfig.userId, ctx.user.id));
      
      return result;
    }),
  
  /**
   * Get available event types
   */
  getEventTypes: protectedProcedure.query(() => {
    return Object.values(SplunkEventType).map(type => ({
      value: type,
      label: type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    }));
  }),
  
  /**
   * Disable Splunk integration
   */
  disable: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    
    await db.update(splunkConfig)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(splunkConfig.userId, ctx.user.id));
    
    return { success: true };
  }),
});
