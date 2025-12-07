import { useState, useEffect, useCallback, useRef } from 'react';

export interface StreamingData {
  fft: number[][];
  samplesRead: number;
  timestamp: number;
  fftSize: number;
}

export interface StreamingStats {
  fps: number;
  latency: number;
  bytesReceived: number;
  packetsReceived: number;
  packetsDropped: number;
}

export interface UseStreamingModeOptions {
  enabled: boolean;
  sessionId?: string;
  onData?: (data: StreamingData) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Hook for managing real-time SDR streaming mode.
 * Connects to WebSocket server and receives FFT data for live spectrogram display.
 */
export function useStreamingMode(options: UseStreamingModeOptions) {
  const { enabled, sessionId, onData, onError, onConnect, onDisconnect } = options;
  
  const [isConnected, setIsConnected] = useState(false);
  const [latestData, setLatestData] = useState<StreamingData | null>(null);
  const [stats, setStats] = useState<StreamingStats>({
    fps: 0,
    latency: 0,
    bytesReceived: 0,
    packetsReceived: 0,
    packetsDropped: 0,
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  
  const connect = useCallback(() => {
    if (!enabled || !sessionId) return;
    
    try {
      // Construct WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/stream?session=${sessionId}`;
      
      console.log('[useStreamingMode] Connecting to:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      
      ws.onopen = () => {
        console.log('[useStreamingMode] Connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        onConnect?.();
      };
      
      ws.onmessage = (event) => {
        try {
          // Parse JSON message
          const data: StreamingData = JSON.parse(event.data);
          
          // Update stats
          frameCountRef.current++;
          const now = Date.now();
          const elapsed = now - lastFpsUpdateRef.current;
          
          if (elapsed >= 1000) {
            const fps = (frameCountRef.current / elapsed) * 1000;
            const latency = now - data.timestamp * 1000;
            
            setStats(prev => ({
              ...prev,
              fps: Math.round(fps * 10) / 10,
              latency: Math.round(latency),
              bytesReceived: prev.bytesReceived + event.data.length,
              packetsReceived: prev.packetsReceived + 1,
            }));
            
            frameCountRef.current = 0;
            lastFpsUpdateRef.current = now;
          }
          
          // Update latest data
          setLatestData(data);
          onData?.(data);
          
        } catch (error) {
          console.error('[useStreamingMode] Failed to parse message:', error);
          onError?.(error as Error);
        }
      };
      
      ws.onerror = (event) => {
        console.error('[useStreamingMode] WebSocket error:', event);
        onError?.(new Error('WebSocket connection error'));
      };
      
      ws.onclose = (event) => {
        console.log('[useStreamingMode] Disconnected:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;
        onDisconnect?.();
        
        // Attempt reconnection with exponential backoff
        if (enabled && reconnectAttemptsRef.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`[useStreamingMode] Reconnecting in ${delay}ms...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      };
      
      wsRef.current = ws;
      
    } catch (error) {
      console.error('[useStreamingMode] Failed to create WebSocket:', error);
      onError?.(error as Error);
    }
  }, [enabled, sessionId, onData, onError, onConnect, onDisconnect]);
  
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      console.log('[useStreamingMode] Closing connection');
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    setIsConnected(false);
    setLatestData(null);
  }, []);
  
  // Connect/disconnect based on enabled state
  useEffect(() => {
    if (enabled && sessionId) {
      connect();
    } else {
      disconnect();
    }
    
    return () => {
      disconnect();
    };
  }, [enabled, sessionId, connect, disconnect]);
  
  return {
    isConnected,
    latestData,
    stats,
    disconnect,
  };
}
