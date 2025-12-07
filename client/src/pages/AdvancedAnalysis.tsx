import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Activity, Fingerprint, Radio, AlertTriangle, Loader2 } from 'lucide-react';

export default function AdvancedAnalysis() {
  const { user, loading: authLoading } = useAuth();
  const [selectedCaptureId] = useState<number>(1);
  const [activeTab, setActiveTab] = useState('higher-order');
  
  const [cumulantResults, setCumulantResults] = useState<any>(null);
  const [waveletFamily, setWaveletFamily] = useState<'db4' | 'db6' | 'db8' | 'morlet'>('db4');
  const [waveletLevel, setWaveletLevel] = useState(3);
  const [waveletResults, setWaveletResults] = useState<any>(null);
  const [sampleRate, setSampleRate] = useState(1e6);
  const [ssqResults, setSsqResults] = useState<any>(null);
  const [bispectrumResults, setBispectrumResults] = useState<any>(null);
  const [rfDnaRegions, setRfDnaRegions] = useState(20);
  const [rfDnaResults, setRfDnaResults] = useState<any>(null);
  const [cbDnaModulation, setCbDnaModulation] = useState<'QPSK' | 'QAM16' | 'QAM64'>('QPSK');
  const [cbDnaResults, setCbDnaResults] = useState<any>(null);
  const [preambleType, setPreambleType] = useState<'802.11' | 'LTE' | '5G_NR'>('802.11');
  const [preambleResults, setPreambleResults] = useState<any>(null);
  const [anomalyThreshold, setAnomalyThreshold] = useState(0.5);
  const [anomalyResults, setAnomalyResults] = useState<any>(null);
  
  const cumulantsMutation = trpc.advancedProcessing.calculateCumulants.useMutation();
  const waveletMutation = trpc.advancedProcessing.waveletDecomposition.useMutation();
  const ssqMutation = trpc.advancedProcessing.synchrosqueezingTransform.useMutation();
  const bispectrumMutation = trpc.advancedProcessing.bispectrumAnalysis.useMutation();
  const rfDnaMutation = trpc.rfDna.extractFeatures.useMutation();
  const cbDnaMutation = trpc.rfDna.constellationDna.useMutation();
  const preambleMutation = trpc.rfDna.detectPreamble.useMutation();
  const anomalyMutation = trpc.rfDna.detectAnomaly.useMutation();
  
  const handleCalculateCumulants = async () => {
    try {
      const result = await cumulantsMutation.mutateAsync({ captureId: selectedCaptureId });
      setCumulantResults(result);
      toast.success('Cumulants calculated');
    } catch (error) {
      toast.error('Failed to calculate cumulants');
    }
  };
  
  const handleWaveletDecomposition = async () => {
    try {
      const result = await waveletMutation.mutateAsync({ captureId: selectedCaptureId, wavelet: waveletFamily, level: waveletLevel });
      setWaveletResults(result);
      toast.success('Wavelet decomposition complete');
    } catch (error) {
      toast.error('Failed');
    }
  };
  
  const handleSynchrosqueezing = async () => {
    try {
      const result = await ssqMutation.mutateAsync({ captureId: selectedCaptureId, sampleRate });
      setSsqResults(result);
      toast.success('Transform complete');
    } catch (error) {
      toast.error('Failed');
    }
  };
  
  const handleBispectrum = async () => {
    try {
      const result = await bispectrumMutation.mutateAsync({ captureId: selectedCaptureId });
      setBispectrumResults(result);
      toast.success('Bispectrum complete');
    } catch (error) {
      toast.error('Failed');
    }
  };
  
  const handleExtractRfDna = async () => {
    try {
      const result = await rfDnaMutation.mutateAsync({ captureId: selectedCaptureId, regions: rfDnaRegions });
      setRfDnaResults(result);
      toast.success(`Extracted ${result.feature_count} features`);
    } catch (error) {
      toast.error('Failed');
    }
  };
  
  const handleConstellationDna = async () => {
    try {
      const result = await cbDnaMutation.mutateAsync({ captureId: selectedCaptureId, modulation: cbDnaModulation });
      setCbDnaResults(result);
      toast.success('CB-DNA complete');
    } catch (error) {
      toast.error('Failed');
    }
  };
  
  const handleDetectPreamble = async () => {
    try {
      const result = await preambleMutation.mutateAsync({ captureId: selectedCaptureId, preambleType });
      setPreambleResults(result);
      toast.success(result.detected ? 'Preamble detected' : 'No preamble');
    } catch (error) {
      toast.error('Failed');
    }
  };
  
  const handleDetectAnomaly = async () => {
    try {
      const result = await anomalyMutation.mutateAsync({ captureId: selectedCaptureId, threshold: anomalyThreshold });
      setAnomalyResults(result);
      toast.success(result.is_anomaly ? 'Anomaly detected' : 'No anomaly');
    } catch (error) {
      toast.error('Failed');
    }
  };
  
  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (!user) return <div className="min-h-screen flex items-center justify-center"><p>Please log in</p></div>;
  
  return (
    <div className="min-h-screen p-6">
      <div className="container max-w-7xl">
        <div className="mb-8">
          <h1 className="massive-headline mb-2">Advanced Analysis</h1>
          <p className="technical-label">RF FORENSIC TECHNIQUES</p>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="higher-order"><Activity className="w-4 h-4 mr-2" />Higher-Order</TabsTrigger>
            <TabsTrigger value="rf-dna"><Fingerprint className="w-4 h-4 mr-2" />RF-DNA</TabsTrigger>
            <TabsTrigger value="protocol"><Radio className="w-4 h-4 mr-2" />Protocol</TabsTrigger>
            <TabsTrigger value="anomaly"><AlertTriangle className="w-4 h-4 mr-2" />Anomaly</TabsTrigger>
          </TabsList>
          
          <TabsContent value="higher-order" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="font-black text-lg mb-4">Higher-Order Cumulants</h3>
                <Button onClick={handleCalculateCumulants} disabled={cumulantsMutation.isPending} className="w-full mb-4">
                  {cumulantsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Calculate
                </Button>
                {cumulantResults && (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>4th Order:</span><span className="font-mono">{cumulantResults.cum4?.toFixed(4)}</span></div>
                    <div className="flex justify-between"><span>6th Order:</span><span className="font-mono">{cumulantResults.cum6?.toFixed(4)}</span></div>
                  </div>
                )}
              </Card>
              
              <Card className="p-6">
                <h3 className="font-black text-lg mb-4">Bispectrum</h3>
                <Button onClick={handleBispectrum} disabled={bispectrumMutation.isPending} className="w-full mb-4">
                  {bispectrumMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Analyze
                </Button>
                {bispectrumResults && (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Phase Coupling:</span><span className="font-mono">{(bispectrumResults.phase_coupling * 100).toFixed(1)}%</span></div>
                    <div className="flex justify-between"><span>Nonlinearity:</span><span className="font-mono">{(bispectrumResults.nonlinearity_index * 100).toFixed(1)}%</span></div>
                  </div>
                )}
              </Card>
              
              <Card className="p-6">
                <h3 className="font-black text-lg mb-4">Wavelet Decomposition</h3>
                <div className="space-y-4 mb-4">
                  <Select value={waveletFamily} onValueChange={(v: any) => setWaveletFamily(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="db4">db4</SelectItem>
                      <SelectItem value="db6">db6</SelectItem>
                      <SelectItem value="db8">db8</SelectItem>
                      <SelectItem value="morlet">morlet</SelectItem>
                    </SelectContent>
                  </Select>
                  <div><label className="block mb-2">Level: {waveletLevel}</label><Slider value={[waveletLevel]} onValueChange={([v]) => setWaveletLevel(v)} min={1} max={5} step={1} /></div>
                </div>
                <Button onClick={handleWaveletDecomposition} disabled={waveletMutation.isPending} className="w-full mb-4">
                  {waveletMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Decompose
                </Button>
                {waveletResults && (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Nodes:</span><span className="font-mono">{waveletResults.nodes?.length}</span></div>
                  </div>
                )}
              </Card>
              
              <Card className="p-6">
                <h3 className="font-black text-lg mb-4">Synchrosqueezing</h3>
                <div className="mb-4"><label className="block mb-2">Sample Rate: {(sampleRate / 1e6).toFixed(2)} MHz</label><Slider value={[Math.log10(sampleRate)]} onValueChange={([v]) => setSampleRate(Math.pow(10, v))} min={5} max={7} step={0.1} /></div>
                <Button onClick={handleSynchrosqueezing} disabled={ssqMutation.isPending} className="w-full mb-4">
                  {ssqMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Compute
                </Button>
                {ssqResults && (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Modes:</span><span className="font-mono">{ssqResults.modes?.length}</span></div>
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="rf-dna" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="font-black text-lg mb-4">AFIT RF-DNA</h3>
                <div className="mb-4"><label className="block mb-2">Regions: {rfDnaRegions}</label><Slider value={[rfDnaRegions]} onValueChange={([v]) => setRfDnaRegions(v)} min={5} max={50} step={5} /></div>
                <Button onClick={handleExtractRfDna} disabled={rfDnaMutation.isPending} className="w-full mb-4">
                  {rfDnaMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Extract
                </Button>
                {rfDnaResults && (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Features:</span><span className="font-mono">{rfDnaResults.feature_count}</span></div>
                  </div>
                )}
              </Card>
              
              <Card className="p-6">
                <h3 className="font-black text-lg mb-4">CB-DNA</h3>
                <div className="mb-4">
                  <Select value={cbDnaModulation} onValueChange={(v: any) => setCbDnaModulation(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QPSK">QPSK</SelectItem>
                      <SelectItem value="QAM16">16-QAM</SelectItem>
                      <SelectItem value="QAM64">64-QAM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleConstellationDna} disabled={cbDnaMutation.isPending} className="w-full mb-4">
                  {cbDnaMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Analyze
                </Button>
                {cbDnaResults && (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>EVM RMS:</span><span className="font-mono">{(cbDnaResults.evm_rms * 100).toFixed(2)}%</span></div>
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="protocol">
            <Card className="p-6 max-w-2xl">
              <h3 className="font-black text-lg mb-4">Preamble Detection</h3>
              <div className="mb-4">
                <Select value={preambleType} onValueChange={(v: any) => setPreambleType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="802.11">802.11</SelectItem>
                    <SelectItem value="LTE">LTE</SelectItem>
                    <SelectItem value="5G_NR">5G NR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleDetectPreamble} disabled={preambleMutation.isPending} className="w-full mb-4">
                {preambleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Detect
              </Button>
              {preambleResults && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Detected:</span><span className="font-mono">{preambleResults.detected ? 'YES' : 'NO'}</span></div>
                </div>
              )}
            </Card>
          </TabsContent>
          
          <TabsContent value="anomaly">
            <Card className="p-6 max-w-2xl">
              <h3 className="font-black text-lg mb-4">Anomaly Detection</h3>
              <div className="mb-4"><label className="block mb-2">Threshold: {(anomalyThreshold * 100).toFixed(0)}%</label><Slider value={[anomalyThreshold]} onValueChange={([v]) => setAnomalyThreshold(v)} min={0} max={1} step={0.05} /></div>
              <Button onClick={handleDetectAnomaly} disabled={anomalyMutation.isPending} className="w-full mb-4">
                {anomalyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Detect
              </Button>
              {anomalyResults && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Anomaly:</span><span className="font-mono">{anomalyResults.is_anomaly ? 'YES' : 'NO'}</span></div>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
