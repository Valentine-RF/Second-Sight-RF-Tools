import { useState, useEffect } from 'react';
import { trpc } from '../lib/trpc';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Play, Square, Circle, Pause } from 'lucide-react';
import { toast } from 'sonner';

interface SDRStreamingPanelProps {
  onStreamStart?: () => void;
  onStreamStop?: () => void;
}

export function SDRStreamingPanel({ onStreamStart, onStreamStop }: SDRStreamingPanelProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  
  // Enumerate devices mutation
  const enumerateDevicesMutation = trpc.sdr.enumerateDevices.useMutation({
    onSuccess: (devices) => {
      console.log('Enumerated devices:', devices);
      toast.success(`Found ${devices.length} SDR device(s)`);
    },
    onError: (error) => {
      toast.error(`Failed to enumerate devices: ${error.message}`);
    },
  });
  
  // Start stream mutation
  const startStreamMutation = trpc.sdr.startStream.useMutation({
    onSuccess: (result) => {
      setIsStreaming(true);
      toast.success('Stream started');
      // Connect WebSocket
      connectWebSocket(result.sessionId);
      onStreamStart?.();
    },
    onError: (error) => {
      toast.error(`Failed to start stream: ${error.message}`);
    },
  });
  
  // Stop stream mutation
  const stopStreamMutation = trpc.sdr.stopStream.useMutation({
    onSuccess: () => {
      setIsStreaming(false);
      setIsPaused(false);
      setIsRecording(false);
      toast.success('Stream stopped');
      // Disconnect WebSocket
      if (ws) {
        ws.close();
        setWs(null);
      }
      onStreamStop?.();
    },
    onError: (error) => {
      toast.error(`Failed to stop stream: ${error.message}`);
    },
  });
  
  // Start recording mutation
  const startRecordingMutation = trpc.sdr.startRecording.useMutation({
    onSuccess: (result) => {
      setIsRecording(true);
      toast.success(`Recording started: ${result.filename}`);
    },
    onError: (error) => {
      toast.error(`Failed to start recording: ${error.message}`);
    },
  });
  
  // Stop recording mutation
  const stopRecordingMutation = trpc.sdr.stopRecording.useMutation({
    onSuccess: (result) => {
      setIsRecording(false);
      toast.success(`Recording saved: ${result.filename}`);
    },
    onError: (error) => {
      toast.error(`Failed to stop recording: ${error.message}`);
    },
  });
  
  // WebSocket connection
  const connectWebSocket = (sessionId: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream?token=${sessionId}`;
    
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('[WebSocket] Connected');
      websocket.send(JSON.stringify({ type: 'subscribe' }));
    };
    
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'fft_data') {
        // TODO: Pass FFT data to WaterfallDisplay
        console.log('[WebSocket] Received FFT data:', message.data);
      }
    };
    
    websocket.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
      toast.error('WebSocket connection error');
    };
    
    websocket.onclose = () => {
      console.log('[WebSocket] Disconnected');
    };
    
    setWs(websocket);
  };
  
  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [ws]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  // SDR Configuration State
  const [selectedDevice, setSelectedDevice] = useState<string>('usdr0');
  const [frequency, setFrequency] = useState(100.0); // MHz
  const [sampleRate, setSampleRate] = useState(2.048); // MSps
  const [gain, setGain] = useState(30); // dB
  const [antenna, setAntenna] = useState('LNAH');
  const [bandwidth, setBandwidth] = useState(2.0); // MHz
  
  const handleStartStream = () => {
    startStreamMutation.mutate({
      deviceSerial: selectedDevice,
      frequency: frequency * 1e6, // Convert MHz to Hz
      sampleRate: sampleRate * 1e6, // Convert MSps to Sps
      gain: gain,
      antenna: antenna,
      bandwidth: bandwidth * 1e6, // Convert MHz to Hz
    });
  };
  
  const handleStopStream = () => {
    stopStreamMutation.mutate({ deviceSerial: selectedDevice });
  };
  
  const handleStartRecording = () => {
    startRecordingMutation.mutate({ deviceSerial: selectedDevice });
  };
  
  const handleStopRecording = () => {
    stopRecordingMutation.mutate({ deviceSerial: selectedDevice });
  };
  
  // Preset frequency bands
  const presetBands = [
    { name: 'FM Broadcast', freq: 100.0 },
    { name: 'Air Band', freq: 121.5 },
    { name: 'Marine VHF', freq: 156.8 },
    { name: 'PMR446', freq: 446.0 },
    { name: 'ISM 433', freq: 433.92 },
    { name: 'ISM 868', freq: 868.0 },
    { name: 'ISM 915', freq: 915.0 },
    { name: 'GSM 900', freq: 935.0 },
    { name: 'GSM 1800', freq: 1805.0 },
    { name: 'GPS L1', freq: 1575.42 },
    { name: 'WiFi 2.4G', freq: 2437.0 },
  ];
  
  return (
    <Card className="p-4 space-y-4 bg-card/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="font-black text-sm">SDR LIVE STREAMING</h3>
        <div className="flex items-center gap-2">
          {isStreaming && (
            <>
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">
                {isRecording ? 'RECORDING' : isPaused ? 'PAUSED' : 'LIVE'}
              </span>
            </>
          )}
        </div>
      </div>
      
      {/* Device Selection */}
      <div className="space-y-2">
        <label className="technical-label">SDR Device</label>
        <Select value={selectedDevice} onValueChange={setSelectedDevice}>
          <SelectTrigger>
            <SelectValue placeholder="Select SDR device..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="usdr0">USDR (PCIe) - 012345678</SelectItem>
            <SelectItem value="rtlsdr0">RTL-SDR #0</SelectItem>
            <SelectItem value="hackrf0">HackRF One</SelectItem>
            <SelectItem value="airspy0">Airspy R2</SelectItem>
            <SelectItem value="bladerf0">bladeRF x40</SelectItem>
            <SelectItem value="limesdr0">LimeSDR USB</SelectItem>
            <SelectItem value="pluto0">PlutoSDR</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Frequency Control */}
      <div className="space-y-2">
        <label className="technical-label">Center Frequency (MHz)</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={frequency}
            onChange={(e) => setFrequency(parseFloat(e.target.value))}
            step="0.001"
            min="0.1"
            max="6000"
            className="flex-1 px-3 py-2 bg-background border border-border rounded text-sm"
            disabled={isStreaming}
          />
          <Select
            value={frequency.toString()}
            onValueChange={(val) => setFrequency(parseFloat(val))}
            disabled={isStreaming}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Presets" />
            </SelectTrigger>
            <SelectContent>
              {presetBands.map((band) => (
                <SelectItem key={band.name} value={band.freq.toString()}>
                  {band.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Sample Rate */}
      <div className="space-y-2">
        <label className="technical-label">Sample Rate (MSps)</label>
        <Select
          value={sampleRate.toString()}
          onValueChange={(val) => setSampleRate(parseFloat(val))}
          disabled={isStreaming}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.25">0.25 MSps</SelectItem>
            <SelectItem value="1.024">1.024 MSps</SelectItem>
            <SelectItem value="2.048">2.048 MSps</SelectItem>
            <SelectItem value="2.4">2.4 MSps</SelectItem>
            <SelectItem value="3.2">3.2 MSps</SelectItem>
            <SelectItem value="8.0">8.0 MSps</SelectItem>
            <SelectItem value="10.0">10.0 MSps</SelectItem>
            <SelectItem value="20.0">20.0 MSps</SelectItem>
            <SelectItem value="40.0">40.0 MSps</SelectItem>
            <SelectItem value="61.44">61.44 MSps</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Gain Control */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <label className="technical-label">RX Gain</label>
          <span className="text-xs text-muted-foreground">{gain} dB</span>
        </div>
        <Slider
          value={[gain]}
          onValueChange={([val]) => setGain(val)}
          min={-12}
          max={61}
          step={1}
          disabled={isStreaming}
        />
      </div>
      
      {/* Antenna Selection */}
      <div className="space-y-2">
        <label className="technical-label">Antenna</label>
        <Select value={antenna} onValueChange={setAntenna} disabled={isStreaming}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LNAH">LNAH (High Band)</SelectItem>
            <SelectItem value="LNAL">LNAL (Low Band)</SelectItem>
            <SelectItem value="LNAW">LNAW (Wide Band)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Bandwidth */}
      <div className="space-y-2">
        <label className="technical-label">Bandwidth (MHz)</label>
        <Select
          value={bandwidth.toString()}
          onValueChange={(val) => setBandwidth(parseFloat(val))}
          disabled={isStreaming}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.5">0.5 MHz</SelectItem>
            <SelectItem value="1.0">1.0 MHz</SelectItem>
            <SelectItem value="2.0">2.0 MHz</SelectItem>
            <SelectItem value="5.0">5.0 MHz</SelectItem>
            <SelectItem value="10.0">10.0 MHz</SelectItem>
            <SelectItem value="20.0">20.0 MHz</SelectItem>
            <SelectItem value="40.0">40.0 MHz</SelectItem>
            <SelectItem value="80.0">80.0 MHz</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Stream Controls */}
      <div className="flex gap-2 pt-2">
        {!isStreaming ? (
          <Button
            onClick={handleStartStream}
            className="flex-1"
            disabled={!selectedDevice}
          >
            <Play className="w-4 h-4 mr-2" />
            Start Stream
          </Button>
        ) : (
          <>
            <Button
              onClick={() => setIsPaused(!isPaused)}
              variant="outline"
              className="flex-1"
            >
              <Pause className="w-4 h-4 mr-2" />
              {isPaused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              onClick={handleStopStream}
              variant="destructive"
              className="flex-1"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          </>
        )}
      </div>
      
      {/* Recording Controls */}
      {isStreaming && (
        <div className="flex gap-2">
          {!isRecording ? (
            <Button
              onClick={handleStartRecording}
              variant="outline"
              className="flex-1"
              disabled={isPaused}
            >
              <Circle className="w-4 h-4 mr-2 fill-red-500 text-red-500" />
              Start Recording
            </Button>
          ) : (
            <Button
              onClick={handleStopRecording}
              variant="outline"
              className="flex-1"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop Recording
            </Button>
          )}
        </div>
      )}
      
      {/* Device Info */}
      {isStreaming && (
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
          <div className="flex justify-between">
            <span>Buffer:</span>
            <span className="text-green-400">98% (Healthy)</span>
          </div>
          <div className="flex justify-between">
            <span>Latency:</span>
            <span>45 ms</span>
          </div>
          <div className="flex justify-between">
            <span>Dropped samples:</span>
            <span>0</span>
          </div>
          <div className="flex justify-between">
            <span>Board temp:</span>
            <span>42.7°C</span>
          </div>
        </div>
      )}
    </Card>
  );
}
