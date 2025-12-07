import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { Loader2, Copy, Check, Key, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function APIDocumentation() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(100);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data: apiKeys, refetch } = trpc.apiKeys.list.useQuery();
  const createKeyMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setCreatedKey(data.key);
      toast.success('API key created successfully');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to create API key: ${error.message}`);
    },
  });

  const deleteKeyMutation = trpc.apiKeys.delete.useMutation({
    onSuccess: () => {
      toast.success('API key deleted');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to delete API key: ${error.message}`);
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a key name');
      return;
    }
    createKeyMutation.mutate({
      name: newKeyName,
      rateLimit: newKeyRateLimit,
    });
  };

  const handleDeleteKey = (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      deleteKeyMutation.mutate({ id });
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-4xl font-bold mb-2">Public API</h1>
        <p className="text-muted-foreground">
          Integrate modulation classification into your applications
        </p>
      </div>

      {/* API Keys Management */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">API Keys</h2>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create API Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New API Key</DialogTitle>
                <DialogDescription>
                  Generate a new API key for third-party access
                </DialogDescription>
              </DialogHeader>
              
              {createdKey ? (
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-2">
                      ⚠️ Save this key now - it won't be shown again!
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-background rounded text-sm font-mono break-all">
                        {createdKey}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(createdKey, 'API key')}
                      >
                        {copiedKey === 'API key' ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="keyName">Key Name</Label>
                    <Input
                      id="keyName"
                      placeholder="My Application"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="rateLimit">Rate Limit (requests/hour)</Label>
                    <Input
                      id="rateLimit"
                      type="number"
                      min={1}
                      max={10000}
                      value={newKeyRateLimit}
                      onChange={(e) => setNewKeyRateLimit(Number(e.target.value))}
                    />
                  </div>
                </div>
              )}
              
              <DialogFooter>
                {createdKey ? (
                  <Button
                    onClick={() => {
                      setCreatedKey(null);
                      setNewKeyName('');
                      setNewKeyRateLimit(100);
                      setIsCreateDialogOpen(false);
                    }}
                  >
                    Done
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateKey}
                      disabled={createKeyMutation.isPending}
                    >
                      {createKeyMutation.isPending && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Create Key
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          {apiKeys && apiKeys.length > 0 ? (
            apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{key.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {key.requestCount} requests • {key.rateLimit}/hour limit
                      {key.lastUsed && ` • Last used ${new Date(key.lastUsed).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteKey(key.id, key.name)}
                  disabled={deleteKeyMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No API keys yet. Create one to get started.
            </p>
          )}
        </div>
      </Card>

      {/* API Documentation */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Endpoint Documentation</h2>
        
        <div className="space-y-6">
          {/* POST /api/public/classify */}
          <div>
            <h3 className="text-xl font-semibold mb-2">POST /api/public/classify</h3>
            <p className="text-muted-foreground mb-4">
              Classify modulation type from IQ samples
            </p>

            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Request Headers</h4>
                <div className="bg-muted p-3 rounded font-mono text-sm">
                  X-API-Key: your_api_key_here<br />
                  Content-Type: application/json
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Request Body</h4>
                <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`{
  "iqSamples": [0.5, 0.3, -0.2, 0.8, ...],  // Array of floats
  "sampleRate": 2000000,                     // Optional: Hz
  "format": "array"                          // "array" or "base64"
}`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">Response</h4>
                <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`{
  "modulation": "QPSK",
  "confidence": 0.92,
  "allScores": {
    "AM": 0.05,
    "FM": 0.03,
    "BPSK": 0.12,
    "QPSK": 0.92,
    ...
  },
  "features": {
    "meanAmplitude": 0.65,
    "stdAmplitude": 0.15,
    "meanPhase": 0.02,
    "stdPhase": 1.23,
    "spectralFlatness": 0.45
  },
  "metadata": {
    "sampleCount": 1024,
    "sampleRate": 2000000,
    "processingTimeMs": 125
  }
}`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">cURL Example</h4>
                <div className="relative">
                  <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`curl -X POST https://your-domain.com/api/public/classify \\
  -H "X-API-Key: sk_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "iqSamples": [0.5, 0.3, -0.2, 0.8],
    "sampleRate": 2000000,
    "format": "array"
  }'`}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(
                      `curl -X POST https://your-domain.com/api/public/classify \\
  -H "X-API-Key: sk_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"iqSamples": [0.5, 0.3, -0.2, 0.8], "sampleRate": 2000000, "format": "array"}'`,
                      'cURL command'
                    )}
                  >
                    {copiedKey === 'cURL command' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Python Example</h4>
                <div className="relative">
                  <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`import requests
import numpy as np

# Generate sample IQ data
iq_samples = np.random.randn(2048).tolist()

response = requests.post(
    'https://your-domain.com/api/public/classify',
    headers={'X-API-Key': 'sk_your_api_key_here'},
    json={
        'iqSamples': iq_samples,
        'sampleRate': 2000000,
        'format': 'array'
    }
)

result = response.json()
print(f"Modulation: {result['modulation']}")
print(f"Confidence: {result['confidence']:.2%}")`}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(
                      `import requests\nimport numpy as np\n\niq_samples = np.random.randn(2048).tolist()\n\nresponse = requests.post(\n    'https://your-domain.com/api/public/classify',\n    headers={'X-API-Key': 'sk_your_api_key_here'},\n    json={'iqSamples': iq_samples, 'sampleRate': 2000000, 'format': 'array'}\n)\n\nresult = response.json()\nprint(f"Modulation: {result['modulation']}")\nprint(f"Confidence: {result['confidence']:.2%}")`,
                      'Python code'
                    )}
                  >
                    {copiedKey === 'Python code' ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* GET /api/public/status */}
          <div className="pt-6 border-t">
            <h3 className="text-xl font-semibold mb-2">GET /api/public/status</h3>
            <p className="text-muted-foreground mb-4">
              Check API status and model information
            </p>

            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Response</h4>
                <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`{
  "status": "operational",
  "model": {
    "supportedModulations": ["AM", "FM", "BPSK", "QPSK", ...],
    "inputFormat": ["array", "base64"],
    "maxSamples": 100000
  },
  "apiKey": {
    "name": "My Application",
    "rateLimit": 100,
    "requestCount": 42,
    "lastUsed": "2025-12-07T19:30:00.000Z"
  }
}`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Supported Modulations */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Supported Modulations</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {['AM', 'FM', 'BPSK', 'QPSK', '8PSK', '16QAM', '64QAM', 'FSK', 'GMSK', 'OOK'].map((mod) => (
            <div key={mod} className="p-3 bg-muted rounded text-center font-mono font-semibold">
              {mod}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
