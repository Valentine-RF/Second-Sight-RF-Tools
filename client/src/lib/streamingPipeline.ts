/**
 * Streaming Data Pipeline for Real-Time IQ Processing
 * 
 * Coordinates SigMF file reading, FFT computation, and visualization updates
 * Implements backpressure handling to prevent memory overflow
 * 
 * Architecture:
 * 1. SigMFDataReader streams chunks from .sigmf-data file
 * 2. FFT Worker processes chunks off-thread
 * 3. Results pushed to visualization components via callbacks
 * 4. Backpressure pauses reader when processing queue is full
 */

import { SigMFDataReader, type SigMFDatatype } from './sigmfDataReader';

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  /** URL to .sigmf-data file */
  dataUrl: string;
  /** SigMF datatype */
  datatype: SigMFDatatype;
  /** FFT size (must be power of 2) */
  fftSize: number;
  /** Window function */
  window: 'rectangular' | 'hamming' | 'hann' | 'blackmanHarris';
  /** Number of complex samples per chunk */
  chunkSize: number;
  /** Maximum queue size before backpressure kicks in */
  maxQueueSize: number;
  /** Callback for FFT results */
  onFFT: (fft: Float32Array, chunkIndex: number) => void;
  /** Callback for raw IQ samples */
  onSamples?: (samples: Float32Array, chunkIndex: number) => void;
  /** Callback for progress updates */
  onProgress?: (percent: number) => void;
  /** Callback for completion */
  onComplete?: () => void;
  /** Callback for errors */
  onError?: (error: Error) => void;
}

/**
 * Pipeline state
 */
type PipelineState = 'idle' | 'running' | 'paused' | 'stopped';

/**
 * Streaming pipeline for real-time IQ data processing
 */
export class StreamingPipeline {
  private config: PipelineConfig;
  private state: PipelineState = 'idle';
  private reader: SigMFDataReader | null = null;
  private worker: Worker | null = null;
  private processingQueue: number = 0;
  private chunkCounter: number = 0;
  private fftResultsRef: Map<number, Float32Array> = new Map();
  
  constructor(config: PipelineConfig) {
    this.config = config;
  }
  
  /**
   * Initialize FFT worker
   */
  private initWorker(): void {
    if (this.worker) return;
    
    this.worker = new Worker('/fft-worker.js');
    
    this.worker.onmessage = (e) => {
      const { type, fft, id } = e.data;
      
      if (type === 'result') {
        // Store result using useRef pattern (no React state)
        this.fftResultsRef.set(id, fft);
        
        // Call FFT callback via requestAnimationFrame for smooth updates
        requestAnimationFrame(() => {
          this.config.onFFT(fft, id);
          this.fftResultsRef.delete(id); // Clean up after delivery
        });
        
        // Decrement queue counter
        this.processingQueue--;
        
        // Resume reader if it was paused due to backpressure
        if (this.processingQueue < this.config.maxQueueSize && this.reader) {
          this.reader.resume();
        }
      } else if (type === 'error') {
        if (this.config.onError) {
          this.config.onError(new Error(e.data.error));
        }
        this.processingQueue--;
      } else if (type === 'ready') {
        console.log('[Pipeline] FFT Worker ready');
      }
    };
    
    this.worker.onerror = (error) => {
      console.error('[Pipeline] Worker error:', error);
      if (this.config.onError) {
        this.config.onError(new Error('FFT Worker error'));
      }
    };
  }
  
  /**
   * Process a chunk of IQ samples
   */
  private async processChunk(samples: Float32Array, chunkIndex: number): Promise<void> {
    // Deliver raw samples if callback provided
    if (this.config.onSamples) {
      // Use requestAnimationFrame for smooth updates
      requestAnimationFrame(() => {
        this.config.onSamples!(samples, chunkIndex);
      });
    }
    
    // Check backpressure
    if (this.processingQueue >= this.config.maxQueueSize) {
      // Pause reader until queue drains
      if (this.reader) {
        this.reader.pause();
      }
    }
    
    // Send to FFT worker
    if (this.worker) {
      this.processingQueue++;
      
      // Transfer samples to worker (zero-copy)
      this.worker.postMessage({
        type: 'compute',
        samples: samples,
        fftSize: this.config.fftSize,
        window: this.config.window,
        id: chunkIndex
      }, [samples.buffer]);
    }
  }
  
  /**
   * Start the pipeline
   */
  async start(): Promise<void> {
    if (this.state === 'running') {
      console.warn('[Pipeline] Already running');
      return;
    }
    
    try {
      // Initialize worker
      this.initWorker();
      
      // Reset counters
      this.chunkCounter = 0;
      this.processingQueue = 0;
      this.fftResultsRef.clear();
      
      // Create reader
      this.reader = new SigMFDataReader({
        url: this.config.dataUrl,
        datatype: this.config.datatype,
        chunkSize: this.config.chunkSize,
        onChunk: async (samples, chunkIndex) => {
          await this.processChunk(samples, chunkIndex);
        },
        onProgress: (bytesRead, totalBytes) => {
          if (this.config.onProgress) {
            const percent = (bytesRead / totalBytes) * 100;
            this.config.onProgress(percent);
          }
        },
        onComplete: () => {
          // Wait for processing queue to drain
          const checkQueue = () => {
            if (this.processingQueue === 0) {
              this.state = 'idle';
              if (this.config.onComplete) {
                this.config.onComplete();
              }
            } else {
              setTimeout(checkQueue, 100);
            }
          };
          checkQueue();
        },
        onError: (error) => {
          this.state = 'stopped';
          if (this.config.onError) {
            this.config.onError(error);
          }
        }
      });
      
      // Start streaming
      this.state = 'running';
      await this.reader.start();
      
    } catch (error) {
      this.state = 'stopped';
      if (this.config.onError && error instanceof Error) {
        this.config.onError(error);
      }
    }
  }
  
  /**
   * Pause the pipeline
   */
  pause(): void {
    if (this.state === 'running') {
      this.state = 'paused';
      if (this.reader) {
        this.reader.pause();
      }
    }
  }
  
  /**
   * Resume the pipeline
   */
  resume(): void {
    if (this.state === 'paused') {
      this.state = 'running';
      if (this.reader) {
        this.reader.resume();
      }
    }
  }
  
  /**
   * Stop the pipeline
   */
  stop(): void {
    this.state = 'stopped';
    
    if (this.reader) {
      this.reader.stop();
      this.reader = null;
    }
    
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    this.processingQueue = 0;
    this.fftResultsRef.clear();
  }
  
  /**
   * Get current state
   */
  getState(): PipelineState {
    return this.state;
  }
  
  /**
   * Get processing queue size
   */
  getQueueSize(): number {
    return this.processingQueue;
  }
}
