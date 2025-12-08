/**
 * Geolocation Panel
 * 
 * RF emitter localization using TDOA, AOA, RSS, and hybrid fusion
 * Integrates with multiple sensor positions for triangulation
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  MapPin,
  Navigation,
  Radio,
  Plus,
  Trash2,
  Play,
  Download,
  Target,
  Loader2,
  Settings,
  Crosshair,
  Radar,
  SignalHigh,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface GeolocationPanelProps {
  captureId: number;
  onResult?: (result: GeolocationResult) => void;
}

interface SensorPosition {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp?: number;
  rssi?: number;
  aoa?: number; // degrees
  tdoa?: number; // seconds relative to reference
}

interface GeolocationResult {
  method: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  cep50: number; // Circular Error Probable 50%
  cep90: number;
  confidence: number;
  computeTime: number;
  residuals: number[];
  ellipse?: {
    semiMajor: number;
    semiMinor: number;
    orientation: number;
  };
}

type Method = 'TDOA' | 'AOA' | 'RSS' | 'Hybrid';

const METHOD_INFO: Record<Method, { name: string; minSensors: number; description: string }> = {
  TDOA: {
    name: 'Time Difference of Arrival',
    minSensors: 3,
    description: 'Hyperbolic positioning using time differences between sensor pairs',
  },
  AOA: {
    name: 'Angle of Arrival',
    minSensors: 2,
    description: 'Triangulation using bearing measurements from directional antennas',
  },
  RSS: {
    name: 'Received Signal Strength',
    minSensors: 3,
    description: 'Position estimation using path loss model and RSSI measurements',
  },
  Hybrid: {
    name: 'Hybrid Fusion',
    minSensors: 2,
    description: 'Extended Kalman Filter fusion of TDOA, AOA, and RSS measurements',
  },
};

// Default sensor positions (example: distributed around SF Bay Area)
const DEFAULT_SENSORS: SensorPosition[] = [
  { id: '1', name: 'Sensor 1', latitude: 37.7749, longitude: -122.4194, altitude: 50 },
  { id: '2', name: 'Sensor 2', latitude: 37.8044, longitude: -122.2712, altitude: 45 },
  { id: '3', name: 'Sensor 3', latitude: 37.6879, longitude: -122.4702, altitude: 55 },
];

export function GeolocationPanel({
  captureId,
  onResult,
}: GeolocationPanelProps) {
  // Method and parameters
  const [method, setMethod] = useState<Method>('TDOA');
  const [sensors, setSensors] = useState<SensorPosition[]>(DEFAULT_SENSORS);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  
  // Path loss model parameters (for RSS)
  const [pathLossExponent, setPathLossExponent] = useState(2.5);
  const [referenceDistance, setReferenceDistance] = useState(1.0);
  const [referenceRSSI, setReferenceRSSI] = useState(-40);
  
  // Algorithm parameters
  const [maxIterations, setMaxIterations] = useState(100);
  const [convergenceThreshold, setConvergenceThreshold] = useState(0.001);
  const [useKalmanFilter, setUseKalmanFilter] = useState(true);
  
  // Results
  const [result, setResult] = useState<GeolocationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<GeolocationResult[]>([]);

  // Map ref for future map integration
  const mapRef = useRef<HTMLDivElement>(null);

  // tRPC mutation
  const geoMutation = trpc.advancedAnalysis.geolocate.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setHistory((h) => [data, ...h].slice(0, 10));
      onResult?.(data);
      toast.success(`Location estimated: ${data.latitude.toFixed(4)}°, ${data.longitude.toFixed(4)}°`);
    },
    onError: (error) => {
      toast.error(`Geolocation failed: ${error.message}`);
    },
  });

  // Add sensor
  const addSensor = useCallback(() => {
    const newId = (sensors.length + 1).toString();
    setSensors([
      ...sensors,
      {
        id: newId,
        name: `Sensor ${newId}`,
        latitude: 37.75,
        longitude: -122.40,
        altitude: 50,
      },
    ]);
  }, [sensors]);

  // Remove sensor
  const removeSensor = useCallback((id: string) => {
    if (sensors.length <= METHOD_INFO[method].minSensors) {
      toast.error(`${method} requires at least ${METHOD_INFO[method].minSensors} sensors`);
      return;
    }
    setSensors(sensors.filter((s) => s.id !== id));
  }, [sensors, method]);

  // Update sensor
  const updateSensor = useCallback((id: string, updates: Partial<SensorPosition>) => {
    setSensors(sensors.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, [sensors]);

  // Run geolocation
  const runGeolocation = useCallback(async () => {
    if (sensors.length < METHOD_INFO[method].minSensors) {
      toast.error(`${method} requires at least ${METHOD_INFO[method].minSensors} sensors`);
      return;
    }

    setIsProcessing(true);
    try {
      await geoMutation.mutateAsync({
        captureId,
        method,
        sensors: sensors.map((s) => ({
          latitude: s.latitude,
          longitude: s.longitude,
          altitude: s.altitude,
          timestamp: s.timestamp,
          rssi: s.rssi,
          aoa: s.aoa,
          tdoa: s.tdoa,
        })),
        pathLossModel: method === 'RSS' || method === 'Hybrid' ? {
          exponent: pathLossExponent,
          referenceDistance,
          referenceRSSI,
        } : undefined,
        maxIterations,
        convergenceThreshold,
        useKalmanFilter,
      });
    } finally {
      setIsProcessing(false);
    }
  }, [
    captureId, method, sensors, pathLossExponent, referenceDistance,
    referenceRSSI, maxIterations, convergenceThreshold, useKalmanFilter, geoMutation
  ]);

  // Export results
  const exportResults = useCallback(() => {
    if (!result) return;
    
    const data = {
      result,
      sensors,
      parameters: {
        method,
        pathLossExponent,
        referenceDistance,
        referenceRSSI,
        maxIterations,
        convergenceThreshold,
      },
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geolocation_${method}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Results exported');
  }, [result, sensors, method, pathLossExponent, referenceDistance, referenceRSSI, maxIterations, convergenceThreshold]);

  // Format coordinates
  const formatCoord = (lat: number, lon: number): string => {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lon).toFixed(5)}° ${lonDir}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20">
              <MapPin className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold">RF Geolocation</h3>
              <p className="text-sm text-muted-foreground">
                Emitter localization using {sensors.length} sensors
              </p>
            </div>
          </div>
          
          {result && (
            <Badge variant="outline" className="text-green-500 border-green-500">
              <Target className="w-3 h-3 mr-1" />
              CEP50: {result.cep50.toFixed(1)}m
            </Badge>
          )}
        </div>
      </Card>

      <Tabs defaultValue="sensors" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sensors">
            <Radio className="w-4 h-4 mr-2" />
            Sensors
          </TabsTrigger>
          <TabsTrigger value="method">
            <Settings className="w-4 h-4 mr-2" />
            Method
          </TabsTrigger>
          <TabsTrigger value="map">
            <MapPin className="w-4 h-4 mr-2" />
            Map
          </TabsTrigger>
          <TabsTrigger value="results">
            <Target className="w-4 h-4 mr-2" />
            Results
          </TabsTrigger>
        </TabsList>

        {/* Sensors Tab */}
        <TabsContent value="sensors" className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm font-medium">Sensor Positions</Label>
              <Button variant="outline" size="sm" onClick={addSensor}>
                <Plus className="w-4 h-4 mr-2" />
                Add Sensor
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Latitude</TableHead>
                  <TableHead>Longitude</TableHead>
                  <TableHead>Alt (m)</TableHead>
                  {(method === 'RSS' || method === 'Hybrid') && <TableHead>RSSI</TableHead>}
                  {(method === 'AOA' || method === 'Hybrid') && <TableHead>AOA (°)</TableHead>}
                  {(method === 'TDOA' || method === 'Hybrid') && <TableHead>TDOA (μs)</TableHead>}
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sensors.map((sensor) => (
                  <TableRow key={sensor.id}>
                    <TableCell>
                      <Input
                        value={sensor.name}
                        onChange={(e) => updateSensor(sensor.id, { name: e.target.value })}
                        className="h-8 w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={sensor.latitude}
                        onChange={(e) => updateSensor(sensor.id, { latitude: parseFloat(e.target.value) || 0 })}
                        className="h-8 w-28 font-mono text-xs"
                        step="0.0001"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={sensor.longitude}
                        onChange={(e) => updateSensor(sensor.id, { longitude: parseFloat(e.target.value) || 0 })}
                        className="h-8 w-28 font-mono text-xs"
                        step="0.0001"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={sensor.altitude}
                        onChange={(e) => updateSensor(sensor.id, { altitude: parseFloat(e.target.value) || 0 })}
                        className="h-8 w-16 font-mono"
                      />
                    </TableCell>
                    {(method === 'RSS' || method === 'Hybrid') && (
                      <TableCell>
                        <Input
                          type="number"
                          value={sensor.rssi || -70}
                          onChange={(e) => updateSensor(sensor.id, { rssi: parseFloat(e.target.value) })}
                          className="h-8 w-16 font-mono"
                        />
                      </TableCell>
                    )}
                    {(method === 'AOA' || method === 'Hybrid') && (
                      <TableCell>
                        <Input
                          type="number"
                          value={sensor.aoa || 0}
                          onChange={(e) => updateSensor(sensor.id, { aoa: parseFloat(e.target.value) })}
                          className="h-8 w-16 font-mono"
                          step="0.1"
                        />
                      </TableCell>
                    )}
                    {(method === 'TDOA' || method === 'Hybrid') && (
                      <TableCell>
                        <Input
                          type="number"
                          value={(sensor.tdoa || 0) * 1e6}
                          onChange={(e) => updateSensor(sensor.id, { tdoa: (parseFloat(e.target.value) || 0) / 1e6 })}
                          className="h-8 w-20 font-mono"
                          step="0.001"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSensor(sensor.id)}
                        className="text-red-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <p className="text-xs text-muted-foreground mt-2">
              {METHOD_INFO[method].name} requires at least {METHOD_INFO[method].minSensors} sensors
            </p>
          </Card>
        </TabsContent>

        {/* Method Tab */}
        <TabsContent value="method" className="space-y-4">
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Localization Method</Label>
            
            <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(METHOD_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      {key === 'TDOA' && <Clock className="w-4 h-4 text-blue-400" />}
                      {key === 'AOA' && <Navigation className="w-4 h-4 text-green-400" />}
                      {key === 'RSS' && <SignalHigh className="w-4 h-4 text-yellow-400" />}
                      {key === 'Hybrid' && <Radar className="w-4 h-4 text-purple-400" />}
                      <span>{info.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <p className="text-sm text-muted-foreground">
              {METHOD_INFO[method].description}
            </p>
          </Card>

          {/* Path Loss Model (for RSS) */}
          {(method === 'RSS' || method === 'Hybrid') && (
            <Card className="p-4 space-y-4">
              <Label className="text-sm font-medium">Path Loss Model</Label>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Path Loss Exponent (n)</Label>
                    <span className="font-mono text-sm">{pathLossExponent.toFixed(1)}</span>
                  </div>
                  <Slider
                    value={[pathLossExponent]}
                    onValueChange={(v) => setPathLossExponent(v[0])}
                    min={1.5}
                    max={4.5}
                    step={0.1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Free space: 2.0, Urban: 2.7-3.5, Indoor: 3.0-5.0
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Reference Distance (m)</Label>
                    <Input
                      type="number"
                      value={referenceDistance}
                      onChange={(e) => setReferenceDistance(parseFloat(e.target.value) || 1)}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Reference RSSI (dBm)</Label>
                    <Input
                      type="number"
                      value={referenceRSSI}
                      onChange={(e) => setReferenceRSSI(parseFloat(e.target.value) || -40)}
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Algorithm Parameters */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Algorithm Parameters</Label>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Max Iterations</Label>
                  <Input
                    type="number"
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(parseInt(e.target.value) || 100)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Convergence Threshold</Label>
                  <Input
                    type="number"
                    value={convergenceThreshold}
                    onChange={(e) => setConvergenceThreshold(parseFloat(e.target.value) || 0.001)}
                    className="font-mono"
                    step="0.0001"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm">Extended Kalman Filter</Label>
                <Switch checked={useKalmanFilter} onCheckedChange={setUseKalmanFilter} />
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Map Tab */}
        <TabsContent value="map" className="space-y-4">
          <Card className="p-4">
            <div ref={mapRef} className="h-96 rounded-lg bg-muted/50 relative overflow-hidden">
              {/* Placeholder map visualization */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MapPin className="w-12 h-12 mx-auto mb-4" />
                  <p className="font-medium">Map Visualization</p>
                  <p className="text-sm">Integrate with Google Maps or Mapbox</p>
                </div>
              </div>

              {/* Sensor markers overlay */}
              <div className="absolute inset-0 pointer-events-none">
                {sensors.map((sensor, i) => {
                  // Simple relative positioning for demo
                  const x = 50 + (sensor.longitude + 122.4) * 500;
                  const y = 50 + (37.8 - sensor.latitude) * 500;
                  return (
                    <div
                      key={sensor.id}
                      className="absolute w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg"
                      style={{ left: `${Math.min(90, Math.max(10, x))}%`, top: `${Math.min(90, Math.max(10, y))}%` }}
                      title={sensor.name}
                    />
                  );
                })}
                
                {/* Estimated position */}
                {result && (
                  <div
                    className="absolute w-6 h-6 rounded-full bg-red-500 border-2 border-white shadow-lg animate-pulse"
                    style={{ 
                      left: `${50 + (result.longitude + 122.4) * 500}%`,
                      top: `${50 + (37.8 - result.latitude) * 500}%`
                    }}
                    title="Estimated Position"
                  >
                    <Crosshair className="w-full h-full text-white p-0.5" />
                  </div>
                )}
              </div>
            </div>

            {result && (
              <div className="mt-4 p-3 rounded-lg bg-muted/50 text-center">
                <p className="font-mono text-lg text-primary">
                  {formatCoord(result.latitude, result.longitude)}
                </p>
                <p className="text-sm text-muted-foreground">
                  CEP50: {result.cep50.toFixed(1)}m | CEP90: {result.cep90.toFixed(1)}m
                </p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Results Tab */}
        <TabsContent value="results" className="space-y-4">
          {result ? (
            <>
              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Estimated Position</Label>
                  <Button variant="ghost" size="sm" onClick={exportResults}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>

                <div className="text-center py-4">
                  <p className="font-mono text-2xl text-primary mb-2">
                    {formatCoord(result.latitude, result.longitude)}
                  </p>
                  {result.altitude && (
                    <p className="text-sm text-muted-foreground">
                      Altitude: {result.altitude.toFixed(1)} m
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">CEP50</div>
                    <div className="font-mono text-lg">{result.cep50.toFixed(1)} m</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">CEP90</div>
                    <div className="font-mono text-lg">{result.cep90.toFixed(1)} m</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Confidence</div>
                    <div className="font-mono text-lg">{(result.confidence * 100).toFixed(0)}%</div>
                  </div>
                </div>

                {result.ellipse && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm font-medium mb-2">Error Ellipse</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Semi-major:</span>
                        <span className="font-mono ml-1">{result.ellipse.semiMajor.toFixed(1)}m</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Semi-minor:</span>
                        <span className="font-mono ml-1">{result.ellipse.semiMinor.toFixed(1)}m</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Orientation:</span>
                        <span className="font-mono ml-1">{result.ellipse.orientation.toFixed(1)}°</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground text-center">
                  Method: {result.method} | Compute time: {result.computeTime.toFixed(1)} ms
                </div>
              </Card>

              {/* History */}
              {history.length > 1 && (
                <Card className="p-4 space-y-4">
                  <Label className="text-sm font-medium">History</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {history.slice(1).map((h, i) => (
                      <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                        <span className="font-mono text-xs">
                          {formatCoord(h.latitude, h.longitude)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          CEP50: {h.cep50.toFixed(0)}m
                        </Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card className="p-8 text-center">
              <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium mb-2">No Results Yet</h3>
              <p className="text-sm text-muted-foreground">
                Configure sensors and run geolocation to estimate emitter position
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Run Button */}
      <Button
        onClick={runGeolocation}
        disabled={isProcessing || sensors.length < METHOD_INFO[method].minSensors}
        className="w-full"
        size="lg"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Localizing...
          </>
        ) : (
          <>
            <Crosshair className="w-4 h-4 mr-2" />
            Run {METHOD_INFO[method].name}
          </>
        )}
      </Button>
    </div>
  );
}

export default GeolocationPanel;