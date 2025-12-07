/**
 * React Hook for Streaming Pipeline Integration
 * 
 * Manages pipeline lifecycle and connects to WebGL visualizations
 * Uses useRef for high-frequency data (no React state for FFT results)
 * Uses requestAnimationFrame for smooth visualization updates
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import { StreamingPipeline, type PipelineConfig } from '../lib/streamingPipeline';
import type { SigMFDatatype } from '../lib/sigmfDataReader';

/**
 * Hook configuration
 */
export interface UseStreamingPipelineConfig {
  /** URL to .sigmf-data file */
  dataUrl: string;
  /** SigMF datatype */
  datatype: SigMFDatatype;
  /** FFT size (must be power of 2, valid range: 256-8192) */
  fftSize?: number;
  /** Window function (default: 'hann') */
  window?: 'rectangular' | 'hamming' | 'hann' | 'blackmanHarris';
  /** Chunk size in complex samples (default: 8192) */
  chunkSize?: number;
  /** Max queue size for backpressure (default: 10) */
  maxQueueSize?: number;
}

/**
 * Pipeline state
 */
export interface PipelineState {
  /** Current state */
  state: 'idle' | 'running' | 'paused' | 'stopped';
  /** Processing progress (0-100) */
  progress: number;
  /** Current queue size */
  queueSize: number;
  /** Error if any */
  error: Error | null;
}

/**
 * Hook return value
 */
export interface UseStreamingPipelineReturn {
  /** Current pipeline state */
  state: PipelineState;
  /** Start streaming */
  start: () => void;
  /** Pause streaming */
  pause: () => void;
  /** Resume streaming */
  resume: () => void;
  /** Stop streaming */
  stop: () => void;
  /** Register FFT callback (for spectrograms/waterfall) */
  onFFT: (callback: (fft: Float32Array, chunkIndex: number) => void) => void;
  /** Register samples callback (for constellation plot) */
  onSamples: (callback: (samples: Float32Array, chunkIndex: number) => void) => void;
}

/**
 * Hook for streaming pipeline
 */
export function useStreamingPipeline(config: UseStreamingPipelineConfig): UseStreamingPipelineReturn {
  const pipelineRef = useRef<StreamingPipeline | null>(null);
  const fftCallbackRef = useRef<((fft: Float32Array, chunkIndex: number) => void) | null>(null);
  const samplesCallbackRef = useRef<((samples: Float32Array, chunkIndex: number) => void) | null>(null);
  
  const [state, setState] = useState<PipelineState>({
    state: 'idle',
    progress: 0,
    queueSize: 0,
    error: null
  });
  
  // Initialize pipeline
  useEffect(() => {
    const pipelineConfig: PipelineConfig = {
      dataUrl: config.dataUrl,
      datatype: config.datatype,
      fftSize: config.fftSize || 1024,
      window: config.window || 'hann',
      chunkSize: config.chunkSize || 8192,
      maxQueueSize: config.maxQueueSize || 10,
      onFFT: (fft, chunkIndex) => {
        if (fftCallbackRef.current) {
          fftCallbackRef.current(fft, chunkIndex);
        }
      },
      onSamples: (samples, chunkIndex) => {
        if (samplesCallbackRef.current) {
          samplesCallbackRef.current(samples, chunkIndex);
        }
      },
      onProgress: (percent) => {
        setState(prev => ({ ...prev, progress: percent }));
      },
      onComplete: () => {
        setState(prev => ({ ...prev, state: 'idle', progress: 100 }));
      },
      onError: (error) => {
        setState(prev => ({ ...prev, state: 'stopped', error }));
      }
    };
    
    pipelineRef.current = new StreamingPipeline(pipelineConfig);
    
    // Cleanup on unmount
    return () => {
      if (pipelineRef.current) {
        pipelineRef.current.stop();
      }
    };
  }, [config.dataUrl, config.datatype, config.fftSize, config.window, config.chunkSize, config.maxQueueSize]);
  
  // Start streaming
  const start = useCallback(() => {
    if (pipelineRef.current) {
      pipelineRef.current.start();
      setState(prev => ({ ...prev, state: 'running', progress: 0, error: null }));
    }
  }, []);
  
  // Pause streaming
  const pause = useCallback(() => {
    if (pipelineRef.current) {
      pipelineRef.current.pause();
      setState(prev => ({ ...prev, state: 'paused' }));
    }
  }, []);
  
  // Resume streaming
  const resume = useCallback(() => {
    if (pipelineRef.current) {
      pipelineRef.current.resume();
      setState(prev => ({ ...prev, state: 'running' }));
    }
  }, []);
  
  // Stop streaming
  const stop = useCallback(() => {
    if (pipelineRef.current) {
      pipelineRef.current.stop();
      setState(prev => ({ ...prev, state: 'stopped', progress: 0 }));
    }
  }, []);
  
  // Register FFT callback
  const onFFT = useCallback((callback: (fft: Float32Array, chunkIndex: number) => void) => {
    fftCallbackRef.current = callback;
  }, []);
  
  // Register samples callback
  const onSamples = useCallback((callback: (samples: Float32Array, chunkIndex: number) => void) => {
    samplesCallbackRef.current = callback;
  }, []);
  
  return {
    state,
    start,
    pause,
    resume,
    stop,
    onFFT,
    onSamples
  };
}
