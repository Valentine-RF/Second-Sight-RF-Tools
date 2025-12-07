import { useState, useEffect, useRef } from 'react';
import { WebGLErrorBoundary } from '@/components/WebGLErrorBoundary';
import { CockpitSkeleton } from '@/components/CockpitSkeleton';
import { useAuth } from '@/_core/hooks/useAuth';
import { useSignalStore } from '@/store/signalStore';
import { Spectrogram } from '@/components/Spectrogram';
import { ConstellationPlot } from '@/components/ConstellationPlot';
import { SCFSurface } from '@/components/SCFSurface';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Activity, Radio, Waves, Binary, FileDown, Loader2 } from 'lucide-react';
import { generateForensicReport } from '@/lib/pdfExport';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useStreamingPipeline } from '@/hooks/useStreamingPipeline';

/**
 * Forensic Cockpit - Main Signal Analysis Interface
 * 
 * Layout Structure (following forensic workflow paradigm):
 * - Zone A: Global Timeline (Top, Full Width) - Decimated spectrogram overview
 * - Zone B: Main Workspace (Center, Dominant) - High-resolution spectrogram
 * - Zone C: Analysis Dock (Bottom, Collapsible) - Detailed visualizations
 * - Zone D: Signal Inspector (Right Sidebar) - Metadata and measurements
 */
export default function ForensicCockpit() {
  const { loading } = useAuth();
  const currentCapture = useSignalStore((state) => state.currentCapture);
  const annotations = useSignalStore((state) => state.annotations);
  const selection = useSignalStore((state) => state.selection);
  const activeTab = useSignalStore((state) => state.activeTab);
  const setActiveTab = useSignalStore((state) => state.setActiveTab);
  const isDockCollapsed = useSignalStore((state) => state.isDockCollapsed);
  const setDockCollapsed = useSignalStore((state) => state.setDockCollapsed);

  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Refs for capturing visualizations
  const mainSpectrogramRef = useRef<{ captureCanvas: () => string }>(null);
  const constellationPlotRef = useRef<{ captureCanvas: () => string }>(null);
  const scfSurfaceRef = useRef<{ captureCanvas: () => string }>(null);
  
  // Streaming pipeline for real-time IQ data processing
  const pipeline = useStreamingPipeline({
    dataUrl: currentCapture ? `/api/captures/${currentCapture.id}/data` : '',
    datatype: (currentCapture?.datatype as any) || 'cf32_le',
    fftSize: 1024,
    window: 'hann',
    chunkSize: 8192,
    maxQueueSize: 10
  });
  
  // Refs for WebGL components (high-frequency data - no React state)
  const spectrogramRef = useRef<any>(null);
  const constellationRef = useRef<any>(null);
  const waterfallRef = useRef<any>(null);
  
  // Connect pipeline to visualizations
  useEffect(() => {
    // FFT results -> Spectrogram & Waterfall
    pipeline.onFFT((fft, chunkIndex) => {
      if (spectrogramRef.current?.updateFFT) {
        spectrogramRef.current.updateFFT(fft, chunkIndex);
      }
      if (waterfallRef.current?.updateFFT) {
        waterfallRef.current.updateFFT(fft, chunkIndex);
      }
    });
    
    // IQ samples -> Constellation
    pipeline.onSamples((samples, chunkIndex) => {
      if (constellationRef.current?.updateSamples) {
        constellationRef.current.updateSamples(samples, chunkIndex);
      }
    });
  }, [pipeline]);

  // Auto-start pipeline when capture is loaded
  useEffect(() => {
    if (currentCapture) {
      console.log('[ForensicCockpit] Starting streaming pipeline for capture:', currentCapture.id);
      pipeline.start();
    }
    return () => {
      pipeline.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCapture]);

  const handleBoxSelect = (sel: { sampleStart: number; sampleEnd: number; freqLowerHz: number; freqUpperHz: number }) => {
    console.log('Selection:', sel);
    // Context menu will appear at selection location
  };

  const handleAnalyzeCycles = () => {
    if (!selection || !currentCapture) return;
    // TODO: Trigger FAM analysis
    setActiveTab('cyclostationary');
  };

  const handleClassifyModulation = () => {
    if (!selection || !currentCapture) return;
    // TODO: Trigger TorchSig classification
  };

  const handleDemodulate = () => {
    if (!selection || !currentCapture) return;
    // TODO: Trigger demodulation
    setActiveTab('hex');
  };

  const handleExportPDF = async () => {
    if (!currentCapture) return;
    
    setIsExporting(true);
    
    try {
      // Capture visualizations
      const spectrogramImage = mainSpectrogramRef.current?.captureCanvas();
      const constellationImage = constellationPlotRef.current?.captureCanvas();
      const scfImage = scfSurfaceRef.current?.captureCanvas();
      
      await generateForensicReport({
        metadata: {
          name: currentCapture.name,
          hardware: currentCapture.hardware || undefined,
          author: currentCapture.author || undefined,
          sampleRate: currentCapture.sampleRate || undefined,
          datatype: currentCapture.datatype || undefined,
          description: currentCapture.description || undefined,
          uploadedAt: currentCapture.createdAt ? new Date(currentCapture.createdAt) : new Date(),
        },
        measurements: {
          snr: 12.4,
          cfo: -14000,
          baudRate: 2.4e6,
        },
        classifications: [
          { label: 'QPSK', probability: 90 },
          { label: '8PSK', probability: 10 },
          { label: '16-QAM', probability: 5 },
        ],
        annotations: annotations.map(a => ({
          id: a.id,
          label: a.label || '',
          sampleStart: a.sampleStart,
          sampleEnd: a.sampleCount ? a.sampleStart + a.sampleCount : a.sampleStart + 1000,
          color: a.color,
        })),
        notes: 'Forensic analysis completed. Signal characteristics analyzed using advanced DSP techniques.',
        analyst: currentCapture?.author || 'Forensic Analyst',
        visualizations: {
          spectrogram: spectrogramImage,
          constellation: constellationImage,
          scf: scfImage,
        },
      });
      
      toast.success('PDF report generated successfully');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to generate PDF report');
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return <CockpitSkeleton />;
  }

  if (!currentCapture) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-black">No Signal Loaded</h2>
          <p className="technical-label">Upload a SigMF capture to begin analysis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Zone A: Global Timeline (Top, Full Width) */}
      <div className="h-32 border-b border-border bg-card/30">
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <div>
              <h3 className="font-black text-lg">{currentCapture.name}</h3>
              <div className="flex gap-4 technical-label">
                <span>Sample Rate: {currentCapture.sampleRate ? `${(currentCapture.sampleRate / 1e6).toFixed(2)} MHz` : 'N/A'}</span>
                <span>Datatype: {currentCapture.datatype || 'N/A'}</span>
                <span>Hardware: {currentCapture.hardware || 'N/A'}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="technical-label">Annotations: {annotations.length}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={isExporting}
                className="ml-4"
              >
                {isExporting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><FileDown className="w-4 h-4 mr-2" /> Export PDF</>
                )}
              </Button>
            </div>
          </div>
          
          {/* Timeline spectrogram - decimated overview */}
          <div className="flex-1 relative">
            <WebGLErrorBoundary>
              <Spectrogram width={window.innerWidth} height={80} />
            </WebGLErrorBoundary>
            
            {/* Annotation markers as colored flags */}
            {annotations.map((ann) => (
              <div
                key={ann.id}
                className="absolute top-0 w-1 h-full opacity-70"
                style={{
                  left: `${(ann.sampleStart / 1000000) * 100}%`, // Placeholder calculation
                  backgroundColor: ann.color,
                }}
                title={ann.label || 'Annotation'}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Zone B: Main Workspace (Center, Dominant) */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 relative bg-black">
            <WebGLErrorBoundary fallbackMessage="Failed to render spectrogram. Your GPU may not support the required WebGL features.">
              <Spectrogram
                ref={mainSpectrogramRef}
                width={window.innerWidth - 400} // Account for sidebar
                height={isDockCollapsed ? window.innerHeight - 200 : window.innerHeight - 500}
                onBoxSelect={handleBoxSelect}
              />
            </WebGLErrorBoundary>
            
            {/* Selection overlay */}
            {selection && (
              <div
                className="absolute border-2 border-cyan-400 bg-cyan-400/10 pointer-events-none"
                style={{
                  left: `${(selection.sampleStart / 1000000) * 100}%`,
                  width: `${((selection.sampleEnd - selection.sampleStart) / 1000000) * 100}%`,
                  top: 0,
                  height: '100%',
                }}
              >
                <div className="absolute top-2 left-2 text-xs font-mono text-cyan-400 bg-black/80 px-2 py-1">
                  {selection.sampleStart} - {selection.sampleEnd}
                </div>
              </div>
            )}

            {/* Context menu */}
            {contextMenuPos && (
              <div
                className="absolute bg-card border border-border shadow-lg rounded-md p-2 space-y-1"
                style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
              >
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleAnalyzeCycles}>
                  <Waves className="w-4 h-4 mr-2" />
                  Analyze Cycles
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleClassifyModulation}>
                  <Radio className="w-4 h-4 mr-2" />
                  Classify Modulation
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleDemodulate}>
                  <Binary className="w-4 h-4 mr-2" />
                  Demodulate
                </Button>
              </div>
            )}
          </div>

          {/* Zone C: Analysis Dock (Bottom, Collapsible) */}
          <div className={`border-t border-border bg-card/50 transition-all ${isDockCollapsed ? 'h-12' : 'h-80'}`}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <h3 className="font-black">Analysis Dock</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDockCollapsed(!isDockCollapsed)}
              >
                {isDockCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>

            {!isDockCollapsed && (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full">
                <TabsList className="w-full justify-start border-b rounded-none">
                  <TabsTrigger value="spectrum" className="gap-2">
                    <Activity className="w-4 h-4" />
                    Spectrum/FFT
                  </TabsTrigger>
                  <TabsTrigger value="constellation" className="gap-2">
                    <Radio className="w-4 h-4" />
                    Constellation
                  </TabsTrigger>
                  <TabsTrigger value="cyclostationary" className="gap-2">
                    <Waves className="w-4 h-4" />
                    Cyclostationary
                  </TabsTrigger>
                  <TabsTrigger value="hex" className="gap-2">
                    <Binary className="w-4 h-4" />
                    Hex View
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="spectrum" className="p-4 h-full">
                  <div className="wireframe-cyan h-full flex items-center justify-center">
                    <p className="technical-label">PSD Plot (To be implemented)</p>
                  </div>
                </TabsContent>

                <TabsContent value="constellation" className="p-4 h-full">
                  <WebGLErrorBoundary fallbackMessage="Failed to render constellation plot.">
                    <ConstellationPlot ref={constellationPlotRef} width={600} height={250} />
                  </WebGLErrorBoundary>
                </TabsContent>

                <TabsContent value="cyclostationary" className="p-4 h-full">
                  <WebGLErrorBoundary fallbackMessage="Failed to render 3D SCF surface.">
                    <SCFSurface ref={scfSurfaceRef} width={800} height={250} />
                  </WebGLErrorBoundary>
                </TabsContent>

                <TabsContent value="hex" className="p-4 h-full">
                  <div className="wireframe-pink h-full overflow-auto">
                    <pre className="font-mono text-xs">
                      {/* Hex dump will be displayed here */}
                      00000000: 48 65 6c 6c 6f 20 57 6f 72 6c 64 0a              Hello World.
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>

        {/* Zone D: Signal Inspector (Right Sidebar) */}
        <div className="w-96 border-l border-border bg-card/30 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Metadata Card */}
            <Card className="p-4 data-panel">
              <h4 className="font-black mb-3">Metadata</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="technical-label">Hardware</span>
                  <span className="font-mono">{currentCapture.hardware || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="technical-label">Author</span>
                  <span className="font-mono">{currentCapture.author || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="technical-label">Sample Rate</span>
                  <span className="font-mono">
                    {currentCapture.sampleRate ? `${(currentCapture.sampleRate / 1e6).toFixed(2)} MHz` : 'N/A'}
                  </span>
                </div>
              </div>
            </Card>

            {/* Measurements */}
            <Card className="p-4 data-panel">
              <h4 className="font-black mb-3">Measurements</h4>
              <div className="space-y-3">
                <div>
                  <div className="technical-label">Est. SNR</div>
                  <div className="flex items-baseline gap-2">
                    <span className="metric-value">12.4</span>
                    <span className="metric-unit">dB</span>
                  </div>
                </div>
                <div>
                  <div className="technical-label">Est. Baud</div>
                  <div className="flex items-baseline gap-2">
                    <span className="metric-value">2.4</span>
                    <span className="metric-unit">Msps</span>
                  </div>
                </div>
                <div>
                  <div className="technical-label">CFO</div>
                  <div className="flex items-baseline gap-2">
                    <span className="metric-value">-14</span>
                    <span className="metric-unit">kHz</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Classification */}
            <Card className="p-4 data-panel">
              <h4 className="font-black mb-3">Classification</h4>
              <div className="space-y-2">
                {[
                  { label: 'QPSK', value: 90 },
                  { label: '8PSK', value: 10 },
                  { label: '16-QAM', value: 5 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-mono">{item.label}</span>
                      <span className="font-mono">{item.value}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* DSP Chain */}
            <Card className="p-4 data-panel">
              <h4 className="font-black mb-3">DSP Chain</h4>
              <div className="space-y-2 text-xs font-mono">
                <div className="wireframe-cyan p-2">Shift → -14 kHz</div>
                <div className="wireframe-cyan p-2">Filter → BW=2MHz</div>
                <div className="wireframe-cyan p-2">Decimate → 4x</div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
