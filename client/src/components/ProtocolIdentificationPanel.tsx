/**
 * Protocol Identification Panel
 * 
 * Automatic detection and identification of RF protocols:
 * - LTE (various bands)
 * - 5G NR
 * - WiFi (802.11a/b/g/n/ac/ax)
 * - Bluetooth/BLE
 * - LoRa/LoRaWAN
 * - Zigbee
 * - Z-Wave
 * - DECT
 * - DMR/P25/TETRA
 */

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Radio,
  Wifi,
  Smartphone,
  Bluetooth,
  Waves,
  Play,
  Download,
  Settings,
  Loader2,
  CheckCircle,
  Info,
  Zap,
  Signal,
  Database,
  Target
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface ProtocolIdentificationPanelProps {
  captureId: number;
  sampleStart?: number;
  sampleCount?: number;
  onResult?: (result: ProtocolResult) => void;
}

interface ProtocolResult {
  protocol: string;
  subtype?: string;
  confidence: number;
  frequency: number;
  bandwidth: number;
  features: ProtocolFeatures;
  decodedInfo?: Record<string, any>;
}

interface ProtocolFeatures {
  modulationType: string;
  symbolRate?: number;
  subcarriers?: number;
  spreadingFactor?: number;
  channelCoding?: string;
  duplexMode?: string;
  accessMethod?: string;
}

type ProtocolCategory = 'cellular' | 'wifi' | 'iot' | 'public_safety' | 'proprietary' | 'all';

const PROTOCOL_INFO: Record<string, { icon: React.ElementType; color: string; category: string; description: string }> = {
  'LTE': { icon: Smartphone, color: 'text-blue-500', category: 'cellular', description: '4G Long Term Evolution' },
  '5G-NR': { icon: Zap, color: 'text-purple-500', category: 'cellular', description: '5G New Radio' },
  'WiFi-6': { icon: Wifi, color: 'text-green-500', category: 'wifi', description: '802.11ax (WiFi 6)' },
  'WiFi-5': { icon: Wifi, color: 'text-green-400', category: 'wifi', description: '802.11ac (WiFi 5)' },
  'WiFi-4': { icon: Wifi, color: 'text-green-300', category: 'wifi', description: '802.11n (WiFi 4)' },
  'Bluetooth': { icon: Bluetooth, color: 'text-blue-400', category: 'iot', description: 'Classic Bluetooth' },
  'BLE': { icon: Bluetooth, color: 'text-cyan-400', category: 'iot', description: 'Bluetooth Low Energy' },
  'LoRa': { icon: Waves, color: 'text-orange-500', category: 'iot', description: 'Long Range IoT' },
  'Zigbee': { icon: Radio, color: 'text-yellow-500', category: 'iot', description: 'IEEE 802.15.4' },
  'Z-Wave': { icon: Radio, color: 'text-indigo-500', category: 'iot', description: 'Home automation' },
  'DECT': { icon: Smartphone, color: 'text-pink-500', category: 'proprietary', description: 'Digital cordless phone' },
  'DMR': { icon: Radio, color: 'text-red-500', category: 'public_safety', description: 'Digital Mobile Radio' },
  'P25': { icon: Radio, color: 'text-red-400', category: 'public_safety', description: 'APCO Project 25' },
  'TETRA': { icon: Radio, color: 'text-red-600', category: 'public_safety', description: 'Terrestrial Trunked Radio' },
};

const CATEGORY_INFO: Record<ProtocolCategory, { name: string; protocols: string[] }> = {
  cellular: { name: 'Cellular', protocols: ['LTE', '5G-NR'] },
  wifi: { name: 'WiFi', protocols: ['WiFi-6', 'WiFi-5', 'WiFi-4'] },
  iot: { name: 'IoT', protocols: ['Bluetooth', 'BLE', 'LoRa', 'Zigbee', 'Z-Wave'] },
  public_safety: { name: 'Public Safety', protocols: ['DMR', 'P25', 'TETRA'] },
  proprietary: { name: 'Proprietary', protocols: ['DECT'] },
  all: { name: 'All Protocols', protocols: Object.keys(PROTOCOL_INFO) },
};

export function ProtocolIdentificationPanel({
  captureId,
  sampleStart = 0,
  sampleCount = 65536,
  onResult,
}: ProtocolIdentificationPanelProps) {
  // Detection parameters
  const [category, setCategory] = useState<ProtocolCategory>('all');
  const [minConfidence, setMinConfidence] = useState(0.7);
  const [useDeepFeatures, setUseDeepFeatures] = useState(true);
  const [attemptDecode, setAttemptDecode] = useState(false);
  
  // Results
  const [results, setResults] = useState<ProtocolResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedResult, setSelectedResult] = useState<ProtocolResult | null>(null);

  // tRPC mutation
  const detectMutation = trpc.advancedAnalysis.identifyProtocol.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      if (data.results.length > 0) {
        setSelectedResult(data.results[0]);
        onResult?.(data.results[0]);
        toast.success(`Identified: ${data.results[0].protocol} (${(data.results[0].confidence * 100).toFixed(0)}%)`);
      } else {
        toast.info('No protocols identified above confidence threshold');
      }
    },
    onError: (error) => {
      toast.error(`Detection failed: ${error.message}`);
    },
  });

  // Run detection
  const runDetection = useCallback(async () => {
    setIsProcessing(true);
    setProgress(0);
    
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 5, 90));
    }, 150);

    try {
      await detectMutation.mutateAsync({
        captureId,
        sampleStart,
        sampleCount,
        protocols: CATEGORY_INFO[category].protocols,
        minConfidence,
        useDeepFeatures,
        attemptDecode,
      });
      setProgress(100);
    } finally {
      clearInterval(progressInterval);
      setIsProcessing(false);
    }
  }, [captureId, sampleStart, sampleCount, category, minConfidence, useDeepFeatures, attemptDecode, detectMutation]);

  // Export results
  const exportResults = useCallback(() => {
    const data = {
      results,
      parameters: { category, minConfidence, useDeepFeatures, attemptDecode },
      captureId,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `protocol_id_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Results exported');
  }, [results, category, minConfidence, useDeepFeatures, attemptDecode, captureId]);

  // Get protocol icon
  const getProtocolIcon = (protocol: string) => {
    const info = PROTOCOL_INFO[protocol];
    if (!info) return <Radio className="w-5 h-5" />;
    const Icon: any = info.icon;
    const iconClassName = `w-5 h-5 ${info.color}`;
    return <Icon className={iconClassName} />;
  };

  // Format bandwidth
  const formatBandwidth = (bw: number): string => {
    if (bw >= 1e6) return `${(bw / 1e6).toFixed(1)} MHz`;
    if (bw >= 1e3) return `${(bw / 1e3).toFixed(1)} kHz`;
    return `${bw} Hz`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-cyan-500/20">
              <Signal className="w-5 h-5 text-cyan-500" />
            </div>
            <div>
              <h3 className="font-semibold">Protocol Identification</h3>
              <p className="text-sm text-muted-foreground">
                Automatic RF protocol detection and classification
              </p>
            </div>
          </div>
          
          {results.length > 0 && (
            <Badge variant="outline" className="text-green-500 border-green-500">
              <CheckCircle className="w-3 h-3 mr-1" />
              {results.length} identified
            </Badge>
          )}
        </div>
      </Card>

      <Tabs defaultValue="config" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="config">
            <Settings className="w-4 h-4 mr-2" />
            Config
          </TabsTrigger>
          <TabsTrigger value="results">
            <Target className="w-4 h-4 mr-2" />
            Results
          </TabsTrigger>
          <TabsTrigger value="details">
            <Database className="w-4 h-4 mr-2" />
            Details
          </TabsTrigger>
        </TabsList>

        {/* Config Tab */}
        <TabsContent value="config" className="space-y-4">
          {/* Category Selection */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Protocol Category</Label>
            
            <Select value={category} onValueChange={(v) => setCategory(v as ProtocolCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex flex-col">
                      <span>{info.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {info.protocols.length} protocols
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Protocol list for selected category */}
            <div className="flex flex-wrap gap-2 mt-2">
              {CATEGORY_INFO[category].protocols.map((proto) => {
                const info = PROTOCOL_INFO[proto];
                const Icon: any = info?.icon || Radio;
                const iconClassName = `w-3 h-3 mr-1 ${info?.color || ''}`;
                return (
                  <Badge key={proto} variant="outline" className="text-xs">
                    <Icon className={iconClassName} />
                    {proto}
                  </Badge>
                );
              })}
            </div>
          </Card>

          {/* Parameters */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Parameters</Label>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Minimum Confidence</Label>
                  <span className="font-mono text-sm">{(minConfidence * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[minConfidence]}
                  onValueChange={(v) => setMinConfidence(v[0])}
                  min={0.3}
                  max={0.99}
                  step={0.01}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Deep Feature Extraction</Label>
                    <Info className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <Switch checked={useDeepFeatures} onCheckedChange={setUseDeepFeatures} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Uses CNN-based feature extraction for higher accuracy (slower)
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Attempt Decode</Label>
                    <Info className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <Switch checked={attemptDecode} onCheckedChange={setAttemptDecode} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Try to decode protocol-specific information (cell ID, SSID, etc.)
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Results Tab */}
        <TabsContent value="results" className="space-y-4">
          {results.length > 0 ? (
            <ScrollArea className="h-96">
              <div className="space-y-3 pr-4">
                {results.map((result, idx) => {
                  const info = PROTOCOL_INFO[result.protocol];
                  const isSelected = selectedResult === result;
                  return (
                    <Card
                      key={idx}
                      className={`p-4 cursor-pointer transition-all ${
                        isSelected ? 'ring-2 ring-primary' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedResult(result)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {getProtocolIcon(result.protocol)}
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{result.protocol}</h4>
                              {result.subtype && (
                                <Badge variant="outline" className="text-xs">
                                  {result.subtype}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {info?.description || 'Unknown protocol'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-lg font-bold text-primary">
                            {(result.confidence * 100).toFixed(0)}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            confidence
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2 rounded bg-muted/50">
                          <div className="text-muted-foreground">Frequency</div>
                          <div className="font-mono">{(result.frequency / 1e6).toFixed(2)} MHz</div>
                        </div>
                        <div className="p-2 rounded bg-muted/50">
                          <div className="text-muted-foreground">Bandwidth</div>
                          <div className="font-mono">{formatBandwidth(result.bandwidth)}</div>
                        </div>
                        <div className="p-2 rounded bg-muted/50">
                          <div className="text-muted-foreground">Modulation</div>
                          <div className="font-mono">{result.features.modulationType}</div>
                        </div>
                      </div>

                      {/* Confidence bar */}
                      <div className="mt-3">
                        <Progress value={result.confidence * 100} className="h-1" />
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <Card className="p-8 text-center">
              <Signal className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium mb-2">No Protocols Identified</h3>
              <p className="text-sm text-muted-foreground">
                Run detection to identify RF protocols in the signal
              </p>
            </Card>
          )}
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4">
          {selectedResult ? (
            <>
              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getProtocolIcon(selectedResult.protocol)}
                    <Label className="text-sm font-medium">{selectedResult.protocol} Features</Label>
                  </div>
                  <Button variant="ghost" size="sm" onClick={exportResults}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Modulation Type</div>
                    <div className="font-mono">{selectedResult.features.modulationType}</div>
                  </div>
                  
                  {selectedResult.features.symbolRate && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Symbol Rate</div>
                      <div className="font-mono">
                        {(selectedResult.features.symbolRate / 1e3).toFixed(2)} ksps
                      </div>
                    </div>
                  )}
                  
                  {selectedResult.features.subcarriers && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Subcarriers</div>
                      <div className="font-mono">{selectedResult.features.subcarriers}</div>
                    </div>
                  )}
                  
                  {selectedResult.features.spreadingFactor && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Spreading Factor</div>
                      <div className="font-mono">SF{selectedResult.features.spreadingFactor}</div>
                    </div>
                  )}
                  
                  {selectedResult.features.channelCoding && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Channel Coding</div>
                      <div className="font-mono">{selectedResult.features.channelCoding}</div>
                    </div>
                  )}
                  
                  {selectedResult.features.duplexMode && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Duplex Mode</div>
                      <div className="font-mono">{selectedResult.features.duplexMode}</div>
                    </div>
                  )}
                  
                  {selectedResult.features.accessMethod && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Access Method</div>
                      <div className="font-mono">{selectedResult.features.accessMethod}</div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Decoded Info */}
              {selectedResult.decodedInfo && Object.keys(selectedResult.decodedInfo).length > 0 && (
                <Card className="p-4 space-y-4">
                  <Label className="text-sm font-medium">Decoded Information</Label>
                  
                  <div className="space-y-2">
                    {Object.entries(selectedResult.decodedInfo).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{key}</span>
                        <span className="font-mono">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Protocol Reference */}
              <Card className="p-4 space-y-4">
                <Label className="text-sm font-medium">Protocol Reference</Label>
                
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  {PROTOCOL_INFO[selectedResult.protocol]?.description || 'No additional information available'}
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-8 text-center">
              <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium mb-2">No Protocol Selected</h3>
              <p className="text-sm text-muted-foreground">
                Select a result to view detailed features
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Progress Bar */}
      {isProcessing && (
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Analyzing protocols...</span>
            <span className="text-sm text-muted-foreground ml-auto">{progress}%</span>
          </div>
          <Progress value={progress} />
        </Card>
      )}

      {/* Run Button */}
      <Button
        onClick={runDetection}
        disabled={isProcessing}
        className="w-full"
        size="lg"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Play className="w-4 h-4 mr-2" />
            Identify Protocols
          </>
        )}
      </Button>
    </div>
  );
}

export default ProtocolIdentificationPanel;