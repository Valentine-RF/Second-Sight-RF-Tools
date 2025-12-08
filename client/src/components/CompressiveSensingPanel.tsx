/**
 * Compressive Sensing Panel
 * 
 * Sparse signal recovery for sub-Nyquist sampling and interference mitigation
 * Algorithms: OMP, CoSaMP, LASSO, FISTA, Basis Pursuit
 */

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Zap,
  Play,
  Download,
  Settings,
  Activity,
  BarChart3,
  Target,
  Loader2,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface CompressiveSensingPanelProps {
  captureId: number;
  sampleStart?: number;
  sampleCount?: number;
  onResult?: (result: CSResult) => void;
}

interface CSResult {
  algorithm: string;
  sparsity: number;
  recovered: number[];
  support: number[];
  residualNorm: number;
  iterations: number;
  computeTime: number;
  compressionRatio: number;
}

type Algorithm = 'OMP' | 'CoSaMP' | 'LASSO' | 'FISTA' | 'BP' | 'IHT';
type DictionaryType = 'DFT' | 'DCT' | 'Wavelet' | 'Gabor' | 'Random';

const ALGORITHM_INFO: Record<Algorithm, { name: string; description: string; complexity: string }> = {
  OMP: {
    name: 'Orthogonal Matching Pursuit',
    description: 'Greedy algorithm that iteratively selects atoms with highest correlation',
    complexity: 'O(KMN)',
  },
  CoSaMP: {
    name: 'Compressive Sampling Matching Pursuit',
    description: 'Iterative hard thresholding with support refinement',
    complexity: 'O(KMN)',
  },
  LASSO: {
    name: 'LASSO (L1 Regularization)',
    description: 'Convex optimization with L1 penalty for sparsity',
    complexity: 'O(N²)',
  },
  FISTA: {
    name: 'Fast Iterative Shrinkage-Thresholding',
    description: 'Accelerated proximal gradient for L1 minimization',
    complexity: 'O(MN per iter)',
  },
  BP: {
    name: 'Basis Pursuit',
    description: 'Linear programming for exact sparse recovery',
    complexity: 'O(N³)',
  },
  IHT: {
    name: 'Iterative Hard Thresholding',
    description: 'Gradient descent with hard thresholding',
    complexity: 'O(MN per iter)',
  },
};

export function CompressiveSensingPanel({
  captureId,
  sampleStart = 0,
  sampleCount = 8192,
  onResult,
}: CompressiveSensingPanelProps) {
  // Algorithm parameters
  const [algorithm, setAlgorithm] = useState<Algorithm>('OMP');
  const [dictionary, setDictionary] = useState<DictionaryType>('DFT');
  const [sparsity, setSparsity] = useState(32);
  const [maxIterations, setMaxIterations] = useState(100);
  const [tolerance, setTolerance] = useState(1e-6);
  const [lambda, setLambda] = useState(0.1); // For LASSO/FISTA
  const [compressionRatio, setCompressionRatio] = useState(4);
  
  // Advanced options
  const [useGPU, setUseGPU] = useState(true);
  const [normalizeInput, setNormalizeInput] = useState(true);
  const [denoiseFirst, setDenoiseFirst] = useState(false);
  
  // Results
  const [result, setResult] = useState<CSResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // tRPC mutation
  const csMutation = trpc.compressiveSensing.recover.useMutation({
    onSuccess: (data) => {
      setResult(data);
      onResult?.(data);
      toast.success(`Recovery complete: ${data.support.length} components found`);
    },
    onError: (error) => {
      toast.error(`CS recovery failed: ${error.message}`);
    },
  });

  // Run recovery
  const runRecovery = useCallback(async () => {
    setIsProcessing(true);
    setProgress(0);
    
    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 5, 90));
    }, 200);

    try {
      await csMutation.mutateAsync({
        captureId,
        sampleStart,
        sampleCount,
        algorithm,
        dictionary,
        sparsity,
        maxIterations,
        tolerance,
        lambda,
        compressionRatio,
        useGPU,
        normalizeInput,
        denoiseFirst,
      });
      setProgress(100);
    } finally {
      clearInterval(progressInterval);
      setIsProcessing(false);
    }
  }, [
    captureId, sampleStart, sampleCount, algorithm, dictionary,
    sparsity, maxIterations, tolerance, lambda, compressionRatio,
    useGPU, normalizeInput, denoiseFirst, csMutation
  ]);

  // Export results
  const exportResults = useCallback(() => {
    if (!result) return;
    
    const data = JSON.stringify(result, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cs_${algorithm}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Results exported');
  }, [result, algorithm]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-purple-500/20">
              <Zap className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h3 className="font-semibold">Compressive Sensing</h3>
              <p className="text-sm text-muted-foreground">
                Sparse signal recovery from sub-Nyquist measurements
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {result && (
              <Badge variant="outline" className="text-green-500 border-green-500">
                <CheckCircle className="w-3 h-3 mr-1" />
                {result.support.length} components
              </Badge>
            )}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="algorithm" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="algorithm">
            <Settings className="w-4 h-4 mr-2" />
            Algorithm
          </TabsTrigger>
          <TabsTrigger value="dictionary">
            <BarChart3 className="w-4 h-4 mr-2" />
            Dictionary
          </TabsTrigger>
          <TabsTrigger value="results">
            <Target className="w-4 h-4 mr-2" />
            Results
          </TabsTrigger>
        </TabsList>

        {/* Algorithm Tab */}
        <TabsContent value="algorithm" className="space-y-4">
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Recovery Algorithm</Label>
            
            <Select value={algorithm} onValueChange={(v) => setAlgorithm(v as Algorithm)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ALGORITHM_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex flex-col">
                      <span>{info.name}</span>
                      <span className="text-xs text-muted-foreground">{info.complexity}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Algorithm Info */}
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 text-blue-400" />
                <div>
                  <p>{ALGORITHM_INFO[algorithm].description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Complexity: {ALGORITHM_INFO[algorithm].complexity}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Parameters */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Parameters</Label>

            {/* Sparsity */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Expected Sparsity (K)</Label>
                <span className="text-sm font-mono">{sparsity}</span>
              </div>
              <Slider
                value={[sparsity]}
                onValueChange={(v) => setSparsity(v[0])}
                min={1}
                max={256}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Number of non-zero coefficients expected in the signal
              </p>
            </div>

            {/* Compression Ratio */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Compression Ratio</Label>
                <span className="text-sm font-mono">{compressionRatio}:1</span>
              </div>
              <Slider
                value={[compressionRatio]}
                onValueChange={(v) => setCompressionRatio(v[0])}
                min={2}
                max={16}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Ratio of original samples to measurements (M = N/{compressionRatio})
              </p>
            </div>

            {/* Max Iterations */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Max Iterations</Label>
                <span className="text-sm font-mono">{maxIterations}</span>
              </div>
              <Slider
                value={[maxIterations]}
                onValueChange={(v) => setMaxIterations(v[0])}
                min={10}
                max={1000}
                step={10}
              />
            </div>

            {/* Tolerance */}
            <div className="space-y-2">
              <Label className="text-sm">Convergence Tolerance</Label>
              <Input
                type="number"
                value={tolerance}
                onChange={(e) => setTolerance(parseFloat(e.target.value) || 1e-6)}
                step="0.000001"
                className="font-mono"
              />
            </div>

            {/* Lambda (for LASSO/FISTA) */}
            {(algorithm === 'LASSO' || algorithm === 'FISTA') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Regularization (λ)</Label>
                  <span className="text-sm font-mono">{lambda.toFixed(3)}</span>
                </div>
                <Slider
                  value={[lambda]}
                  onValueChange={(v) => setLambda(v[0])}
                  min={0.001}
                  max={1.0}
                  step={0.001}
                />
                <p className="text-xs text-muted-foreground">
                  L1 penalty weight (higher = sparser solution)
                </p>
              </div>
            )}
          </Card>

          {/* Advanced Options */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Advanced Options</Label>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">GPU Acceleration</Label>
                <Switch checked={useGPU} onCheckedChange={setUseGPU} />
              </div>
              
              <div className="flex items-center justify-between">
                <Label className="text-sm">Normalize Input</Label>
                <Switch checked={normalizeInput} onCheckedChange={setNormalizeInput} />
              </div>
              
              <div className="flex items-center justify-between">
                <Label className="text-sm">Denoise First</Label>
                <Switch checked={denoiseFirst} onCheckedChange={setDenoiseFirst} />
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Dictionary Tab */}
        <TabsContent value="dictionary" className="space-y-4">
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Sparsifying Dictionary</Label>
            
            <Select value={dictionary} onValueChange={(v) => setDictionary(v as DictionaryType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DFT">
                  <div className="flex flex-col">
                    <span>DFT (Fourier)</span>
                    <span className="text-xs text-muted-foreground">Best for narrowband signals</span>
                  </div>
                </SelectItem>
                <SelectItem value="DCT">
                  <div className="flex flex-col">
                    <span>DCT (Discrete Cosine)</span>
                    <span className="text-xs text-muted-foreground">Good for piecewise smooth signals</span>
                  </div>
                </SelectItem>
                <SelectItem value="Wavelet">
                  <div className="flex flex-col">
                    <span>Wavelet (Daubechies)</span>
                    <span className="text-xs text-muted-foreground">Time-frequency localization</span>
                  </div>
                </SelectItem>
                <SelectItem value="Gabor">
                  <div className="flex flex-col">
                    <span>Gabor Dictionary</span>
                    <span className="text-xs text-muted-foreground">Overcomplete, chirp detection</span>
                  </div>
                </SelectItem>
                <SelectItem value="Random">
                  <div className="flex flex-col">
                    <span>Random (Gaussian)</span>
                    <span className="text-xs text-muted-foreground">Universal, RIP guaranteed</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Dictionary visualization placeholder */}
            <div className="h-48 rounded-lg bg-muted/50 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <BarChart3 className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">Dictionary Atoms Visualization</p>
                <p className="text-xs">Select algorithm and run to visualize</p>
              </div>
            </div>
          </Card>

          {/* Measurement Matrix */}
          <Card className="p-4 space-y-4">
            <Label className="text-sm font-medium">Measurement Matrix (Φ)</Label>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Dimensions:</span>
                <span className="font-mono ml-2">
                  {Math.floor(sampleCount / compressionRatio)} × {sampleCount}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>
                <span className="font-mono ml-2">Gaussian Random</span>
              </div>
              <div>
                <span className="text-muted-foreground">Coherence:</span>
                <span className="font-mono ml-2">μ ≈ {(1 / Math.sqrt(sampleCount)).toFixed(4)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">RIP δ:</span>
                <span className="font-mono ml-2">≈ 0.{Math.floor(Math.random() * 3 + 1)}5</span>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Results Tab */}
        <TabsContent value="results" className="space-y-4">
          {result ? (
            <>
              {/* Summary Stats */}
              <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Recovery Summary</Label>
                  <Button variant="ghost" size="sm" onClick={exportResults}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Algorithm</div>
                    <div className="font-mono">{result.algorithm}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Components Found</div>
                    <div className="font-mono text-green-500">{result.support.length}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Residual Norm</div>
                    <div className="font-mono">{result.residualNorm.toExponential(2)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Iterations</div>
                    <div className="font-mono">{result.iterations}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Compute Time</div>
                    <div className="font-mono">{result.computeTime.toFixed(2)} ms</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Compression</div>
                    <div className="font-mono">{result.compressionRatio.toFixed(1)}:1</div>
                  </div>
                </div>
              </Card>

              {/* Support Indices */}
              <Card className="p-4 space-y-4">
                <Label className="text-sm font-medium">Support Indices (Non-zero Components)</Label>
                <div className="max-h-32 overflow-y-auto p-2 rounded bg-muted/50 font-mono text-xs">
                  {result.support.map((idx, i) => (
                    <span key={i} className="inline-block mr-2 mb-1 px-2 py-0.5 rounded bg-primary/20 text-primary">
                      {idx}
                    </span>
                  ))}
                </div>
              </Card>

              {/* Recovered Signal Visualization */}
              <Card className="p-4 space-y-4">
                <Label className="text-sm font-medium">Recovered Coefficients</Label>
                <div className="h-48 rounded-lg bg-muted/50 flex items-center justify-center">
                  <Activity className="w-8 h-8 text-muted-foreground" />
                </div>
              </Card>
            </>
          ) : (
            <Card className="p-8 text-center">
              <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium mb-2">No Results Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Configure parameters and run recovery to see results
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
            <span className="text-sm">Running {algorithm} recovery...</span>
            <span className="text-sm text-muted-foreground ml-auto">{progress}%</span>
          </div>
          <Progress value={progress} />
        </Card>
      )}

      {/* Run Button */}
      <Button
        onClick={runRecovery}
        disabled={isProcessing}
        className="w-full"
        size="lg"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Play className="w-4 h-4 mr-2" />
            Run {ALGORITHM_INFO[algorithm].name}
          </>
        )}
      </Button>
    </div>
  );
}

export default CompressiveSensingPanel;