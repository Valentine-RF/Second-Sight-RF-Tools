import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Play, Square, Radio } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface SDRDevice {
  driver: string;
  hardware: string;
  serial: string;
  label: string;
  freqRange: { min: number; max: number };
  sampleRateRange: { min: number; max: number };
  gainRange: { min: number; max: number };
}

interface SDRControlsProps {
  onSessionStart: (sessionId: string) => void;
  onSessionStop: () => void;
  isStreaming: boolean;
}

/**
 * SDR device control panel with frequency, gain, and sample rate controls
 */
export const SDRControls: React.FC<SDRControlsProps> = ({
  onSessionStart,
  onSessionStop,
  isStreaming,
}) => {
  const [devices, setDevices] = useState<SDRDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [centerFreqMHz, setCenterFreqMHz] = useState('100.0');
  const [sampleRateMHz, setSampleRateMHz] = useState('2.4');
  const [gainDb, setGainDb] = useState('20');
  const [recording, setRecording] = useState(false);
  
  // Enumerate devices on mount
  const enumerateDevices = trpc.sdr.enumerateDevices.useMutation({
    onSuccess: (data) => {
      setDevices(data.devices);
      if (data.devices.length > 0) {
        setSelectedDevice(data.devices[0].driver);
      }
    },
    onError: (error) => {
      console.error('[SDRControls] Failed to enumerate devices:', error);
    },
  });
  
  // Start streaming session
  const startSession = trpc.sdr.startSession.useMutation({
    onSuccess: (data) => {
      console.log('[SDRControls] Session started:', data.sessionId);
      onSessionStart(data.sessionId);
    },
    onError: (error) => {
      console.error('[SDRControls] Failed to start session:', error);
    },
  });
  
  // Stop streaming session
  const stopSession = trpc.sdr.stopSession.useMutation({
    onSuccess: (data) => {
      console.log('[SDRControls] Session stopped');
      if (data.metaUrl) {
        console.log('[SDRControls] Recording saved:', data.metaUrl);
      }
      onSessionStop();
    },
    onError: (error) => {
      console.error('[SDRControls] Failed to stop session:', error);
    },
  });
  
  useEffect(() => {
    enumerateDevices.mutate();
  }, []);
  
  const handleStart = () => {
    if (!selectedDevice) {
      alert('Please select a device');
      return;
    }
    
    const centerFreqHz = parseFloat(centerFreqMHz) * 1e6;
    const sampleRateHz = parseFloat(sampleRateMHz) * 1e6;
    const gain = parseFloat(gainDb);
    
    if (isNaN(centerFreqHz) || isNaN(sampleRateHz) || isNaN(gain)) {
      alert('Invalid parameters');
      return;
    }
    
    startSession.mutate({
      deviceDriver: selectedDevice,
      centerFreqHz,
      sampleRateHz,
      gainDb: gain,
      recording,
    });
  };
  
  const handleStop = () => {
    stopSession.mutate();
  };
  
  const selectedDeviceInfo = devices.find(d => d.driver === selectedDevice);
  
  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Radio className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">SDR Device Control</h3>
      </div>
      
      {/* Device selector */}
      <div className="space-y-2">
        <Label>Device</Label>
        <Select
          value={selectedDevice}
          onValueChange={setSelectedDevice}
          disabled={isStreaming}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select device..." />
          </SelectTrigger>
          <SelectContent>
            {devices.map(device => (
              <SelectItem key={device.serial} value={device.driver}>
                {device.label} ({device.hardware})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {selectedDeviceInfo && (
          <div className="text-xs text-muted-foreground">
            <div>Freq: {(selectedDeviceInfo.freqRange.min / 1e6).toFixed(1)} - {(selectedDeviceInfo.freqRange.max / 1e6).toFixed(1)} MHz</div>
            <div>Rate: {(selectedDeviceInfo.sampleRateRange.min / 1e6).toFixed(2)} - {(selectedDeviceInfo.sampleRateRange.max / 1e6).toFixed(2)} MS/s</div>
            <div>Gain: {selectedDeviceInfo.gainRange.min} - {selectedDeviceInfo.gainRange.max} dB</div>
          </div>
        )}
      </div>
      
      {/* Center frequency */}
      <div className="space-y-2">
        <Label>Center Frequency (MHz)</Label>
        <Input
          type="number"
          step="0.1"
          value={centerFreqMHz}
          onChange={(e) => setCenterFreqMHz(e.target.value)}
          disabled={isStreaming}
          placeholder="100.0"
        />
      </div>
      
      {/* Sample rate */}
      <div className="space-y-2">
        <Label>Sample Rate (MS/s)</Label>
        <Select
          value={sampleRateMHz}
          onValueChange={setSampleRateMHz}
          disabled={isStreaming}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.25">0.25 MS/s</SelectItem>
            <SelectItem value="1.0">1.0 MS/s</SelectItem>
            <SelectItem value="2.0">2.0 MS/s</SelectItem>
            <SelectItem value="2.4">2.4 MS/s</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Gain */}
      <div className="space-y-2">
        <Label>Gain (dB)</Label>
        <Input
          type="number"
          step="0.1"
          value={gainDb}
          onChange={(e) => setGainDb(e.target.value)}
          disabled={isStreaming}
          placeholder="20"
        />
      </div>
      
      {/* Recording toggle */}
      <div className="flex items-center justify-between">
        <Label>Record to File</Label>
        <Switch
          checked={recording}
          onCheckedChange={setRecording}
          disabled={isStreaming}
        />
      </div>
      
      {recording && (
        <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
          Recording will be saved as SigMF format (.sigmf-meta + .sigmf-data)
        </div>
      )}
      
      {/* Start/Stop button */}
      <Button
        onClick={isStreaming ? handleStop : handleStart}
        disabled={startSession.isPending || stopSession.isPending}
        className="w-full"
        variant={isStreaming ? 'destructive' : 'default'}
      >
        {isStreaming ? (
          <>
            <Square className="w-4 h-4 mr-2" />
            Stop Streaming
          </>
        ) : (
          <>
            <Play className="w-4 h-4 mr-2" />
            Start Streaming
          </>
        )}
      </Button>
      
      {isStreaming && (
        <div className="flex items-center gap-2 text-sm text-green-500">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Streaming active
        </div>
      )}
    </Card>
  );
};
