import axios, { AxiosInstance } from 'axios';

/**
 * Splunk Search API client for querying log data
 */
export interface SplunkSearchConfig {
  splunkUrl: string; // Base URL without /services/collector (e.g., https://splunk.example.com:8089)
  username: string;
  password: string;
  verifySsl?: boolean;
}

export interface SplunkSearchResult {
  results: Array<Record<string, any>>;
  messages?: Array<{ type: string; text: string }>;
}

export interface SplunkJobStatus {
  sid: string;
  isDone: boolean;
  doneProgress: number;
  scanCount: number;
  eventCount: number;
  resultCount: number;
}

/**
 * Splunk Search API client
 */
export class SplunkSearchClient {
  private client: AxiosInstance;
  private config: Required<SplunkSearchConfig>;

  constructor(config: SplunkSearchConfig) {
    this.config = {
      verifySsl: true,
      ...config,
    };

    this.client = axios.create({
      baseURL: `${this.config.splunkUrl}/services`,
      auth: {
        username: this.config.username,
        password: this.config.password,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      httpsAgent: this.config.verifySsl ? undefined : {
        rejectUnauthorized: false,
      },
    });
  }

  /**
   * Execute a oneshot search (blocking, returns results immediately)
   */
  async oneshotSearch(query: string, params?: {
    earliest_time?: string;
    latest_time?: string;
    output_mode?: 'json' | 'xml' | 'csv';
  }): Promise<SplunkSearchResult> {
    try {
      const response = await this.client.post('/search/jobs/export', null, {
        params: {
          search: query,
          earliest_time: params?.earliest_time || '-24h',
          latest_time: params?.latest_time || 'now',
          output_mode: params?.output_mode || 'json',
        },
      });

      // Parse JSONL response (one JSON object per line)
      const lines = response.data.split('\n').filter((line: string) => line.trim());
      const results = lines.map((line: string) => JSON.parse(line));

      return { results };
    } catch (error: any) {
      console.error('[Splunk Search] Oneshot search error:', error.message);
      throw new Error(`Splunk search failed: ${error.response?.data?.messages?.[0]?.text || error.message}`);
    }
  }

  /**
   * Create a search job (async, returns job ID)
   */
  async createSearchJob(query: string, params?: {
    earliest_time?: string;
    latest_time?: string;
  }): Promise<string> {
    try {
      const response = await this.client.post('/search/jobs', null, {
        params: {
          search: query,
          earliest_time: params?.earliest_time || '-24h',
          latest_time: params?.latest_time || 'now',
          output_mode: 'json',
        },
      });

      return response.data.sid;
    } catch (error: any) {
      console.error('[Splunk Search] Create job error:', error.message);
      throw new Error(`Failed to create search job: ${error.message}`);
    }
  }

  /**
   * Get search job status
   */
  async getJobStatus(sid: string): Promise<SplunkJobStatus> {
    try {
      const response = await this.client.get(`/search/jobs/${sid}`, {
        params: { output_mode: 'json' },
      });

      const entry = response.data.entry[0];
      return {
        sid,
        isDone: entry.content.isDone,
        doneProgress: parseFloat(entry.content.doneProgress),
        scanCount: parseInt(entry.content.scanCount),
        eventCount: parseInt(entry.content.eventCount),
        resultCount: parseInt(entry.content.resultCount),
      };
    } catch (error: any) {
      console.error('[Splunk Search] Get job status error:', error.message);
      throw new Error(`Failed to get job status: ${error.message}`);
    }
  }

  /**
   * Get search job results
   */
  async getJobResults(sid: string, params?: {
    offset?: number;
    count?: number;
  }): Promise<SplunkSearchResult> {
    try {
      const response = await this.client.get(`/search/jobs/${sid}/results`, {
        params: {
          output_mode: 'json',
          offset: params?.offset || 0,
          count: params?.count || 100,
        },
      });

      return {
        results: response.data.results || [],
        messages: response.data.messages,
      };
    } catch (error: any) {
      console.error('[Splunk Search] Get job results error:', error.message);
      throw new Error(`Failed to get job results: ${error.message}`);
    }
  }

  /**
   * Execute a search and wait for results (convenience method)
   */
  async search(query: string, params?: {
    earliest_time?: string;
    latest_time?: string;
    maxWaitMs?: number;
  }): Promise<SplunkSearchResult> {
    const sid = await this.createSearchJob(query, params);
    const maxWaitMs = params?.maxWaitMs || 30000;
    const startTime = Date.now();

    // Poll for completion
    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getJobStatus(sid);
      
      if (status.isDone) {
        return await this.getJobResults(sid);
      }

      // Wait 500ms before next poll
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error('Search job timed out');
  }

  /**
   * Test connection to Splunk
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.client.get('/server/info', {
        params: { output_mode: 'json' },
        timeout: 5000,
      });
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.messages?.[0]?.text || error.message || 'Connection failed',
      };
    }
  }
}

/**
 * Helper function to build SPL queries for common dashboard metrics
 */
export const SplunkQueries = {
  /**
   * Get recent events (last N hours)
   */
  recentEvents: (index: string, sourcetype: string, hours: number = 24) => `
    search index="${index}" sourcetype="${sourcetype}"
    | head 100
    | table _time, eventType, severity, message, userName, captureName
    | sort -_time
  `,

  /**
   * Get modulation classification distribution
   */
  modulationDistribution: (index: string, sourcetype: string, hours: number = 24) => `
    search index="${index}" sourcetype="${sourcetype}" eventType="modulation_classification" earliest=-${hours}h
    | stats count by modulation
    | sort -count
  `,

  /**
   * Get anomaly alerts
   */
  anomalyAlerts: (index: string, sourcetype: string, hours: number = 24) => `
    search index="${index}" sourcetype="${sourcetype}" eventType="anomaly_detection" earliest=-${hours}h
    | table _time, anomalyType, description, severity, captureName, userName
    | sort -_time
  `,

  /**
   * Get API usage over time
   */
  apiUsageTimeseries: (index: string, sourcetype: string, hours: number = 24) => `
    search index="${index}" sourcetype="${sourcetype}" eventType="api_request" earliest=-${hours}h
    | timechart span=1h count by apiKeyName
  `,

  /**
   * Get signal upload statistics
   */
  signalUploadStats: (index: string, sourcetype: string, hours: number = 24) => `
    search index="${index}" sourcetype="${sourcetype}" eventType="signal_upload" earliest=-${hours}h
    | stats count as total_uploads, avg(fileSize) as avg_file_size, sum(fileSize) as total_data
    | eval avg_file_size_mb=round(avg_file_size/1024/1024, 2), total_data_gb=round(total_data/1024/1024/1024, 2)
  `,

  /**
   * Get event count by type
   */
  eventTypeDistribution: (index: string, sourcetype: string, hours: number = 24) => `
    search index="${index}" sourcetype="${sourcetype}" earliest=-${hours}h
    | stats count by eventType
    | sort -count
  `,

  /**
   * Get average classification confidence
   */
  avgClassificationConfidence: (index: string, sourcetype: string, hours: number = 24) => `
    search index="${index}" sourcetype="${sourcetype}" eventType="modulation_classification" earliest=-${hours}h
    | stats avg(confidence) as avg_confidence
    | eval avg_confidence=round(avg_confidence*100, 2)
  `,
};
