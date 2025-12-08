/**
 * useSDRStream - React hook for SDR WebSocket streaming
 * 
 * Connects to SDR backend via WebSocket and provides real-time IQ data
 * with FFT computation for spectrogram/waterfall display.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

// Types
export interface SDRStreamConfig {
  deviceSerial: string;
  frequency: number;     // Hz
  sampleRate: number;    // Sps
  gain: number;          // dB
  antenna: string;
  bandwidth: number;     // Hz
}

export interface FFTData {
  frequencies: Float32Array;
  magnitudes: Float32Array;
  timestamp: number;
  centerFreq: number;
  sampleRate: number;
}

export interface IQData {
  samples: Float32Array;  // Interleaved I/Q
  timestamp: number;
  numSamples: number;
}

export interface StreamStats {
  isConnected: boolean;
  isStreaming: boolean;
  isRecording: boolean;
  samplesReceived: number;
  packetsReceived: number;
  droppedPackets: number;
  latencyMs: number;
  bufferLevel: number;  // 0-100%
  errorCount: number;
  lastError: string | null;
}

interface UseSDRStreamOptions {
  fftSize?: number;
  onFFTData?: (data: FFTData) => void;
  onIQData?: (data: IQData) => void;
  onError?: (error: Error) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

const DEFAULT_FFT_SIZE = 1024;
const RECONNECT_INTERVAL = 3000;

// Simple FFT implementation (for fallback - prefer Web Worker)
function computeFFT(samples: Float32Array, fftSize: number): Float32Array {
  const n = fftSize;
  const magnitudes = new Float32Array(n);
  
  // Convert interleaved I/Q to complex
  const numComplex = Math.min(samples.length / 2, n);
  
  // Simple DFT (use Web Worker with proper FFT for production)
  for (let k = 0; k < n; k++) {
    let realSum = 0;
    let imagSum = 0;
    
    for (let t = 0; t < numComplex; t++) {
      const angle = -2 * Math.PI * k * t / n;
      const re = samples[t * 2];      // I
      const im = samples[t * 2 + 1];  // Q
      
      realSum += re * Math.cos(angle) - im * Math.sin(angle);
      imagSum += re * Math.sin(angle) + im * Math.cos(angle);
    }
    
    // Magnitude in dB
    const mag = Math.sqrt(realSum * realSum + imagSum * imagSum) / n;
    magnitudes[k] = 20 * Math.log10(Math.max(mag, 1e-10));
  }
  
  // FFT shift (put DC in center)
  const shifted = new Float32Array(n);
  const half = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    shifted[i] = magnitudes[(i + half) % n];
  }
  
  return shifted;
}

// Window functions for better spectral analysis
function applyHannWindow(samples: Float32Array): Float32Array {
  const n = samples.length / 2;
  const windowed = new Float32Array(samples.length);
  
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    windowed[i * 2] = samples[i * 2] * w;
    windowed[i * 2 + 1] = samples[i * 2 + 1] * w;
  }
  
  return windowed;
}

export function useSDRStream(options: UseSDRStreamOptions = {}) {
  const {
    fftSize = DEFAULT_FFT_SIZE,
    onFFTData,
    onIQData,
    onError,
    autoReconnect = true,
    reconnectInterval = RECONNECT_INTERVAL,
  } = options;

  // State
  const [stats, setStats] = useState<StreamStats>({
    isConnected: false,
    isStreaming: false,
    isRecording: false,
    samplesReceived: 0,
    packetsReceived: 0,
    droppedPackets: 0,
    latencyMs: 0,
    bufferLevel: 0,
    errorCount: 0,
    lastError: null,
  });

  const [config, setConfig] = useState<SDRStreamConfig | null>(null);
  const [latestFFT, setLatestFFT] = useState<FFTData | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statsRef = useRef(stats);
  const configRef = useRef(config);
  const workerRef = useRef<Worker | null>(null);

  // Keep refs in sync
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Initialize Web Worker for FFT (if available)
  useEffect(() => {
    // Try to create FFT worker
    try {
      const workerCode = `
        // FFT Worker
        const fftSize = ${fftSize};
        
        // Cooley-Tukey FFT
        function fft(real, imag) {
          const n = real.length;
          if (n <= 1) return;
          
          // Bit reversal
          for (let i = 0, j = 0; i < n; i++) {
            if (i < j) {
              [real[i], real[j]] = [real[j], real[i]];
              [imag[i], imag[j]] = [imag[j], imag[i]];
            }
            let m = n >> 1;
            while (j >= m && m > 0) {
              j -= m;
              m >>= 1;
            }
            j += m;
          }
          
          // Cooley-Tukey
          for (let len = 2; len <= n; len <<= 1) {
            const halfLen = len >> 1;
            const angle = -2 * Math.PI / len;
            const wR = Math.cos(angle);
            const wI = Math.sin(angle);
            
            for (let i = 0; i < n; i += len) {
              let curR = 1, curI = 0;
              
              for (let j = 0; j < halfLen; j++) {
                const idx1 = i + j;
                const idx2 = i + j + halfLen;
                
                const tR = curR * real[idx2] - curI * imag[idx2];
                const tI = curR * imag[idx2] + curI * real[idx2];
                
                real[idx2] = real[idx1] - tR;
                imag[idx2] = imag[idx1] - tI;
                real[idx1] += tR;
                imag[idx1] += tI;
                
                const newR = curR * wR - curI * wI;
                curI = curR * wI + curI * wR;
                curR = newR;
              }
            }
          }
        }
        
        self.onmessage = (e) => {
          const { samples, timestamp, centerFreq, sampleRate } = e.data;
          
          // Apply Hann window
          const n = Math.min(samples.length / 2, fftSize);
          const real = new Float32Array(fftSize);
          const imag = new Float32Array(fftSize);
          
          for (let i = 0; i < n; i++) {
            const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
            real[i] = samples[i * 2] * w;
            imag[i] = samples[i * 2 + 1] * w;
          }
          
          // Compute FFT
          fft(real, imag);
          
          // Compute magnitude in dB and shift
          const magnitudes = new Float32Array(fftSize);
          const half = fftSize >> 1;
          
          for (let i = 0; i < fftSize; i++) {
            const srcIdx = (i + half) % fftSize;
            const mag = Math.sqrt(real[srcIdx] * real[srcIdx] + imag[srcIdx] * imag[srcIdx]) / fftSize;
            magnitudes[i] = 20 * Math.log10(Math.max(mag, 1e-10));
          }
          
          // Generate frequency axis
          const frequencies = new Float32Array(fftSize);
          const freqStep = sampleRate / fftSize;
          for (let i = 0; i < fftSize; i++) {
            frequencies[i] = centerFreq + (i - half) * freqStep;
          }
          
          self.postMessage({
            frequencies,
            magnitudes,
            timestamp,
            centerFreq,
            sampleRate
          });
        };
      `;
      
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      workerRef.current = new Worker(URL.createObjectURL(blob));
      
      workerRef.current.onmessage = (e: MessageEvent<FFTData>) => {
        setLatestFFT(e.data);
        onFFTData?.(e.data);
      };
      
      workerRef.current.onerror = (err) => {
        console.error('[FFT Worker] Error:', err);
      };
      
    } catch (err) {
      console.warn('[useSDRStream] Web Worker not available, using main thread FFT');
    }
    
    return () => {
      workerRef.current?.terminate();
    };
  }, [fftSize, onFFTData]);

  // Process incoming IQ data
  const processIQData = useCallback((data: ArrayBuffer | string, timestamp: number) => {
    const currentConfig = configRef.current;
    if (!currentConfig) return;

    let samples: Float32Array;
    
    if (typeof data === 'string') {
      // Hex-encoded data (JSON transport)
      const buffer = new Uint8Array(data.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      samples = new Float32Array(buffer.buffer);
    } else {
      // Binary data (WebSocket binary)
      samples = new Float32Array(data);
    }

    const numSamples = samples.length / 2;

    // Update stats
    setStats(prev => ({
      ...prev,
      samplesReceived: prev.samplesReceived + numSamples,
      packetsReceived: prev.packetsReceived + 1,
      latencyMs: Date.now() - timestamp,
    }));

    // Emit raw IQ data
    const iqData: IQData = {
      samples,
      timestamp,
      numSamples,
    };
    onIQData?.(iqData);

    // Compute FFT (via worker if available)
    if (workerRef.current) {
      workerRef.current.postMessage({
        samples,
        timestamp,
        centerFreq: currentConfig.frequency,
        sampleRate: currentConfig.sampleRate,
      });
    } else {
      // Fallback: main thread FFT
      const windowed = applyHannWindow(samples);
      const magnitudes = computeFFT(windowed, fftSize);
      
      // Generate frequency axis
      const frequencies = new Float32Array(fftSize);
      const freqStep = currentConfig.sampleRate / fftSize;
      const half = fftSize / 2;
      
      for (let i = 0; i < fftSize; i++) {
        frequencies[i] = currentConfig.frequency + (i - half) * freqStep;
      }
      
      const fftData: FFTData = {
        frequencies,
        magnitudes,
        timestamp,
        centerFreq: currentConfig.frequency,
        sampleRate: currentConfig.sampleRate,
      };
      
      setLatestFFT(fftData);
      onFFTData?.(fftData);
    }
  }, [fftSize, onFFTData, onIQData]);

  // Connect to WebSocket
  const connect = useCallback((sessionId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[useSDRStream] Already connected');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream?token=${sessionId}`;
    
    console.log('[useSDRStream] Connecting to', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    
    ws.onopen = () => {
      console.log('[useSDRStream] Connected');
      setStats(prev => ({ ...prev, isConnected: true, lastError: null }));
      
      // Subscribe to stream
      ws.send(JSON.stringify({ type: 'subscribe' }));
    };
    
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary IQ data
        processIQData(event.data, Date.now());
      } else {
        // JSON message
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'sdr_iq_data':
            case 'fft_data':
              processIQData(message.data.samples || message.data, message.timestamp || Date.now());
              break;
            
            case 'stream_started':
              setStats(prev => ({ ...prev, isStreaming: true }));
              break;
            
            case 'stream_stopped':
              setStats(prev => ({ ...prev, isStreaming: false }));
              break;
            
            case 'recording_started':
              setStats(prev => ({ ...prev, isRecording: true }));
              break;
            
            case 'recording_stopped':
              setStats(prev => ({ ...prev, isRecording: false }));
              break;
            
            case 'error':
              const error = new Error(message.error || 'Unknown error');
              setStats(prev => ({
                ...prev,
                errorCount: prev.errorCount + 1,
                lastError: message.error,
              }));
              onError?.(error);
              break;
            
            case 'stats':
              setStats(prev => ({
                ...prev,
                bufferLevel: message.bufferLevel ?? prev.bufferLevel,
                droppedPackets: message.dropped ?? prev.droppedPackets,
              }));
              break;
          }
        } catch (err) {
          console.error('[useSDRStream] Failed to parse message:', err);
        }
      }
    };
    
    ws.onerror = (error) => {
      console.error('[useSDRStream] WebSocket error:', error);
      setStats(prev => ({
        ...prev,
        errorCount: prev.errorCount + 1,
        lastError: 'WebSocket error',
      }));
      onError?.(new Error('WebSocket connection error'));
    };
    
    ws.onclose = (event) => {
      console.log('[useSDRStream] Disconnected:', event.code, event.reason);
      setStats(prev => ({
        ...prev,
        isConnected: false,
        isStreaming: false,
      }));
      
      wsRef.current = null;
      
      // Auto-reconnect if enabled and not intentional close
      if (autoReconnect && event.code !== 1000) {
        reconnectTimeoutRef.current = setTimeout(() => {
          if (configRef.current) {
            console.log('[useSDRStream] Attempting reconnect...');
            connect(sessionId);
          }
        }, reconnectInterval);
      }
    };
    
    wsRef.current = ws;
  }, [processIQData, onError, autoReconnect, reconnectInterval]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    }
    
    setStats(prev => ({
      ...prev,
      isConnected: false,
      isStreaming: false,
      isRecording: false,
    }));
  }, []);

  // Start streaming
  const startStream = useCallback((newConfig: SDRStreamConfig, sessionId: string) => {
    setConfig(newConfig);
    connect(sessionId);
  }, [connect]);

  // Stop streaming
  const stopStream = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop_stream' }));
    }
    disconnect();
    setConfig(null);
  }, [disconnect]);

  // Request recording start
  const startRecording = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start_recording' }));
    }
  }, []);

  // Request recording stop
  const stopRecording = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop_recording' }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    // State
    stats,
    config,
    latestFFT,
    isConnected: stats.isConnected,
    isStreaming: stats.isStreaming,
    isRecording: stats.isRecording,
    
    // Actions
    startStream,
    stopStream,
    startRecording,
    stopRecording,
    connect,
    disconnect,
  };
}

export default useSDRStream;
