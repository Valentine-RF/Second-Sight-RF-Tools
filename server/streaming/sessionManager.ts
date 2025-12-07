import { randomBytes } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { storagePut } from '../storage';

export interface StreamingSession {
  id: string;
  userId: string;
  deviceDriver: string;
  centerFreqHz: number;
  sampleRateHz: number;
  gainDb: number;
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'stopped' | 'error';
  samplesRecorded: number;
  recording: boolean;
  recordingPath?: string;
}

export interface SessionConfig {
  userId: string;
  deviceDriver: string;
  centerFreqHz: number;
  sampleRateHz: number;
  gainDb: number;
  recording?: boolean;
}

class SessionManager {
  private sessions: Map<string, StreamingSession> = new Map();
  private recordingBuffers: Map<string, Float32Array[]> = new Map();
  
  /**
   * Create a new streaming session
   */
  createSession(config: SessionConfig): StreamingSession {
    const sessionId = randomBytes(16).toString('hex');
    
    const session: StreamingSession = {
      id: sessionId,
      userId: config.userId,
      deviceDriver: config.deviceDriver,
      centerFreqHz: config.centerFreqHz,
      sampleRateHz: config.sampleRateHz,
      gainDb: config.gainDb,
      startTime: new Date(),
      status: 'active',
      samplesRecorded: 0,
      recording: config.recording ?? false,
    };
    
    this.sessions.set(sessionId, session);
    
    if (session.recording) {
      this.recordingBuffers.set(sessionId, []);
    }
    
    console.log(`[SessionManager] Created session ${sessionId}`);
    return session;
  }
  
  /**
   * Get session by ID
   */
  getSession(sessionId: string): StreamingSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * Get all sessions for a user
   */
  getUserSessions(userId: string): StreamingSession[] {
    return Array.from(this.sessions.values()).filter(s => s.userId === userId);
  }
  
  /**
   * Update session status
   */
  updateSession(sessionId: string, updates: Partial<StreamingSession>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    Object.assign(session, updates);
  }
  
  /**
   * Add IQ samples to recording buffer
   */
  addRecordingSamples(sessionId: string, samples: Float32Array): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.recording) {
      return;
    }
    
    const buffer = this.recordingBuffers.get(sessionId);
    if (!buffer) {
      throw new Error(`Recording buffer for session ${sessionId} not found`);
    }
    
    buffer.push(new Float32Array(samples));
    session.samplesRecorded += samples.length / 2; // Divide by 2 for I/Q pairs
  }
  
  /**
   * Stop session and save recording to S3
   */
  async stopSession(sessionId: string): Promise<{ metaUrl?: string; dataUrl?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.status = 'stopped';
    session.endTime = new Date();
    
    let metaUrl: string | undefined;
    let dataUrl: string | undefined;
    
    // Save recording if enabled
    if (session.recording) {
      const buffer = this.recordingBuffers.get(sessionId);
      if (buffer && buffer.length > 0) {
        // Concatenate all buffers
        const totalLength = buffer.reduce((sum, arr) => sum + arr.length, 0);
        const allSamples = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of buffer) {
          allSamples.set(chunk, offset);
          offset += chunk.length;
        }
        
        // Generate SigMF metadata
        const metadata = {
          global: {
            'core:datatype': 'cf32_le',
            'core:sample_rate': session.sampleRateHz,
            'core:version': '1.0.0',
            'core:sha512': '', // TODO: Calculate hash
            'core:description': `Real-time SDR recording from ${session.deviceDriver}`,
            'core:author': session.userId,
            'core:recorder': 'Second Sight',
            'core:hw': session.deviceDriver,
          },
          captures: [
            {
              'core:sample_start': 0,
              'core:frequency': session.centerFreqHz,
              'core:datetime': session.startTime.toISOString(),
            },
          ],
          annotations: [],
        };
        
        // Upload metadata
        const metaKey = `${session.userId}/recordings/${sessionId}.sigmf-meta`;
        const metaResult = await storagePut(
          metaKey,
          JSON.stringify(metadata, null, 2),
          'application/json'
        );
        metaUrl = metaResult.url;
        
        // Upload data file
        const dataKey = `${session.userId}/recordings/${sessionId}.sigmf-data`;
        const dataResult = await storagePut(
          dataKey,
          Buffer.from(allSamples.buffer),
          'application/octet-stream'
        );
        dataUrl = dataResult.url;
        
        session.recordingPath = dataUrl;
        
        console.log(`[SessionManager] Saved recording for session ${sessionId}: ${session.samplesRecorded} samples`);
      }
      
      // Clean up buffer
      this.recordingBuffers.delete(sessionId);
    }
    
    return { metaUrl, dataUrl };
  }
  
  /**
   * Delete session
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.recordingBuffers.delete(sessionId);
    console.log(`[SessionManager] Deleted session ${sessionId}`);
  }
  
  /**
   * Get all active sessions
   */
  getActiveSessions(): StreamingSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }
  
  /**
   * Clean up old sessions (older than 24 hours)
   */
  cleanupOldSessions(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      const age = now - session.startTime.getTime();
      if (age > maxAge && session.status !== 'active') {
        this.deleteSession(sessionId);
      }
    }
  }
}

// Singleton instance
export const sessionManager = new SessionManager();

// Clean up old sessions every hour
setInterval(() => {
  sessionManager.cleanupOldSessions();
}, 60 * 60 * 1000);
