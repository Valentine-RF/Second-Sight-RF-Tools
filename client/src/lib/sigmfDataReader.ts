/**
 * SigMF Data File Reader with HTTP Range Request Support
 * 
 * Supports streaming large .sigmf-data files without loading entire file into memory
 * Implements chunked reading with backpressure handling for real-time visualization
 */

/**
 * Supported SigMF datatypes
 */
export type SigMFDatatype = 
  | 'cf32_le'  // Complex float32, little-endian (I/Q interleaved)
  | 'ci16_le'  // Complex int16, little-endian
  | 'ci8'      // Complex int8
  | 'cu8';     // Complex uint8

/**
 * Parse IQ samples from binary data based on datatype
 * @param buffer - ArrayBuffer containing binary IQ data
 * @param datatype - SigMF datatype string
 * @returns Float32Array of normalized I/Q samples [-1.0, 1.0]
 */
export function parseSigMFSamples(buffer: ArrayBuffer, datatype: SigMFDatatype): Float32Array {
  let bytesPerSample: number;
  try {
    bytesPerSample = getBytesPerSample(datatype);
  } catch {
    throw new Error(`Unsupported datatype: ${datatype}`);
  }
  if (buffer.byteLength % bytesPerSample !== 0) {
    throw new Error(
      `Buffer length ${buffer.byteLength} is not aligned to ${datatype} sample size (${bytesPerSample} bytes)`
    );
  }

  switch (datatype) {
    case 'cf32_le': {
      // Already float32, just create view
      return new Float32Array(buffer);
    }
    
    case 'ci16_le': {
      // Convert int16 to float32, normalize to [-1.0, 1.0]
      const int16View = new Int16Array(buffer);
      const float32 = new Float32Array(int16View.length);
      for (let i = 0; i < int16View.length; i++) {
        float32[i] = int16View[i] / 32768.0;
      }
      return float32;
    }
    
    case 'ci8': {
      // Convert int8 to float32, normalize to [-1.0, 1.0]
      const int8View = new Int8Array(buffer);
      const float32 = new Float32Array(int8View.length);
      for (let i = 0; i < int8View.length; i++) {
        float32[i] = int8View[i] / 128.0;
      }
      return float32;
    }
    
    case 'cu8': {
      // Convert uint8 to float32, normalize to [-1.0, 1.0]
      const uint8View = new Uint8Array(buffer);
      const float32 = new Float32Array(uint8View.length);
      for (let i = 0; i < uint8View.length; i++) {
        float32[i] = (uint8View[i] - 128) / 128.0;
      }
      return float32;
    }
    
    default:
      throw new Error(`Unsupported datatype: ${datatype}`);
  }
}

/**
 * Get bytes per sample for a given datatype
 */
export function getBytesPerSample(datatype: SigMFDatatype): number {
  switch (datatype) {
    case 'cf32_le': return 8;  // 2 * 4 bytes (I + Q)
    case 'ci16_le': return 4;  // 2 * 2 bytes
    case 'ci8': return 2;      // 2 * 1 byte
    case 'cu8': return 2;      // 2 * 1 byte
    default: throw new Error(`Unknown datatype: ${datatype}`);
  }
}

/**
 * Configuration for streaming reader
 */
export interface StreamConfig {
  /** URL to .sigmf-data file */
  url: string;
  /** SigMF datatype */
  datatype: SigMFDatatype;
  /** Number of complex samples per chunk */
  chunkSize: number;
  /** Callback for each chunk of samples */
  onChunk: (samples: Float32Array, chunkIndex: number) => void | Promise<void>;
  /** Callback for progress updates */
  onProgress?: (bytesRead: number, totalBytes: number) => void;
  /** Callback for completion */
  onComplete?: () => void;
  /** Callback for errors */
  onError?: (error: Error) => void;
}

/**
 * Stream reader for .sigmf-data files
 */
export class SigMFDataReader {
  private config: StreamConfig;
  private abortController: AbortController | null = null;
  private isPaused = false;
  private bytesRead = 0;
  private totalBytes = 0;
  
  constructor(config: StreamConfig) {
    this.config = config;
  }
  
  /**
   * Start streaming the file
   */
  async start(): Promise<void> {
    this.abortController = new AbortController();
    this.isPaused = false;
    this.bytesRead = 0;
    
    try {
      // Get file size first
      const headResponse = await fetch(this.config.url, {
        method: 'HEAD',
        signal: this.abortController.signal
      });
      
      if (!headResponse.ok) {
        throw new Error(`Failed to fetch file: ${headResponse.statusText}`);
      }
      
      const contentLength = headResponse.headers.get('Content-Length');
      this.totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      
      // Calculate chunk size in bytes
      const bytesPerSample = getBytesPerSample(this.config.datatype);
      const chunkBytes = this.config.chunkSize * bytesPerSample;
      
      // Stream file in chunks using HTTP Range requests
      let chunkIndex = 0;
      while (this.bytesRead < this.totalBytes && !this.abortController.signal.aborted) {
        // Wait if paused
        while (this.isPaused && !this.abortController.signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (this.abortController.signal.aborted) break;
        
        // Calculate range for this chunk
        const start = this.bytesRead;
        const end = Math.min(start + chunkBytes - 1, this.totalBytes - 1);
        
        // Fetch chunk with Range header
        const response = await fetch(this.config.url, {
          headers: {
            'Range': `bytes=${start}-${end}`
          },
          signal: this.abortController.signal
        });
        
        if (!response.ok && response.status !== 206) {
          throw new Error(`Failed to fetch chunk: ${response.statusText}`);
        }
        
        // Read chunk data
        const buffer = await response.arrayBuffer();
        this.bytesRead += buffer.byteLength;
        
        // Parse samples
        const samples = parseSigMFSamples(buffer, this.config.datatype);
        
        // Call chunk callback
        await this.config.onChunk(samples, chunkIndex);
        
        // Update progress
        if (this.config.onProgress) {
          this.config.onProgress(this.bytesRead, this.totalBytes);
        }
        
        chunkIndex++;
      }
      
      // Call completion callback
      if (this.config.onComplete && !this.abortController.signal.aborted) {
        this.config.onComplete();
      }
      
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        if (this.config.onError) {
          this.config.onError(error);
        } else {
          console.error('SigMF streaming error:', error);
        }
      }
    }
  }
  
  /**
   * Pause streaming
   */
  pause(): void {
    this.isPaused = true;
  }
  
  /**
   * Resume streaming
   */
  resume(): void {
    this.isPaused = false;
  }
  
  /**
   * Stop streaming
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
  
  /**
   * Get current progress
   */
  getProgress(): { bytesRead: number; totalBytes: number; percent: number } {
    return {
      bytesRead: this.bytesRead,
      totalBytes: this.totalBytes,
      percent: this.totalBytes > 0 ? (this.bytesRead / this.totalBytes) * 100 : 0
    };
  }
}

/**
 * Read entire .sigmf-data file at once (for small files)
 * @param url - URL to .sigmf-data file
 * @param datatype - SigMF datatype
 * @returns Promise<Float32Array> of normalized I/Q samples
 */
export async function readSigMFDataFile(url: string, datatype: SigMFDatatype): Promise<Float32Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  return parseSigMFSamples(buffer, datatype);
}
