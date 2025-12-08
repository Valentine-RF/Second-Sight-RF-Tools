/**
 * SDR Control Panel
 * 
 * Hardware control interface for Software Defined Radio devices
 * Supports USDR, RTL-SDR, HackRF, LimeSDR, PlutoSDR, Airspy, bladeRF
 */

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Radio, 
  Play, 
  Square, 
  Circle,
  RefreshCw,
  Settings,
  Activity,
  Wifi,
  AlertCircle,
  CheckCircle,
  Loader2,
  Download,
  Upload,
  Cpu,
  HardDrive,
  Gauge,
  Waves
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import useSDRStream, { type SDRStreamConfig, type IQData, type FFTData } from '@/hooks/useSDRStream';

interface SDRDevice {
  driver: string;
  label: string;
  serial?: string;
  index: number;
  available: boolean;
  freqRange: { min: number; max: number };
  sampleRates: number[];
  gains: string[];
  antennas: string[];
}

interface SDRControlPanelProps {
  onStreamData?: (data: IQData) => void;
  onFFTData?: (fft: FFTData) => void;
  onConnect?: (device: SDRDevice) => void;
  onDisconnect?: () => void;
}

// Frequency presets for quick tuning
const FREQUENCY_PRESETS = [
  { label: 'FM Broadcast', freq: 98.1e6 },
  { label: 'Aircraft (ATC)', freq: 118.0e6 },
  { label: 'Marine VHF', freq: 156.8e6 },
  { label: 'Weather Sat', freq: 137.5e6 },
  { label: 'ISM 433', freq: 433.92e6 },
  { label: 'ISM 915', freq: 915.0e6 },
  { label: 'LTE Band 7', freq: 2620e6 },
  { label: 'WiFi 2.4G', freq: 2437e6 },
  { label: 'GPS L1', freq: 1575.42e6 },
  { label: 'ADS-B', freq: 1090e6 },
];

// Sample rate options
const SAMPLE_RATE_OPTIONS = [
  { label: '250 kHz', value: 250000 },
  { label: '1 MHz', value: 1000000 },
  { label: '2 MHz', value: 2000000 },
  { label: '4 MHz', value: 4000000 },
  { label: '8 MHz', value: 8000000 },
  { label: '10 MHz', value: 10000000 },
  { label: '20 MHz', value: 20000000 },
  { label: '40 MHz', value: 40000000 },
  { label: '56 MHz', value: 56000000 },
  { label: '80 MHz', value: 80000000 },
];

export function SDRControlPanel({
  onStreamData,
  onFFTData,
  onConnect,
  onDisconnect,
}: SDRControlPanelProps) {
  // Device state
  const [devices, setDevices] = useState<SDRDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<SDRDevice | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  
  // Configuration state
  const [config, setConfig] = useState<SDRStreamConfig>({
    deviceSerial: '',
    frequency: 98.1e6,
    sampleRate: 2000000,
    gain: 40,
    antenna: 'LNAW',
    bandwidth: 0, // Auto
  } as SDRStreamConfig);
  
  // Streaming state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingFilename, setRecordingFilename] = useState('');
  
  // Use the SDR streaming hook
  const {
    isConnected,
    isStreaming,
    stats,
    connect,
    disconnect,
    startStream,
    stopStream,
    startRecording,
    stopRecording,
    latestFFT,
  } = useSDRStream({
    onIQData: onStreamData,
    onFFTData: onFFTData,
    fftSize: 2048,
    autoReconnect: false,
  });

  // Forward FFT data
  useEffect(() => {
    if (latestFFT && onFFTData) {
      onFFTData(latestFFT as any);
    }
  }, [latestFFT, onFFTData]);

  // Enumerate devices
  const enumerateMutation = trpc.sdr.enumerateDevices.useMutation();

  const scanDevices = useCallback(async () => {
    setIsScanning(true);
    try {
      // Call tRPC endpoint to enumerate devices
      const soapyDevices = await enumerateMutation.mutateAsync();
      // Convert SoapyDevice to SDRDevice format
      const devices: SDRDevice[] = soapyDevices.map((dev, idx) => ({
        driver: dev.driver,
        label: dev.label || `${dev.driver} ${dev.serial || idx}`,
        serial: dev.serial,
        index: idx,
        available: true,
        freqRange: dev.freqRange || { min: 0, max: 6e9 },
        sampleRates: dev.sampleRateRange ? [dev.sampleRateRange.min, dev.sampleRateRange.max] : [250000, 80000000],
        gains: dev.gainRange ? [`${dev.gainRange.min}`, `${dev.gainRange.max}`] : ['0', '73'],
        antennas: dev.antennas || ['LNAH'],
      }));
      setDevices(devices);
      if (devices.length > 0) {
        toast.success(`Found ${devices.length} SDR device(s)`);
      } else {
        toast.warning('No SDR devices found. Check USB connections.');
      }
    } catch (err: any) {
      toast.error(`Device scan failed: ${err.message}`);
      // Fallback: show mock USDR for development
      setDevices([{
        driver: 'usdr',
        label: 'USDR PCIe (Mock)',
        serial: 'USDR-001',
        index: 0,
        available: true,
        freqRange: { min: 100000, max: 3800000000 },
        sampleRates: [250000, 1000000, 2000000, 4000000, 8000000, 10000000, 20000000, 40000000, 56000000, 80000000],
        gains: ['LNA', 'TIA', 'PGA'],
        antennas: ['LNAH', 'LNAL', 'LNAW'],
      }]);
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Connect to device
  const handleConnect = useCallback(async () => {
    if (!selectedDevice) {
      toast.error('Select a device first');
      return;
    }
    
    try {
      const sessionId = `session-${Date.now()}`;
      connect(sessionId);
      onConnect?.(selectedDevice);
      toast.success(`Connected to ${selectedDevice.label}`);
    } catch (err: any) {
      toast.error(`Connection failed: ${err.message}`);
    }
  }, [selectedDevice, connect, onConnect]);

  // Disconnect from device
  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      onDisconnect?.();
      toast.info('Disconnected from SDR');
    } catch (err: any) {
      toast.error(`Disconnect failed: ${err.message}`);
    }
  }, [disconnect, onDisconnect]);

  // Start/stop streaming
  const handleToggleStream = useCallback(async () => {
    if (isStreaming) {
      await stopStream();
      toast.info('Streaming stopped');
    } else {
      const sessionId = `session-${Date.now()}`;
      startStream(config, sessionId);
      toast.success('Streaming started');
    }
  }, [isStreaming, startStream, stopStream, config]);

  // Start/stop recording
  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
      setIsRecording(false);
      setRecordingDuration(0);
      toast.success('Recording stopped');
    } else {
      const filename = `capture_${Date.now()}`;
      setRecordingFilename(filename);
      await startRecording();
      setIsRecording(true);
      toast.success('Recording started');
    }
  }, [isRecording, startRecording, stopRecording]);

  // Update recording duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Apply config changes
  const handleConfigChange = useCallback((key: keyof SDRStreamConfig, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    // Note: Would need to reconnect stream with new config
  }, [config, isStreaming]);

  // Format frequency for display
  const formatFreq = (freq: number): string => {
    if (freq >= 1e9) return `${(freq / 1e9).toFixed(3)} GHz`;
    if (freq >= 1e6) return `${(freq / 1e6).toFixed(3)} MHz`;
    if (freq >= 1e3) return `${(freq / 1e3).toFixed(3)} kHz`;
    return `${freq} Hz`;
  };

  // Format duration
  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Scan on mount
  useEffect(() => {
    scanDevices();
  }, [scanDevices]);

  return (
    <div className="space-y-4">
      {/* Connection Status Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isConnected ? 'bg-green-500/20' : 'bg-gray-500/20'}`}>
              <Radio className={`w-5 h-5 ${isConnected ? 'text-green-500' : 'text-gray-500'}`} />
            </div>
            <div>
              <h3 className="font-semibold">
                {isConnected ? selectedDevice?.label || 'SDR Connected' : 'SDR Disconnected'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isConnected 
                  ? isStreaming 
                    ? `Streaming @ ${formatFreq(config.frequency)}`
                    : 'Ready to stream'
                  : 'Select and connect a device'
                }
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isConnected && (
              <Badge variant={isStreaming ? 'default' : 'secondary'}>
                {isStreaming ? 'LIVE' : 'IDLE'}
              </Badge>
            )}
            {isRecording && (
              <Badge variant="destructive" className="animate-pulse">
                <Circle className="w-2 h-2 mr-1 fill-current" />
                REC {formatDuration(recordingDuration)}
              </Badge>
            )}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="control" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="control">
            <Settings className="w-4 h-4 mr-2" />
            Control
          </TabsTrigger>
          <TabsTrigger value="tuning">
            <Waves className="w-4 h-4 mr-2" />
            Tuning
          </TabsTrigger>
          <TabsTrigger value="stats">
            <Activity className="w-4 h-4 mr-2" />
            Stats
          </TabsTrigger>
        </TabsList>

        {/* Control Tab */}
        <TabsContent value="control" className="space-y-4">
          {/* Device Selection */}
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Device</Label>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={scanDevices}
                disabled={isScanning}
              >
                {isScanning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>
            
            <Select
              value={selectedDevice?.serial || ''}
              onValueChange={(serial) => {
                const device = devices.find((d) => d.serial === serial);
                setSelectedDevice(device || null);
              }}
              disabled={isConnected}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select SDR device..." />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.serial} value={device.serial || device.index.toString()}>
                    <div className="flex items-center gap-2">
                      {device.available ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-yellow-500" />
                      )}
                      <span>{device.label}</span>
                      <span className="text-xs text-muted-foreground">({device.driver})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedDevice && (
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Range: {formatFreq(selectedDevice.freqRange.min)} - {formatFreq(selectedDevice.freqRange.max)}</div>
                <div>Antennas: {selectedDevice.antennas.join(', ')}</div>
              </div>
            )}

            {/* Connect/Disconnect Button */}
            <div className="flex gap-2">
              {!isConnected ? (
                <Button 
                  onClick={handleConnect} 
                  disabled={!selectedDevice}
                  className="flex-1"
                >
                  <Wifi className="w-4 h-4 mr-2" />
                  Connect
                </Button>
              ) : (
                <Button 
                  onClick={handleDisconnect} 
                  variant="outline"
                  className="flex-1"
                >
                  <Wifi className="w-4 h-4 mr-2" />
                  Disconnect
                </Button>
              )}
            </div>
          </Card>

          {/* Stream Controls */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Stream Control</Label>
            
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleToggleStream}
                disabled={!isConnected}
                variant={isStreaming ? 'destructive' : 'default'}
                className="w-full"
              >
                {isStreaming ? (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start
                  </>
                )}
              </Button>

              <Button
                onClick={handleToggleRecording}
                disabled={!isStreaming}
                variant={isRecording ? 'destructive' : 'secondary'}
                className="w-full"
              >
                {isRecording ? (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    Stop Rec
                  </>
                ) : (
                  <>
                    <Circle className="w-4 h-4 mr-2 fill-red-500 text-red-500" />
                    Record
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Antenna Selection */}
          {isConnected && selectedDevice && (
            <Card className="p-4 space-y-4">
              <Label className="text-sm font-medium">Antenna Port</Label>
              <div className="grid grid-cols-3 gap-2">
                {selectedDevice.antennas.map((ant) => (
                  <Button
                    key={ant}
                    variant={config.antenna === ant ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleConfigChange('antenna', ant)}
                  >
                    {ant}
                  </Button>
                ))}
              </div>
            </Card>
          )}

          {/* AGC / DC Offset / IQ Balance */}
          {isConnected && (
            <Card className="p-4 space-y-4">
              <Label className="text-sm font-medium">Signal Processing</Label>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">AGC (Auto Gain)</Label>
                  <Switch
                    checked={false}
                    disabled
                    title="AGC not available in current config"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label className="text-sm">DC Offset Correction</Label>
                  <Switch
                    checked={false}
                    disabled
                    title="Feature not available in current config"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label className="text-sm">IQ Balance Correction</Label>
                  <Switch
                    checked={false}
                    disabled
                    title="Feature not available in current config"
                  />
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Tuning Tab */}
        <TabsContent value="tuning" className="space-y-4">
          {/* Center Frequency */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Center Frequency</Label>
            
            <div className="flex gap-2">
              <Input
                type="number"
                value={config.frequency}
                onChange={(e) => handleConfigChange('frequency', parseFloat(e.target.value) || 0)}
                className="font-mono"
              />
              <span className="flex items-center text-sm text-muted-foreground">Hz</span>
            </div>
            
            <div className="text-lg font-mono text-center text-primary">
              {formatFreq(config.frequency)}
            </div>

            {/* Frequency Presets */}
            <div className="grid grid-cols-2 gap-2">
              {FREQUENCY_PRESETS.slice(0, 6).map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleConfigChange('frequency', preset.freq)}
                  className="text-xs"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </Card>

          {/* Sample Rate */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Sample Rate</Label>
            
            <Select
              value={config.sampleRate.toString()}
              onValueChange={(v) => handleConfigChange('sampleRate', parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAMPLE_RATE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value.toString()}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>

          {/* Gain Control */}
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Gain</Label>
              <span className="text-sm font-mono">{config.gain} dB</span>
            </div>
            
            <Slider
              value={[config.gain]}
              onValueChange={(v) => handleConfigChange('gain', v[0])}
              min={0}
              max={73}
              step={1}
              disabled={false}
            />
            
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0 dB</span>
              <span>73 dB</span>
            </div>
          </Card>

          {/* Bandwidth */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Bandwidth Filter</Label>
            
            <Select
              value={config.bandwidth.toString()}
              onValueChange={(v) => handleConfigChange('bandwidth', parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Auto (match sample rate)</SelectItem>
                <SelectItem value="200000">200 kHz</SelectItem>
                <SelectItem value="500000">500 kHz</SelectItem>
                <SelectItem value="1000000">1 MHz</SelectItem>
                <SelectItem value="2000000">2 MHz</SelectItem>
                <SelectItem value="4000000">4 MHz</SelectItem>
                <SelectItem value="8000000">8 MHz</SelectItem>
              </SelectContent>
            </Select>
          </Card>
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats" className="space-y-4">
          {/* Stream Statistics */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Stream Statistics</Label>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Latency</div>
                <div className="text-lg font-mono">{stats.latencyMs.toFixed(1)} ms</div>
              </div>
              
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Dropped</div>
                <div className="text-lg font-mono">{stats.droppedPackets}</div>
              </div>
              
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Buffer</div>
                <div className="text-lg font-mono">{stats.bufferLevel.toFixed(0)}%</div>
              </div>
              
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Samples/s</div>
                <div className="text-lg font-mono">
                  {(stats.samplesReceived / 1000).toFixed(2)}K
                </div>
              </div>
            </div>

            {/* Buffer Level Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Buffer Level</span>
                <span>{stats.bufferLevel.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    stats.bufferLevel > 80 ? 'bg-red-500' :
                    stats.bufferLevel > 50 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${stats.bufferLevel}%` }}
                />
              </div>
            </div>
          </Card>

          {/* Hardware Info */}
          {selectedDevice && (
            <Card className="p-4 space-y-4">
              <Label className="text-sm font-medium">Hardware Info</Label>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Driver</span>
                  <span className="font-mono">{selectedDevice.driver}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Serial</span>
                  <span className="font-mono">{selectedDevice.serial || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Freq Range</span>
                  <span className="font-mono">
                    {formatFreq(selectedDevice.freqRange.min)} - {formatFreq(selectedDevice.freqRange.max)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Sample Rate</span>
                  <span className="font-mono">
                    {formatFreq(Math.max(...selectedDevice.sampleRates))}
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Error Display */}
          {stats.lastError && (
            <Card className="p-4 border-red-500/50 bg-red-500/10">
              <div className="flex items-center gap-2 text-red-500">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{stats.lastError}</span>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SDRControlPanel;