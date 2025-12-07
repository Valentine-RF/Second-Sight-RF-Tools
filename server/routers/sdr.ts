import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { enumerateSoapyDevices, startSoapyStream, stopSoapyStream, configureSoapyDevice } from '../soapy';

/**
 * SDR Router - SoapySDR device control and streaming
 * 
 * Provides tRPC procedures for:
 * - Device enumeration
 * - Stream configuration and control
 * - Recording management
 */

// Active streaming sessions (in-memory store)
const activeSessions = new Map<string, {
  deviceSerial: string;
  frequency: number;
  sampleRate: number;
  gain: number;
  antenna: string;
  bandwidth: number;
  isRecording: boolean;
  recordingStartTime?: number;
  recordingFilename?: string;
}>();

export const sdrRouter = router({
  /**
   * Enumerate available SoapySDR devices
   */
  enumerateDevices: protectedProcedure
    .mutation(async () => {
      try {
        const devices = await enumerateSoapyDevices();
        return devices;
      } catch (error) {
        console.error('Failed to enumerate SDR devices:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to enumerate SDR devices',
        });
      }
    }),

  /**
   * Start SDR streaming session
   */
  startStream: protectedProcedure
    .input(z.object({
      deviceSerial: z.string(),
      frequency: z.number(), // Hz
      sampleRate: z.number(), // Sps
      gain: z.number(), // dB
      antenna: z.string(),
      bandwidth: z.number(), // Hz
    }))
    .mutation(async ({ input, ctx }) => {
      const sessionId = `${ctx.user.openId}-${Date.now()}`;
      
      try {
        // Configure device
        await configureSoapyDevice({
          deviceSerial: input.deviceSerial,
          frequency: input.frequency,
          sampleRate: input.sampleRate,
          gain: input.gain,
          antenna: input.antenna,
          bandwidth: input.bandwidth,
        });
        
        // Start streaming
        await startSoapyStream({
          deviceSerial: input.deviceSerial,
          sessionId,
        });
        
        // Store session
        activeSessions.set(sessionId, {
          deviceSerial: input.deviceSerial,
          frequency: input.frequency,
          sampleRate: input.sampleRate,
          gain: input.gain,
          antenna: input.antenna,
          bandwidth: input.bandwidth,
          isRecording: false,
        });
        
        return {
          sessionId,
          success: true,
        };
      } catch (error) {
        console.error('Failed to start SDR stream:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to start stream: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Stop SDR streaming session
   */
  stopStream: protectedProcedure
    .input(z.object({
      deviceSerial: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Find session by device serial
        let sessionId: string | null = null;
        for (const [id, session] of Array.from(activeSessions.entries())) {
          if (session.deviceSerial === input.deviceSerial) {
            sessionId = id;
            break;
          }
        }
        
        if (!sessionId) {
          throw new Error('No active session found for this device');
        }
        
        // Stop recording if active
        const session = activeSessions.get(sessionId);
        if (session?.isRecording) {
          // TODO: Finalize recording and save to S3
          console.log('Finalizing recording:', session.recordingFilename);
        }
        
        // Stop streaming
        await stopSoapyStream({ deviceSerial: input.deviceSerial });
        
        // Remove session
        activeSessions.delete(sessionId);
        
        return { success: true };
      } catch (error) {
        console.error('Failed to stop SDR stream:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to stop stream: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Start recording IQ samples to file
   */
  startRecording: protectedProcedure
    .input(z.object({
      deviceSerial: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Find active session
        let sessionId: string | null = null;
        for (const [id, session] of Array.from(activeSessions.entries())) {
          if (session.deviceSerial === input.deviceSerial) {
            sessionId = id;
            break;
          }
        }
        
        if (!sessionId) {
          throw new Error('No active streaming session found');
        }
        
        const session = activeSessions.get(sessionId)!;
        
        if (session.isRecording) {
          throw new Error('Recording already in progress');
        }
        
        // Generate filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `sdr-recording-${timestamp}.sigmf`;
        
        // Update session
        session.isRecording = true;
        session.recordingStartTime = Date.now();
        session.recordingFilename = filename;
        activeSessions.set(sessionId, session);
        
        // TODO: Signal Python backend to start buffering samples
        console.log('Started recording:', filename);
        
        return {
          success: true,
          filename,
        };
      } catch (error) {
        console.error('Failed to start recording:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Stop recording and save to S3
   */
  stopRecording: protectedProcedure
    .input(z.object({
      deviceSerial: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Find active session
        let sessionId: string | null = null;
        for (const [id, session] of Array.from(activeSessions.entries())) {
          if (session.deviceSerial === input.deviceSerial) {
            sessionId = id;
            break;
          }
        }
        
        if (!sessionId) {
          throw new Error('No active streaming session found');
        }
        
        const session = activeSessions.get(sessionId)!;
        
        if (!session.isRecording) {
          throw new Error('No recording in progress');
        }
        
        const filename = session.recordingFilename!;
        const duration = Date.now() - session.recordingStartTime!;
        
        // TODO: Signal Python backend to finalize recording
        // TODO: Upload to S3 using storagePut
        // TODO: Create database entry in signal_captures table
        
        console.log('Stopped recording:', filename, 'Duration:', duration, 'ms');
        
        // Update session
        session.isRecording = false;
        session.recordingStartTime = undefined;
        session.recordingFilename = undefined;
        activeSessions.set(sessionId, session);
        
        return {
          success: true,
          filename,
          duration,
        };
      } catch (error) {
        console.error('Failed to stop recording:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to stop recording: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Get active streaming sessions
   */
  getActiveSessions: protectedProcedure
    .query(async ({ ctx }) => {
      const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
        sessionId: id,
        ...session,
      }));
      
      return sessions;
    }),
});
