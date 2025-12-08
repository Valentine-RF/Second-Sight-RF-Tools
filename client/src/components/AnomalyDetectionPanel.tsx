/**
 * Anomaly Detection Panel
 * 
 * LSTM autoencoder-based RF anomaly detection for threats like:
 * - GPS spoofing
 * - IMSI catchers (Stingrays)
 * - Rogue access points
 * - Jamming attacks
 * - Unauthorized transmitters
 */

import { useState, useCallback, useEffect } from 'react';
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
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Play,
  Download,
  Settings,
  Activity,
  Loader2,
  Radio,
  Wifi,
  Smartphone,
  Satellite,
  Zap,
  Clock,
  Target,
  Eye,
  Bell,
  BellOff
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface AnomalyDetectionPanelProps {
  captureId: number;
  onAnomaly?: (anomaly: Anomaly) => void;
  onThreat?: (threat: ThreatAlert) => void;
}

interface Anomaly {
  id: string;
  timestamp: number;
  sampleStart: number;
  sampleCount: number;
  freqStart: number;
  freqEnd: number;
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  reconstructionError: number;
  description: string;
  features?: Record<string, number>;
}

interface ThreatAlert {
  id: string;
  timestamp: number;
  type: ThreatType;
  severity: 'warning' | 'threat' | 'critical';
  confidence: number;
  location?: { latitude: number; longitude: number };
  description: string;
  indicators: string[];
  recommendation: string;
}

type AnomalyType = 
  | 'spectral_outlier'
  | 'power_anomaly'
  | 'timing_anomaly'
  | 'modulation_anomaly'
  | 'bandwidth_anomaly'
  | 'interference'
  | 'unknown';

type ThreatType =
  | 'gps_spoofing'
  | 'imsi_catcher'
  | 'rogue_ap'
  | 'jamming'
  | 'drone'
  | 'unauthorized_tx'
  | 'replay_attack'
  | 'unknown';

type ModelType = 'lstm_ae' | 'vae' | 'isolation_forest' | 'one_class_svm' | 'ensemble';

const THREAT_INFO: Record<ThreatType, { icon: React.ElementType; color: string; name: string }> = {
  gps_spoofing: { icon: Satellite, color: 'text-red-500', name: 'GPS Spoofing' },
  imsi_catcher: { icon: Smartphone, color: 'text-orange-500', name: 'IMSI Catcher' },
  rogue_ap: { icon: Wifi, color: 'text-yellow-500', name: 'Rogue AP' },
  jamming: { icon: Zap, color: 'text-red-600', name: 'Jamming Attack' },
  drone: { icon: Radio, color: 'text-purple-500', name: 'Drone Detection' },
  unauthorized_tx: { icon: AlertTriangle, color: 'text-orange-400', name: 'Unauthorized TX' },
  replay_attack: { icon: Clock, color: 'text-blue-500', name: 'Replay Attack' },
  unknown: { icon: Target, color: 'text-gray-500', name: 'Unknown Threat' },
};

const SEVERITY_COLORS = {
  low: 'bg-blue-500/20 text-blue-500 border-blue-500/50',
  medium: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50',
  high: 'bg-orange-500/20 text-orange-500 border-orange-500/50',
  critical: 'bg-red-500/20 text-red-500 border-red-500/50 animate-pulse',
  warning: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50',
  threat: 'bg-orange-500/20 text-orange-500 border-orange-500/50',
};

export function AnomalyDetectionPanel({
  captureId,
  onAnomaly,
  onThreat,
}: AnomalyDetectionPanelProps) {
  // Detection parameters
  const [model, setModel] = useState<ModelType>('lstm_ae');
  const [threshold, setThreshold] = useState(2.5); // Standard deviations
  const [windowSize, setWindowSize] = useState(1024);
  const [hopSize, setHopSize] = useState(256);
  const [minAnomalyDuration, setMinAnomalyDuration] = useState(10); // samples
  
  // Threat detection toggles
  const [detectGPS, setDetectGPS] = useState(true);
  const [detectIMSI, setDetectIMSI] = useState(true);
  const [detectRogueAP, setDetectRogueAP] = useState(true);
  const [detectJamming, setDetectJamming] = useState(true);
  const [detectDrone, setDetectDrone] = useState(true);
  
  // Real-time monitoring
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  
  // Results
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [threats, setThreats] = useState<ThreatAlert[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({
    totalScanned: 0,
    anomaliesFound: 0,
    threatsDetected: 0,
    avgReconstructionError: 0,
  });

  // tRPC mutations
  const detectMutation = trpc.advancedAnalysis.detectAnomalies.useMutation({
    onSuccess: (data) => {
      setAnomalies(data.anomalies);
      setThreats(data.threats);
      setStats(data.stats);
      
      if (data.threats.length > 0 && alertsEnabled) {
        data.threats.forEach((t: ThreatAlert) => {
          onThreat?.(t);
          toast.error(`Threat detected: ${THREAT_INFO[t.type].name}`, {
            description: t.description,
          });
        });
      }
      
      if (data.anomalies.length > 0) {
        data.anomalies.forEach((a: Anomaly) => onAnomaly?.(a));
        toast.warning(`${data.anomalies.length} anomalies detected`);
      } else {
        toast.success('Scan complete: No anomalies detected');
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
      setProgress((p) => Math.min(p + 3, 95));
    }, 100);

    try {
      await detectMutation.mutateAsync({
        captureId,
        model,
        threshold,
        windowSize,
        hopSize,
        minAnomalyDuration,
        threatTypes: {
          gps_spoofing: detectGPS,
          imsi_catcher: detectIMSI,
          rogue_ap: detectRogueAP,
          jamming: detectJamming,
          drone: detectDrone,
        },
      });
      setProgress(100);
    } finally {
      clearInterval(progressInterval);
      setIsProcessing(false);
    }
  }, [
    captureId, model, threshold, windowSize, hopSize, minAnomalyDuration,
    detectGPS, detectIMSI, detectRogueAP, detectJamming, detectDrone, detectMutation
  ]);

  // Export results
  const exportResults = useCallback(() => {
    const data = {
      anomalies,
      threats,
      stats,
      parameters: { model, threshold, windowSize, hopSize },
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anomaly_report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  }, [anomalies, threats, stats, model, threshold, windowSize, hopSize]);

  // Get severity icon
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <ShieldAlert className="w-5 h-5 text-red-500" />;
      case 'high':
      case 'threat':
        return <Shield className="w-5 h-5 text-orange-500" />;
      case 'medium':
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default:
        return <ShieldCheck className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${threats.length > 0 ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
              {threats.length > 0 ? (
                <ShieldAlert className="w-5 h-5 text-red-500" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-green-500" />
              )}
            </div>
            <div>
              <h3 className="font-semibold">Anomaly Detection</h3>
              <p className="text-sm text-muted-foreground">
                {isMonitoring ? 'Real-time monitoring active' : 'LSTM autoencoder threat detection'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAlertsEnabled(!alertsEnabled)}
            >
              {alertsEnabled ? (
                <Bell className="w-4 h-4" />
              ) : (
                <BellOff className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
            
            {threats.length > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {threats.length} Threats
              </Badge>
            )}
            {anomalies.length > 0 && (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500">
                {anomalies.length} Anomalies
              </Badge>
            )}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="detection" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="detection">
            <Settings className="w-4 h-4 mr-2" />
            Detection
          </TabsTrigger>
          <TabsTrigger value="threats">
            <ShieldAlert className="w-4 h-4 mr-2" />
            Threats
          </TabsTrigger>
          <TabsTrigger value="anomalies">
            <Activity className="w-4 h-4 mr-2" />
            Anomalies
          </TabsTrigger>
          <TabsTrigger value="stats">
            <Eye className="w-4 h-4 mr-2" />
            Stats
          </TabsTrigger>
        </TabsList>

        {/* Detection Tab */}
        <TabsContent value="detection" className="space-y-4">
          {/* Model Selection */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Detection Model</Label>
            
            <Select value={model} onValueChange={(v) => setModel(v as ModelType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lstm_ae">
                  <div className="flex flex-col">
                    <span>LSTM Autoencoder</span>
                    <span className="text-xs text-muted-foreground">Best for time-series anomalies</span>
                  </div>
                </SelectItem>
                <SelectItem value="vae">
                  <div className="flex flex-col">
                    <span>Variational Autoencoder</span>
                    <span className="text-xs text-muted-foreground">Probabilistic detection</span>
                  </div>
                </SelectItem>
                <SelectItem value="isolation_forest">
                  <div className="flex flex-col">
                    <span>Isolation Forest</span>
                    <span className="text-xs text-muted-foreground">Fast, good for high-dim data</span>
                  </div>
                </SelectItem>
                <SelectItem value="one_class_svm">
                  <div className="flex flex-col">
                    <span>One-Class SVM</span>
                    <span className="text-xs text-muted-foreground">Boundary-based detection</span>
                  </div>
                </SelectItem>
                <SelectItem value="ensemble">
                  <div className="flex flex-col">
                    <span>Ensemble (All Models)</span>
                    <span className="text-xs text-muted-foreground">Highest accuracy, slower</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </Card>

          {/* Parameters */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Parameters</Label>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Detection Threshold (σ)</Label>
                  <span className="font-mono text-sm">{threshold.toFixed(1)}</span>
                </div>
                <Slider
                  value={[threshold]}
                  onValueChange={(v) => setThreshold(v[0])}
                  min={1.0}
                  max={5.0}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground">
                  Lower = more sensitive, higher = fewer false positives
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Window Size</Label>
                  <span className="font-mono text-sm">{windowSize}</span>
                </div>
                <Slider
                  value={[windowSize]}
                  onValueChange={(v) => setWindowSize(v[0])}
                  min={256}
                  max={4096}
                  step={256}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Hop Size</Label>
                  <span className="font-mono text-sm">{hopSize}</span>
                </div>
                <Slider
                  value={[hopSize]}
                  onValueChange={(v) => setHopSize(v[0])}
                  min={64}
                  max={1024}
                  step={64}
                />
              </div>
            </div>
          </Card>

          {/* Threat Types */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Threat Detection</Label>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Satellite className="w-4 h-4 text-red-500" />
                  <Label className="text-sm">GPS Spoofing</Label>
                </div>
                <Switch checked={detectGPS} onCheckedChange={setDetectGPS} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-orange-500" />
                  <Label className="text-sm">IMSI Catcher</Label>
                </div>
                <Switch checked={detectIMSI} onCheckedChange={setDetectIMSI} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-yellow-500" />
                  <Label className="text-sm">Rogue Access Point</Label>
                </div>
                <Switch checked={detectRogueAP} onCheckedChange={setDetectRogueAP} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-red-600" />
                  <Label className="text-sm">Jamming Attack</Label>
                </div>
                <Switch checked={detectJamming} onCheckedChange={setDetectJamming} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-purple-500" />
                  <Label className="text-sm">Drone Detection</Label>
                </div>
                <Switch checked={detectDrone} onCheckedChange={setDetectDrone} />
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Threats Tab */}
        <TabsContent value="threats" className="space-y-4">
          {threats.length > 0 ? (
            <ScrollArea className="h-96">
              <div className="space-y-3 pr-4">
                {threats.map((threat) => {
                  const info = THREAT_INFO[threat.type];
                  const Icon: any = info.icon;
                  const iconClassName = `w-6 h-6 ${info.color} mt-0.5`;
                  return (
                    <Card key={threat.id} className={`p-4 border ${SEVERITY_COLORS[threat.severity]}`}>
                      <div className="flex items-start gap-3">
                        <Icon className={iconClassName} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold">{info.name}</h4>
                            <Badge variant="outline" className={SEVERITY_COLORS[threat.severity]}>
                              {threat.severity.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {threat.description}
                          </p>
                          
                          <div className="mt-3 space-y-2">
                            <div>
                              <span className="text-xs font-medium">Indicators:</span>
                              <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                                {threat.indicators.map((ind, i) => (
                                  <li key={i}>{ind}</li>
                                ))}
                              </ul>
                            </div>
                            
                            <div className="p-2 rounded bg-muted/50 text-xs">
                              <span className="font-medium">Recommendation: </span>
                              {threat.recommendation}
                            </div>
                          </div>

                          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Confidence: {(threat.confidence * 100).toFixed(0)}%</span>
                            <span>{new Date(threat.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <Card className="p-8 text-center">
              <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <h3 className="font-medium mb-2">No Threats Detected</h3>
              <p className="text-sm text-muted-foreground">
                Run detection to scan for RF threats
              </p>
            </Card>
          )}
        </TabsContent>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies" className="space-y-4">
          {anomalies.length > 0 ? (
            <ScrollArea className="h-96">
              <div className="space-y-2 pr-4">
                {anomalies.map((anomaly) => (
                  <Card key={anomaly.id} className={`p-3 border ${SEVERITY_COLORS[anomaly.severity]}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(anomaly.severity)}
                        <div>
                          <span className="font-medium capitalize">
                            {anomaly.type.replace('_', ' ')}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {anomaly.description}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="font-mono">
                          Error: {anomaly.reconstructionError.toFixed(3)}
                        </div>
                        <div className="text-muted-foreground">
                          Conf: {(anomaly.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Samples {anomaly.sampleStart.toLocaleString()} - {(anomaly.sampleStart + anomaly.sampleCount).toLocaleString()} | 
                      {(anomaly.freqStart / 1e6).toFixed(2)} - {(anomaly.freqEnd / 1e6).toFixed(2)} MHz
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <Card className="p-8 text-center">
              <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium mb-2">No Anomalies Detected</h3>
              <p className="text-sm text-muted-foreground">
                Signal appears normal within threshold parameters
              </p>
            </Card>
          )}
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats" className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Detection Summary</Label>
              {(anomalies.length > 0 || threats.length > 0) && (
                <Button variant="ghost" size="sm" onClick={exportResults}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Report
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <div className="text-3xl font-bold">{stats.totalScanned.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Samples Scanned</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <div className="text-3xl font-bold text-yellow-500">{stats.anomaliesFound}</div>
                <div className="text-xs text-muted-foreground">Anomalies Found</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <div className="text-3xl font-bold text-red-500">{stats.threatsDetected}</div>
                <div className="text-xs text-muted-foreground">Threats Detected</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <div className="text-3xl font-bold">{stats.avgReconstructionError.toFixed(3)}</div>
                <div className="text-xs text-muted-foreground">Avg Recon Error</div>
              </div>
            </div>
          </Card>

          {/* Reconstruction Error Distribution */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Reconstruction Error Distribution</Label>
            <div className="h-48 rounded-lg bg-muted/50 flex items-center justify-center">
              <Activity className="w-8 h-8 text-muted-foreground" />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Progress Bar */}
      {isProcessing && (
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Running {model.replace('_', ' ').toUpperCase()} detection...</span>
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
            Scanning...
          </>
        ) : (
          <>
            <Play className="w-4 h-4 mr-2" />
            Run Anomaly Detection
          </>
        )}
      </Button>
    </div>
  );
}

export default AnomalyDetectionPanel;