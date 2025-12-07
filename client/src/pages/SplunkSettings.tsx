import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function SplunkSettings() {
  const [hecUrl, setHecUrl] = useState('');
  const [hecToken, setHecToken] = useState('');
  const [index, setIndex] = useState('main');
  const [source, setSource] = useState('second-sight-rf');
  const [sourcetype, setSourcetype] = useState('rf_signal_analysis');
  const [verifySsl, setVerifySsl] = useState(true);
  const [batchSize, setBatchSize] = useState(10);
  const [flushInterval, setFlushInterval] = useState(5000);
  const [isActive, setIsActive] = useState(true);
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);

  const { data: config, refetch } = trpc.splunk.getConfig.useQuery();
  const { data: eventTypes } = trpc.splunk.getEventTypes.useQuery();
  
  const saveConfigMutation = trpc.splunk.saveConfig.useMutation({
    onSuccess: () => {
      toast.success('Splunk configuration saved');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to save configuration: ${error.message}`);
    },
  });

  const testConnectionMutation = trpc.splunk.testConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Connection successful!');
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });

  const disableMutation = trpc.splunk.disable.useMutation({
    onSuccess: () => {
      toast.success('Splunk integration disabled');
      refetch();
    },
  });

  // Load config when available
  useEffect(() => {
    if (config) {
      setHecUrl(config.hecUrl);
      // Don't overwrite token if it's masked
      if (!config.hecToken.includes('...')) {
        setHecToken(config.hecToken);
      }
      setIndex(config.index || 'main');
      setSource(config.source || 'second-sight-rf');
      setSourcetype(config.sourcetype || 'rf_signal_analysis');
      setVerifySsl(config.verifySsl);
      setBatchSize(config.batchSize);
      setFlushInterval(config.flushInterval);
      setIsActive(config.isActive);
      
      if (config.enabledEventTypes) {
        try {
          const types = JSON.parse(config.enabledEventTypes);
          setSelectedEventTypes(types);
        } catch (e) {
          console.error('Failed to parse enabled event types:', e);
        }
      }
    }
  }, [config]);

  const handleSave = () => {
    if (!hecUrl || !hecToken) {
      toast.error('HEC URL and Token are required');
      return;
    }

    saveConfigMutation.mutate({
      hecUrl,
      hecToken,
      index,
      source,
      sourcetype,
      enabledEventTypes: selectedEventTypes as any[],
      verifySsl,
      batchSize,
      flushInterval,
      isActive,
    });
  };

  const handleTestConnection = () => {
    if (!hecUrl || !hecToken) {
      toast.error('HEC URL and Token are required');
      return;
    }

    testConnectionMutation.mutate({
      hecUrl,
      hecToken,
      index,
      verifySsl,
    });
  };

  const toggleEventType = (eventType: string) => {
    setSelectedEventTypes(prev => 
      prev.includes(eventType)
        ? prev.filter(t => t !== eventType)
        : [...prev, eventType]
    );
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-4xl font-bold mb-2">Splunk Integration</h1>
        <p className="text-muted-foreground">
          Send RF signal analysis events to Splunk Enterprise for centralized logging and alerting
        </p>
      </div>

      {/* Connection Status */}
      {config && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold mb-2">Connection Status</h2>
              {config.lastTestAt && (
                <div className="flex items-center gap-2 text-sm">
                  {config.lastTestSuccess ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-green-600 dark:text-green-400">
                        Connected - Last tested {new Date(config.lastTestAt).toLocaleString()}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span className="text-red-600 dark:text-red-400">
                        Failed - {config.lastTestMessage}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {config.isActive ? 'Active' : 'Inactive'}
              </span>
              <div className={`w-3 h-3 rounded-full ${config.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
            </div>
          </div>
        </Card>
      )}

      {/* Configuration Form */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-6">HEC Configuration</h2>
        
        <div className="space-y-6">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label className="text-base font-medium">Enable Splunk Integration</Label>
              <p className="text-sm text-muted-foreground">
                Send events to Splunk automatically
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* HEC URL */}
          <div>
            <Label htmlFor="hecUrl">HEC URL *</Label>
            <Input
              id="hecUrl"
              placeholder="https://splunk.example.com:8088/services/collector"
              value={hecUrl}
              onChange={(e) => setHecUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Full URL to your Splunk HTTP Event Collector endpoint
            </p>
          </div>

          {/* HEC Token */}
          <div>
            <Label htmlFor="hecToken">HEC Token *</Label>
            <Input
              id="hecToken"
              type="password"
              placeholder="Enter your HEC token"
              value={hecToken}
              onChange={(e) => setHecToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Generate this token in Splunk under Settings → Data Inputs → HTTP Event Collector
            </p>
          </div>

          {/* Index */}
          <div>
            <Label htmlFor="index">Index</Label>
            <Input
              id="index"
              placeholder="main"
              value={index}
              onChange={(e) => setIndex(e.target.value)}
            />
          </div>

          {/* Source */}
          <div>
            <Label htmlFor="source">Source</Label>
            <Input
              id="source"
              placeholder="second-sight-rf"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>

          {/* Sourcetype */}
          <div>
            <Label htmlFor="sourcetype">Sourcetype</Label>
            <Input
              id="sourcetype"
              placeholder="rf_signal_analysis"
              value={sourcetype}
              onChange={(e) => setSourcetype(e.target.value)}
            />
          </div>

          {/* SSL Verification */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label className="text-base font-medium">Verify SSL Certificate</Label>
              <p className="text-sm text-muted-foreground">
                Disable for self-signed certificates (not recommended for production)
              </p>
            </div>
            <Switch checked={verifySsl} onCheckedChange={setVerifySsl} />
          </div>

          {/* Batch Size */}
          <div>
            <Label htmlFor="batchSize">Batch Size</Label>
            <Input
              id="batchSize"
              type="number"
              min={1}
              max={100}
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Number of events to batch before sending (1-100)
            </p>
          </div>

          {/* Flush Interval */}
          <div>
            <Label htmlFor="flushInterval">Flush Interval (ms)</Label>
            <Input
              id="flushInterval"
              type="number"
              min={1000}
              max={60000}
              step={1000}
              value={flushInterval}
              onChange={(e) => setFlushInterval(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              How often to send batched events (1000-60000 ms)
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            onClick={handleSave}
            disabled={saveConfigMutation.isPending}
          >
            {saveConfigMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Save Configuration
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testConnectionMutation.isPending}
          >
            {testConnectionMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Test Connection
          </Button>
          {config && config.isActive && (
            <Button
              variant="destructive"
              onClick={() => disableMutation.mutate()}
              disabled={disableMutation.isPending}
            >
              Disable Integration
            </Button>
          )}
        </div>
      </Card>

      {/* Event Type Filtering */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Event Filtering</h2>
        <p className="text-muted-foreground mb-6">
          Select which event types to send to Splunk
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {eventTypes?.map((eventType) => (
            <div
              key={eventType.value}
              className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
              onClick={() => toggleEventType(eventType.value)}
            >
              <input
                type="checkbox"
                checked={selectedEventTypes.includes(eventType.value)}
                onChange={() => toggleEventType(eventType.value)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">{eventType.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Splunk Dashboard Examples */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Splunk Dashboard Examples</h2>
        <p className="text-muted-foreground mb-6">
          Sample SPL queries for creating dashboards and alerts
        </p>

        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Recent Signal Uploads</h3>
            <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`index="${index}" sourcetype="${sourcetype}" eventType="signal_upload"
| stats count by captureName, userName
| sort -count`}
            </pre>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Modulation Classification Summary</h3>
            <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`index="${index}" sourcetype="${sourcetype}" eventType="modulation_classification"
| stats avg(confidence) as avg_confidence, count by modulation
| eval avg_confidence=round(avg_confidence*100, 2)
| sort -count`}
            </pre>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Anomaly Detection Alerts</h3>
            <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`index="${index}" sourcetype="${sourcetype}" eventType="anomaly_detection" severity="ERROR" OR severity="CRITICAL"
| table _time, anomalyType, description, captureName, userName
| sort -_time`}
            </pre>
          </div>

          <div>
            <h3 className="font-semibold mb-2">API Usage Statistics</h3>
            <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`index="${index}" sourcetype="${sourcetype}" eventType="api_request"
| timechart span=1h count by apiKeyName
| eval _time=strftime(_time, "%Y-%m-%d %H:%M")`}
            </pre>
          </div>
        </div>
      </Card>

      {/* Setup Instructions */}
      <Card className="p-6 bg-blue-500/10 border-blue-500/20">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold mb-2">Setup Instructions</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Log in to your Splunk Enterprise instance</li>
              <li>Navigate to Settings → Data Inputs → HTTP Event Collector</li>
              <li>Click "New Token" and configure:
                <ul className="list-disc list-inside ml-6 mt-1">
                  <li>Name: Second Sight RF Integration</li>
                  <li>Source type: Automatic (or create custom "rf_signal_analysis")</li>
                  <li>Index: Select your target index (default: main)</li>
                </ul>
              </li>
              <li>Copy the generated HEC token</li>
              <li>Paste the token and HEC URL into the form above</li>
              <li>Click "Test Connection" to verify</li>
              <li>Click "Save Configuration" to enable integration</li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
}
