/**
 * GPU Bridge - ZeroMQ Client for Python GPU Service
 * 
 * Provides type-safe async interface to GPU-accelerated signal processing.
 * Replaces subprocess spawning with persistent connection for lower latency.
 * 
 * @module server/gpuBridge
 */

import { EventEmitter } from 'events';

// Types for zeromq - using dynamic import for compatibility
type ZMQSocket = any;

interface GPUBridgeConfig {
  /** ZeroMQ address of GPU service */
  address: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Automatic reconnection on failure */
  autoReconnect: boolean;
  /** Reconnection delay in milliseconds */
  reconnectDelay: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts: number;
}

interface GPURequest {
  command: string;
  iq_real?: number[];
  iq_imag?: number[];
  params?: Record<string, any>;
}

interface GPUResponse {
  error?: string;
  processing_time_ms?: number;
  [key: string]: any;
}

interface PSDResult {
  psd: Float32Array;
  fft_size: number;
  num_bins: number;
}

interface FAMResult {
  scf_magnitude: Float32Array[];
  spectral_freqs: Float32Array;
  cyclic_freqs: Float32Array;
  cyclic_profile: Float32Array;
  shape: [number, number];
}

interface WVDResult {
  wvd: Float32Array[];
  time_axis: Float32Array;
  freq_axis: Float32Array;
  shape: [number, number];
}

interface RFDNAResult {
  features: Float32Array;
  feature_count: number;
  regions: number;
}

interface CumulantsResult {
  cum4?: number;
  cum6?: number;
}

interface GPUMemoryInfo {
  gpu_available: boolean;
  device_id: number;
  used_bytes: number;
  total_bytes: number;
  pinned_bytes?: number;
}

interface GPUServiceStats {
  requests_total: number;
  requests_success: number;
  requests_failed: number;
  bytes_processed: number;
  uptime_seconds: number;
  requests_per_second: number;
}

/**
 * GPU Bridge Client
 * 
 * Manages connection to Python GPU service and provides
 * type-safe methods for signal processing operations.
 */
export class GPUBridge extends EventEmitter {
  private socket: ZMQSocket | null = null;
  private zmq: any = null;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnectAttempts: number = 0;
  private config: GPUBridgeConfig;
  private pendingRequest: Promise<GPUResponse> | null = null;
  
  constructor(config: Partial<GPUBridgeConfig> = {}) {
    super();
    this.config = {
      address: config.address ?? 'tcp://127.0.0.1:5555',
      timeout: config.timeout ?? 60000,
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
    };
  }
  
  /**
   * Initialize ZeroMQ and connect to GPU service
   */
  async connect(): Promise<void> {
    if (this.connected || this.connecting) {
      return;
    }
    
    this.connecting = true;
    
    try {
      // Dynamic import of zeromq
      this.zmq = await import('zeromq');
      
      this.socket = new this.zmq.Request();
      this.socket.receiveTimeout = this.config.timeout;
      this.socket.sendTimeout = this.config.timeout;
      
      await this.socket.connect(this.config.address);
      
      // Verify connection with ping
      const pingResult = await this.ping();
      
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      
      console.log(`[GPUBridge] Connected to ${this.config.address}`);
      console.log(`[GPUBridge] GPU available: ${pingResult.gpu_available}`);
      
      this.emit('connected', pingResult);
    } catch (error) {
      this.connecting = false;
      
      if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`[GPUBridge] Connection failed, retry ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);
        
        await new Promise(resolve => setTimeout(resolve, this.config.reconnectDelay));
        return this.connect();
      }
      
      throw new Error(`Failed to connect to GPU service: ${error}`);
    }
  }
  
  /**
   * Disconnect from GPU service
   */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.socket) {
      return;
    }
    
    try {
      await this.socket.close();
    } catch (error) {
      // Ignore close errors
    }
    
    this.socket = null;
    this.connected = false;
    
    console.log('[GPUBridge] Disconnected');
    this.emit('disconnected');
  }
  
  /**
   * Send request to GPU service
   */
  private async request(req: GPURequest): Promise<GPUResponse> {
    if (!this.connected) {
      await this.connect();
    }
    
    if (!this.socket) {
      throw new Error('GPU service not connected');
    }
    
    // Serialize request
    const requestJson = JSON.stringify(req);
    
    try {
      // Send request
      await this.socket.send(requestJson);
      
      // Receive response
      const [responseBuffer] = await this.socket.receive();
      const response: GPUResponse = JSON.parse(responseBuffer.toString());
      
      if (response.error) {
        throw new Error(`GPU service error: ${response.error}`);
      }
      
      return response;
    } catch (error: any) {
      // Handle connection errors
      if (error.code === 'EAGAIN' || error.message?.includes('timeout')) {
        this.connected = false;
        
        if (this.config.autoReconnect) {
          console.log('[GPUBridge] Connection lost, reconnecting...');
          await this.connect();
          return this.request(req);  // Retry
        }
      }
      
      throw error;
    }
  }
  
  // ================== Public API ==================
  
  /**
   * Health check / ping
   */
  async ping(): Promise<{ status: string; gpu_available: boolean; gpu_memory_used_mb: number; stats: GPUServiceStats }> {
    const response = await this.request({ command: 'ping' });
    return response as any;
  }
  
  /**
   * Get GPU memory information
   */
  async getMemoryInfo(): Promise<GPUMemoryInfo> {
    const response = await this.request({ command: 'memory' });
    return response as GPUMemoryInfo;
  }
  
  /**
   * Get service statistics
   */
  async getStats(): Promise<GPUServiceStats> {
    const response = await this.request({ command: 'stats' });
    return response as GPUServiceStats;
  }
  
  /**
   * Free GPU memory
   */
  async cleanup(): Promise<void> {
    await this.request({ command: 'cleanup' });
  }
  
  /**
   * Compute Power Spectral Density using GPU-accelerated Welch's method
   * 
   * @param iqReal - Real part of IQ samples
   * @param iqImag - Imaginary part of IQ samples
   * @param fftSize - FFT size for each segment (default: 1024)
   * @param overlap - Overlap fraction between segments (default: 0.5)
   * @param window - Window function ('hann', 'hamming', 'blackman', 'kaiser')
   */
  async computePSD(
    iqReal: Float32Array,
    iqImag: Float32Array,
    fftSize: number = 1024,
    overlap: number = 0.5,
    window: string = 'hann'
  ): Promise<PSDResult> {
    const response = await this.request({
      command: 'psd',
      iq_real: Array.from(iqReal),
      iq_imag: Array.from(iqImag),
      params: { fft_size: fftSize, overlap, window }
    });
    
    return {
      psd: new Float32Array(response.psd),
      fft_size: response.fft_size,
      num_bins: response.num_bins
    };
  }
  
  /**
   * Compute FAM Cyclostationary Analysis using GPU
   * 
   * @param iqReal - Real part of IQ samples
   * @param iqImag - Imaginary part of IQ samples
   * @param sampleRate - Sample rate in Hz
   * @param params - FAM parameters
   */
  async computeFAM(
    iqReal: Float32Array,
    iqImag: Float32Array,
    sampleRate: number,
    params: {
      nfft?: number;
      overlap?: number;
      alpha_max?: number;
    } = {}
  ): Promise<FAMResult> {
    const response = await this.request({
      command: 'fam',
      iq_real: Array.from(iqReal),
      iq_imag: Array.from(iqImag),
      params: {
        sample_rate: sampleRate,
        nfft: params.nfft ?? 256,
        overlap: params.overlap ?? 0.5,
        alpha_max: params.alpha_max ?? 0.5
      }
    });
    
    return {
      scf_magnitude: response.scf_magnitude.map((row: number[]) => new Float32Array(row)),
      spectral_freqs: new Float32Array(response.spectral_freqs),
      cyclic_freqs: new Float32Array(response.cyclic_freqs),
      cyclic_profile: new Float32Array(response.cyclic_profile),
      shape: response.shape as [number, number]
    };
  }
  
  /**
   * Compute Wigner-Ville Distribution using GPU
   * 
   * @param iqReal - Real part of IQ samples
   * @param iqImag - Imaginary part of IQ samples
   * @param params - WVD parameters
   */
  async computeWVD(
    iqReal: Float32Array,
    iqImag: Float32Array,
    params: {
      nfft?: number;
      num_time_points?: number;
      smoothing?: boolean;
      smooth_window?: number;
    } = {}
  ): Promise<WVDResult> {
    const response = await this.request({
      command: 'wvd',
      iq_real: Array.from(iqReal),
      iq_imag: Array.from(iqImag),
      params: {
        nfft: params.nfft ?? 256,
        num_time_points: params.num_time_points,
        smoothing: params.smoothing ?? false,
        smooth_window: params.smooth_window ?? 16
      }
    });
    
    return {
      wvd: response.wvd.map((row: number[]) => new Float32Array(row)),
      time_axis: new Float32Array(response.time_axis),
      freq_axis: new Float32Array(response.freq_axis),
      shape: response.shape as [number, number]
    };
  }
  
  /**
   * Compute Choi-Williams Distribution using GPU
   * 
   * @param iqReal - Real part of IQ samples
   * @param iqImag - Imaginary part of IQ samples
   * @param params - CWD parameters
   */
  async computeCWD(
    iqReal: Float32Array,
    iqImag: Float32Array,
    params: {
      nfft?: number;
      sigma?: number;
      num_time_points?: number;
    } = {}
  ): Promise<WVDResult> {
    const response = await this.request({
      command: 'cwd',
      iq_real: Array.from(iqReal),
      iq_imag: Array.from(iqImag),
      params: {
        nfft: params.nfft ?? 256,
        sigma: params.sigma ?? 1.0,
        num_time_points: params.num_time_points
      }
    });
    
    return {
      wvd: response.cwd.map((row: number[]) => new Float32Array(row)),
      time_axis: new Float32Array(response.time_axis),
      freq_axis: new Float32Array(response.freq_axis),
      shape: response.shape as [number, number]
    };
  }
  
  /**
   * Extract RF-DNA features using GPU
   * 
   * @param iqReal - Real part of IQ samples
   * @param iqImag - Imaginary part of IQ samples
   * @param regions - Number of signal regions (default: 20)
   */
  async extractRFDNA(
    iqReal: Float32Array,
    iqImag: Float32Array,
    regions: number = 20
  ): Promise<RFDNAResult> {
    const response = await this.request({
      command: 'rf_dna',
      iq_real: Array.from(iqReal),
      iq_imag: Array.from(iqImag),
      params: { regions }
    });
    
    return {
      features: new Float32Array(response.features),
      feature_count: response.feature_count,
      regions: response.regions
    };
  }
  
  /**
   * Compute higher-order cumulants using GPU
   * 
   * @param iqReal - Real part of IQ samples
   * @param iqImag - Imaginary part of IQ samples
   * @param orders - Cumulant orders to compute (default: [4, 6])
   */
  async computeCumulants(
    iqReal: Float32Array,
    iqImag: Float32Array,
    orders: number[] = [4, 6]
  ): Promise<CumulantsResult> {
    const response = await this.request({
      command: 'cumulants',
      iq_real: Array.from(iqReal),
      iq_imag: Array.from(iqImag),
      params: { orders }
    });
    
    return response as CumulantsResult;
  }
}

// ================== Singleton Management ==================

let gpuBridgeInstance: GPUBridge | null = null;

/**
 * Get or create singleton GPU bridge instance
 */
export function getGPUBridge(config?: Partial<GPUBridgeConfig>): GPUBridge {
  if (!gpuBridgeInstance) {
    gpuBridgeInstance = new GPUBridge(config);
  }
  return gpuBridgeInstance;
}

/**
 * Initialize GPU bridge (call at server startup)
 */
export async function initGPUBridge(config?: Partial<GPUBridgeConfig>): Promise<GPUBridge> {
  const bridge = getGPUBridge(config);
  await bridge.connect();
  return bridge;
}

/**
 * Shutdown GPU bridge (call at server shutdown)
 */
export async function shutdownGPUBridge(): Promise<void> {
  if (gpuBridgeInstance) {
    await gpuBridgeInstance.disconnect();
    gpuBridgeInstance = null;
  }
}

// ================== Fallback CPU Implementation ==================

/**
 * CPU fallback for when GPU service is unavailable
 * Uses existing TypeScript DSP implementations
 */
export class CPUFallback {
  private dsp: typeof import('./dsp') | null = null;
  
  async init(): Promise<void> {
    this.dsp = await import('./dsp');
  }
  
  computePSD(iqReal: Float32Array, iqImag: Float32Array, fftSize: number = 1024): Float32Array {
    if (!this.dsp) {
      throw new Error('CPU fallback not initialized');
    }
    
    // Convert to Complex array
    const samples = Array.from({ length: iqReal.length }, (_, i) => ({
      re: iqReal[i],
      im: iqImag[i]
    }));
    
    const psd = this.dsp.computePSD(samples, fftSize);
    return new Float32Array(psd);
  }
}

// Export types
export type {
  GPUBridgeConfig,
  GPURequest,
  GPUResponse,
  PSDResult,
  FAMResult,
  WVDResult,
  RFDNAResult,
  CumulantsResult,
  GPUMemoryInfo,
  GPUServiceStats
};
