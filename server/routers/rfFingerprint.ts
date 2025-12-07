/**
 * RF-DNA Fingerprinting Router
 * 
 * Exposes device fingerprinting and matching via tRPC
 */

import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { getDb } from '../db';
import { rfFingerprints, fingerprintMatches } from '../../drizzle/rf_fingerprints_schema';
import { eq, desc } from 'drizzle-orm';
import { fetchIQSamples } from '../iqDataFetcher';
import {
  extractRFFingerprint,
  matchFingerprint,
  type RFFingerprint,
} from '../algorithms/rfFingerprinting';

export const rfFingerprintRouter = router({
  /**
   * Extract RF fingerprint from capture
   */
  extract: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      sampleStart: z.number().min(0),
      sampleCount: z.number().min(1000).max(1000000),
      sampleRate: z.number(),
      centerFreq: z.number(),
      deviceId: z.string().optional(),
      deviceType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      // Fetch IQ samples
      const { iqReal, iqImag } = await fetchIQSamples(
        '', // TODO: Get from capture metadata
        'cf32_le',
        input.sampleStart,
        input.sampleCount
      );
      
      // Extract fingerprint
      const fingerprint = extractRFFingerprint(
        { i: iqReal, q: iqImag },
        input.sampleRate,
        input.centerFreq
      );
      
      // Store in database
      await db.insert(rfFingerprints).values({
        userId: ctx.user.id,
        deviceId: input.deviceId || `device_${Date.now()}`,
        deviceType: input.deviceType || 'unknown',
        amplitudeFeatures: Array.from(fingerprint.transientFeatures.amplitude),
        phaseFeatures: Array.from(fingerprint.transientFeatures.phase),
        frequencyFeatures: Array.from(fingerprint.transientFeatures.frequency),
        spectralRegrowth: fingerprint.spectralFeatures.spectralRegrowth,
        adjacentChannelPower: fingerprint.spectralFeatures.adjacentChannelPower,
        powerSpectralDensity: Array.from(fingerprint.spectralFeatures.powerSpectralDensity),
        centerFreq: input.centerFreq,
        sampleRate: input.sampleRate,
        captureId: input.captureId,
        createdAt: new Date(),
        verified: 0,
      });
      
      return {
        success: true,
        fingerprint: {
          deviceId: fingerprint.deviceId,
          deviceType: fingerprint.deviceType,
          featureCount: {
            amplitude: fingerprint.transientFeatures.amplitude.length,
            phase: fingerprint.transientFeatures.phase.length,
            frequency: fingerprint.transientFeatures.frequency.length,
          },
          spectralFeatures: {
            spectralRegrowth: fingerprint.spectralFeatures.spectralRegrowth,
            adjacentChannelPower: fingerprint.spectralFeatures.adjacentChannelPower,
          },
        },
      };
    }),
  
  /**
   * Match fingerprint against database
   */
  match: protectedProcedure
    .input(z.object({
      captureId: z.number(),
      sampleStart: z.number().min(0),
      sampleCount: z.number().min(1000).max(1000000),
      sampleRate: z.number(),
      centerFreq: z.number(),
      threshold: z.number().optional().default(0.7),
      maxResults: z.number().optional().default(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      // Extract query fingerprint
      const { iqReal, iqImag } = await fetchIQSamples(
        '',
        'cf32_le',
        input.sampleStart,
        input.sampleCount
      );
      
      const queryFingerprint = extractRFFingerprint(
        { i: iqReal, q: iqImag },
        input.sampleRate,
        input.centerFreq
      );
      
      // Load reference fingerprints from database
      const references = await db.select()
        .from(rfFingerprints)
        .where(eq(rfFingerprints.userId, ctx.user.id))
        .limit(100); // Limit for performance
      
      // Convert to RFFingerprint format
      const refFingerprints: RFFingerprint[] = references.map(ref => ({
        deviceId: ref.deviceId,
        deviceType: ref.deviceType,
        transientFeatures: {
          amplitude: new Float32Array(ref.amplitudeFeatures as number[]),
          phase: new Float32Array(ref.phaseFeatures as number[]),
          frequency: new Float32Array(ref.frequencyFeatures as number[]),
        },
        spectralFeatures: {
          powerSpectralDensity: new Float32Array(ref.powerSpectralDensity as number[] || []),
          spectralRegrowth: ref.spectralRegrowth || 0,
          adjacentChannelPower: ref.adjacentChannelPower || 0,
        },
        centerFreq: ref.centerFreq,
        sampleRate: ref.sampleRate,
        timestamp: ref.createdAt.getTime(),
      }));
      
      // Perform matching
      const matches = matchFingerprint(queryFingerprint, refFingerprints, input.threshold);
      
      // Store match results
      for (const match of matches.slice(0, input.maxResults)) {
        await db.insert(fingerprintMatches).values({
          userId: ctx.user.id,
          queryCaptureId: input.captureId,
          matchedFingerprintId: 0, // TODO: Get from reference
          matchedDeviceId: match.deviceId,
          matchedDeviceType: match.deviceType,
          confidence: match.confidence,
          distance: match.distance,
          matchedFeatures: match.matchedFeatures,
          matchedAt: new Date(),
        });
      }
      
      return {
        matches: matches.slice(0, input.maxResults),
        totalMatches: matches.length,
      };
    }),
  
  /**
   * List all fingerprints for current user
   */
  list: protectedProcedure
    .input(z.object({
      limit: z.number().optional().default(50),
      deviceType: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      // Query fingerprints
      const baseQuery = db.select().from(rfFingerprints);
      
      const fingerprints = await baseQuery
        .where(eq(rfFingerprints.userId, ctx.user.id))
        .orderBy(desc(rfFingerprints.createdAt))
        .limit(input.limit);
      
      return fingerprints.map((fp: any) => ({
        id: fp.id,
        deviceId: fp.deviceId,
        deviceType: fp.deviceType,
        deviceModel: fp.deviceModel,
        manufacturer: fp.manufacturer,
        centerFreq: fp.centerFreq,
        sampleRate: fp.sampleRate,
        verified: fp.verified,
        createdAt: fp.createdAt,
      }));
    }),
  
  /**
   * Get fingerprint match history
   */
  matchHistory: protectedProcedure
    .input(z.object({
      limit: z.number().optional().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      const matches = await db.select()
        .from(fingerprintMatches)
        .where(eq(fingerprintMatches.userId, ctx.user.id))
        .orderBy(desc(fingerprintMatches.matchedAt))
        .limit(input.limit);
      
      return matches;
    }),
});
