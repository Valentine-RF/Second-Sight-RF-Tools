import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

/**
 * WebSocket Streaming Server
 * 
 * Provides real-time IQ sample streaming from SoapySDR to frontend.
 * Handles authentication, session management, and FFT data broadcasting.
 */

interface StreamingClient {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  isAlive: boolean;
}

const clients = new Map<string, StreamingClient>();

/**
 * Initialize WebSocket server
 */
export function initializeWebSocketServer(httpServer: Server) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/stream',
  });

  wss.on('connection', async (ws: WebSocket, req: any) => {
    console.log('[WebSocket] New connection attempt');

    // Extract JWT token from query string or headers
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      console.log('[WebSocket] No token provided, closing connection');
      ws.close(1008, 'Authentication required');
      return;
    }

    // Simple token validation (TODO: integrate with actual JWT verification)
    // For now, extract user ID from token or use placeholder
    const userId = token.split('-')[0] || 'anonymous';

    // Generate session ID
    const sessionId = `${userId}-${Date.now()}`;

    // Store client
    const client: StreamingClient = {
      ws,
      userId,
      sessionId,
      isAlive: true,
    };
    clients.set(sessionId, client);

    console.log(`[WebSocket] Client connected: ${sessionId}`);

    // Heartbeat
    ws.on('pong', () => {
      client.isAlive = true;
    });

    // Handle messages from client
    ws.on('message', (data: any) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(sessionId, message);
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected: ${sessionId}`);
      clients.delete(sessionId);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      sessionId,
    }));
  });

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    for (const [sessionId, client] of Array.from(clients.entries())) {
      if (!client.isAlive) {
        console.log(`[WebSocket] Client timeout: ${sessionId}`);
        client.ws.terminate();
        clients.delete(sessionId);
        return;
      }

      client.isAlive = false;
      client.ws.ping();
    }
  }, 30000); // 30 seconds

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  console.log('[WebSocket] Server initialized on /ws/stream');

  return wss;
}

/**
 * Handle messages from client
 */
function handleClientMessage(sessionId: string, message: any) {
  const client = clients.get(sessionId);
  if (!client) return;

  switch (message.type) {
    case 'subscribe':
      console.log(`[WebSocket] Client ${sessionId} subscribed to stream`);
      // TODO: Signal Python backend to start sending IQ samples
      break;

    case 'unsubscribe':
      console.log(`[WebSocket] Client ${sessionId} unsubscribed from stream`);
      // TODO: Signal Python backend to stop sending IQ samples
      break;

    default:
      console.log(`[WebSocket] Unknown message type: ${message.type}`);
  }
}

/**
 * Broadcast IQ samples to all connected clients
 */
export function broadcastIQSamples(data: {
  samples: Float32Array;
  sampleRate: number;
  centerFreq: number;
  timestamp: number;
}) {
  const message = JSON.stringify({
    type: 'iq_samples',
    data: {
      samples: Array.from(data.samples), // Convert to regular array for JSON
      sampleRate: data.sampleRate,
      centerFreq: data.centerFreq,
      timestamp: data.timestamp,
    },
  });

  for (const client of Array.from(clients.values())) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

/**
 * Broadcast FFT data to all connected clients
 */
export function broadcastFFTData(data: {
  frequencies: Float32Array;
  magnitudes: Float32Array;
  centerFreq: number;
  sampleRate: number;
  timestamp: number;
}) {
  const message = JSON.stringify({
    type: 'fft_data',
    data: {
      frequencies: Array.from(data.frequencies),
      magnitudes: Array.from(data.magnitudes),
      centerFreq: data.centerFreq,
      sampleRate: data.sampleRate,
      timestamp: data.timestamp,
    },
  });

  for (const client of Array.from(clients.values())) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

/**
 * Send message to specific client
 */
export function sendToClient(sessionId: string, message: any) {
  const client = clients.get(sessionId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

/**
 * Get active client count
 */
export function getActiveClientCount(): number {
  return clients.size;
}
