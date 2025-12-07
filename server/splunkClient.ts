import axios, { AxiosInstance } from 'axios';

/**
 * Splunk event severity levels
 */
export enum SplunkSeverity {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

/**
 * Splunk event types for RF signal analysis
 */
export enum SplunkEventType {
  SIGNAL_UPLOAD = 'signal_upload',
  SIGNAL_ANALYSIS_START = 'signal_analysis_start',
  SIGNAL_ANALYSIS_COMPLETE = 'signal_analysis_complete',
  MODULATION_CLASSIFICATION = 'modulation_classification',
  ANOMALY_DETECTION = 'anomaly_detection',
  ANNOTATION_CREATED = 'annotation_created',
  API_REQUEST = 'api_request',
  RATE_LIMIT_HIT = 'rate_limit_hit',
  FREQUENCY_HOPPING_DETECTED = 'frequency_hopping_detected',
  UNKNOWN_SIGNAL_HIGH_CONFIDENCE = 'unknown_signal_high_confidence',
}

/**
 * Base Splunk event structure
 */
export interface SplunkEvent {
  time?: number; // Unix timestamp in seconds
  host?: string;
  source?: string;
  sourcetype?: string;
  index?: string;
  event: {
    eventType: SplunkEventType;
    severity: SplunkSeverity;
    message: string;
    userId?: number;
    userName?: string;
    captureId?: number;
    captureName?: string;
    [key: string]: any; // Additional fields
  };
}

/**
 * Splunk HEC client configuration
 */
export interface SplunkConfig {
  hecUrl: string; // e.g., https://splunk.example.com:8088/services/collector
  hecToken: string;
  index?: string;
  source?: string;
  sourcetype?: string;
  host?: string;
  batchSize?: number;
  flushInterval?: number; // milliseconds
  retryAttempts?: number;
  retryDelay?: number; // milliseconds
  verifySsl?: boolean;
}

/**
 * Splunk HTTP Event Collector (HEC) client
 */
export class SplunkClient {
  private config: Required<SplunkConfig>;
  private client: AxiosInstance;
  private eventQueue: SplunkEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isEnabled: boolean = false;

  constructor(config: SplunkConfig) {
    this.config = {
      batchSize: 10,
      flushInterval: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
      verifySsl: true,
      source: 'second-sight-rf',
      sourcetype: 'rf_signal_analysis',
      host: 'forensic-signal-processor',
      index: config.index || 'main',
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.hecUrl,
      headers: {
        'Authorization': `Splunk ${this.config.hecToken}`,
        'Content-Type': 'application/json',
      },
      httpsAgent: this.config.verifySsl ? undefined : {
        rejectUnauthorized: false,
      },
    });

    this.isEnabled = Boolean(this.config.hecUrl && this.config.hecToken);

    if (this.isEnabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Check if Splunk integration is enabled
   */
  public enabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Send a single event to Splunk
   */
  public async sendEvent(event: Omit<SplunkEvent, 'time' | 'host' | 'source' | 'sourcetype' | 'index'>): Promise<void> {
    if (!this.isEnabled) return;

    const fullEvent: SplunkEvent = {
      time: Math.floor(Date.now() / 1000),
      host: this.config.host,
      source: this.config.source,
      sourcetype: this.config.sourcetype,
      index: this.config.index,
      ...event,
    };

    this.eventQueue.push(fullEvent);

    if (this.eventQueue.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  /**
   * Flush queued events to Splunk
   */
  public async flush(): Promise<void> {
    if (!this.isEnabled || this.eventQueue.length === 0) return;

    const events = this.eventQueue.splice(0, this.config.batchSize);
    
    try {
      await this.sendBatch(events);
    } catch (error) {
      console.error('[Splunk] Failed to send events:', error);
      // Re-queue events on failure
      this.eventQueue.unshift(...events);
    }
  }

  /**
   * Send a batch of events to Splunk HEC
   */
  private async sendBatch(events: SplunkEvent[], attempt: number = 1): Promise<void> {
    try {
      const payload = events.map(e => JSON.stringify(e)).join('\n');
      
      const response = await this.client.post('', payload, {
        timeout: 10000,
      });

      if (response.data.code !== 0) {
        throw new Error(`Splunk HEC error: ${response.data.text}`);
      }

      console.log(`[Splunk] Sent ${events.length} events successfully`);
    } catch (error: any) {
      if (attempt < this.config.retryAttempts) {
        console.warn(`[Splunk] Retry ${attempt}/${this.config.retryAttempts} after error:`, error.message);
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt));
        return this.sendBatch(events, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => console.error('[Splunk] Auto-flush error:', err));
    }, this.config.flushInterval);
  }

  /**
   * Stop automatic flush timer
   */
  public stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.flush().catch(err => console.error('[Splunk] Final flush error:', err));
  }

  /**
   * Test connection to Splunk HEC
   */
  public async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const testEvent: SplunkEvent = {
        time: Math.floor(Date.now() / 1000),
        host: this.config.host,
        source: this.config.source,
        sourcetype: this.config.sourcetype,
        index: this.config.index,
        event: {
          eventType: SplunkEventType.API_REQUEST,
          severity: SplunkSeverity.INFO,
          message: 'Splunk HEC connection test',
        },
      };

      const response = await this.client.post('', JSON.stringify(testEvent), {
        timeout: 5000,
      });

      if (response.data.code === 0) {
        return { success: true, message: 'Connection successful' };
      } else {
        return { success: false, message: `HEC error: ${response.data.text}` };
      }
    } catch (error: any) {
      return { 
        success: false, 
        message: error.response?.data?.text || error.message || 'Connection failed' 
      };
    }
  }
}

/**
 * Singleton Splunk client instance
 */
let splunkClient: SplunkClient | null = null;

/**
 * Initialize Splunk client with configuration
 */
export function initSplunkClient(config: SplunkConfig): SplunkClient {
  if (splunkClient) {
    splunkClient.stop();
  }
  splunkClient = new SplunkClient(config);
  return splunkClient;
}

/**
 * Get the current Splunk client instance
 */
export function getSplunkClient(): SplunkClient | null {
  return splunkClient;
}

/**
 * Helper function to log signal upload events
 */
export async function logSignalUpload(data: {
  userId: number;
  userName: string;
  captureId: number;
  captureName: string;
  sampleRate: number;
  centerFrequency?: number;
  fileSize: number;
  datatype: string;
}): Promise<void> {
  const client = getSplunkClient();
  if (!client?.enabled()) return;

  await client.sendEvent({
    event: {
      eventType: SplunkEventType.SIGNAL_UPLOAD,
      severity: SplunkSeverity.INFO,
      message: `Signal uploaded: ${data.captureName}`,
      userId: data.userId,
      userName: data.userName,
      captureId: data.captureId,
      captureName: data.captureName,
      sampleRate: data.sampleRate,
      centerFrequency: data.centerFrequency,
      fileSize: data.fileSize,
      datatype: data.datatype,
    },
  });
}

/**
 * Helper function to log modulation classification events
 */
export async function logModulationClassification(data: {
  userId: number;
  userName: string;
  captureId: number;
  captureName: string;
  modulation: string;
  confidence: number;
  allScores: Record<string, number>;
}): Promise<void> {
  const client = getSplunkClient();
  if (!client?.enabled()) return;

  const severity = data.confidence > 0.8 ? SplunkSeverity.INFO : SplunkSeverity.WARN;

  await client.sendEvent({
    event: {
      eventType: SplunkEventType.MODULATION_CLASSIFICATION,
      severity,
      message: `Modulation classified: ${data.modulation} (${(data.confidence * 100).toFixed(1)}%)`,
      userId: data.userId,
      userName: data.userName,
      captureId: data.captureId,
      captureName: data.captureName,
      modulation: data.modulation,
      confidence: data.confidence,
      allScores: data.allScores,
    },
  });
}

/**
 * Helper function to log anomaly detection events
 */
export async function logAnomalyDetection(data: {
  userId: number;
  userName: string;
  captureId: number;
  captureName: string;
  anomalyType: string;
  description: string;
  severity: SplunkSeverity;
  metadata?: Record<string, any>;
}): Promise<void> {
  const client = getSplunkClient();
  if (!client?.enabled()) return;

  await client.sendEvent({
    event: {
      eventType: SplunkEventType.ANOMALY_DETECTION,
      severity: data.severity,
      message: `Anomaly detected: ${data.anomalyType} - ${data.description}`,
      userId: data.userId,
      userName: data.userName,
      captureId: data.captureId,
      captureName: data.captureName,
      anomalyType: data.anomalyType,
      description: data.description,
      ...data.metadata,
    },
  });
}

/**
 * Helper function to log API usage events
 */
export async function logApiRequest(data: {
  apiKeyId: number;
  apiKeyName: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  ipAddress?: string;
}): Promise<void> {
  const client = getSplunkClient();
  if (!client?.enabled()) return;

  const severity = data.statusCode >= 500 ? SplunkSeverity.ERROR : 
                   data.statusCode >= 400 ? SplunkSeverity.WARN : 
                   SplunkSeverity.INFO;

  await client.sendEvent({
    event: {
      eventType: SplunkEventType.API_REQUEST,
      severity,
      message: `API request: ${data.method} ${data.endpoint} - ${data.statusCode}`,
      apiKeyId: data.apiKeyId,
      apiKeyName: data.apiKeyName,
      endpoint: data.endpoint,
      method: data.method,
      statusCode: data.statusCode,
      responseTime: data.responseTime,
      ipAddress: data.ipAddress,
    },
  });
}
