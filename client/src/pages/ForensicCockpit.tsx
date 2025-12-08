import { useState, useEffect, useRef } from 'react';
import { WebGLErrorBoundary } from '@/components/WebGLErrorBoundary';
import { CockpitSkeleton } from '@/components/CockpitSkeleton';
import { useAuth } from '@/_core/hooks/useAuth';
import { Header } from '@/components/Header';
import { useSignalStore } from '@/store/signalStore';
import { Spectrogram } from '@/components/Spectrogram';
import { ConstellationPlot } from '@/components/ConstellationPlot';
import SCFSurface3D from '@/components/SCFSurface3D';
import { FFTPSDPlot } from '@/components/FFTPSDPlot';
import { HexView } from '@/components/HexView';
import { AnnotationStatistics } from '@/components/AnnotationStatistics';
import { HopPatternVisualization } from '@/components/HopPatternVisualization';
import { SDRStreamingPanel } from '@/components/SDRStreamingPanel';
import { GeolocationPanel } from '@/components/GeolocationPanel';
import { AnomalyDetectionPanel } from '@/components/AnomalyDetectionPanel';
import { CompressiveSensingPanel } from '@/components/CompressiveSensingPanel';
import { ProtocolIdentificationPanel } from '@/components/ProtocolIdentificationPanel';
import { SDRControlPanel } from '@/components/SDRControlPanel';
import { AnnotationEditDialog } from '@/components/AnnotationEditDialog';
import SignalContextMenu, { type SignalSelection } from '@/components/SignalContextMenu';
import CyclicProfilePanel from '@/components/CyclicProfilePanel';
import AnnotationDialog from '@/components/AnnotationDialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Activity, Radio, Waves, Binary, FileDown, Loader2, Plus, Minus, Move, MapPin, Shield, Zap, Wifi, Settings } from 'lucide-react';
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
  // const annotations = useSignalStore((state) => state.annotations); // Replaced by tRPC query
  const selection = useSignalStore((state) => state.selection);
  const activeTab = useSignalStore((state) => state.activeTab);
  const setActiveTab = useSignalStore((state) => state.setActiveTab);
  const isDockCollapsed = useSignalStore((state) => state.isDockCollapsed);
  const setDockCollapsed = useSignalStore((state) => state.setDockCollapsed);

  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [scfData, setScfData] = useState<any>(null);
  const [showCyclicProfile, setShowCyclicProfile] = useState(true);
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false);
  
  // Load annotations for current capture from database
  const { data: savedAnnotations = [] } = trpc.annotations.list.useQuery(
    { captureId: currentCapture?.id || 0 },
    { enabled: !!currentCapture }
  );
  
  // tRPC mutations for FAM and classification
  const analyzeCyclesMutation = trpc.captures.analyzeCycles.useMutation({
    onSuccess: (data) => {
      setScfData(data);
      setActiveTab('cyclostationary');
      toast.success('Cyclostationary analysis complete!');
    },
    onError: (error) => {
      toast.error(`FAM analysis failed: ${error.message}`);
    },
  });
  
  const [classificationResults, setClassificationResults] = useState<any[]>([]);
  const [fftData, setFftData] = useState<any>(null);
  const [demodData, setDemodData] = useState<any>(null);
  const [demodResult, setDemodResult] = useState<any>(null);
  const [hopResult, setHopResult] = useState<any>(null);
  const [annotationSearchText, setAnnotationSearchText] = useState('');
  const [annotationFilterModulation, setAnnotationFilterModulation] = useState('all');
  const [annotationMinSNR, setAnnotationMinSNR] = useState(-100);
  const [editingAnnotation, setEditingAnnotation] = useState<any>(null);
  const [annotationEditOpen, setAnnotationEditOpen] = useState(false);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<SignalSelection | null>(null);
  
  // Dock resize state
  const [dockHeight, setDockHeight] = useState<number>(() => {
    const saved = localStorage.getItem('cockpit-dock-height');
    return saved ? parseInt(saved, 10) : 512; // Default 32rem = 512px
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [resizeStartHeight, setResizeStartHeight] = useState(0);
  
  // Dock resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true);
    setResizeStartY(e.clientY);
    setResizeStartHeight(dockHeight);
    e.preventDefault();
  };
  
  useEffect(() => {
    if (!isResizing) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = resizeStartY - e.clientY; // Inverted: dragging up increases height
      const newHeight = Math.max(200, Math.min(800, resizeStartHeight + deltaY)); // Min 200px, max 800px
      setDockHeight(newHeight);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem('cockpit-dock-height', dockHeight.toString());
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStartY, resizeStartHeight, dockHeight]);
  
  const demodMutation = trpc.captures.demodulate.useMutation({
    onSuccess: (data) => {
      setDemodResult(data);
      setActiveTab('hex');
      toast.success('Demodulation complete');
    },
    onError: (error: any) => {
      toast.error(`Demodulation failed: ${error.message}`);
    },
  });

  const hopMutation = trpc.captures.detectHopping.useMutation({
    onSuccess: (data) => {
      if (data) {
        // Store hop result for visualization
        setHopResult(data);
        toast.success(`Detected ${data.hops.length} frequency hops (${data.pattern} pattern)`);
      } else {
        toast.info('No frequency hopping detected');
      }
    },
    onError: (error: any) => {
      toast.error(`Hopping detection failed: ${error.message}`);
    },
  });
  
  const computeFFTMutation = trpc.captures.computeFFT.useMutation({
    onSuccess: (data) => {
      setFftData(data);
      setActiveTab('spectrum');
      toast.success('FFT spectrum computed!');
    },
    onError: (error) => {
      toast.error(`FFT computation failed: ${error.message}`);
      setFftData(null);
    },
  });
  
  const classifyModulationMutation = trpc.captures.classifyModulation.useMutation({
    onSuccess: (data) => {
      const topPrediction = data.predictions[0];
      setClassificationResults(data.predictions);
      toast.success(`Classified as ${topPrediction.modulation} (${topPrediction.confidence.toFixed(1)}%)`);
    },
    onError: (error) => {
      toast.error(`Classification failed: ${error.message}`);
      setClassificationResults([]);
    },
  });
  
  const createAnnotationMutation = trpc.annotations.create.useMutation({
    onSuccess: () => {
      toast.success('Annotation saved successfully!');
      trpc.useUtils().annotations.list.invalidate();
    },
  });
  
  const updateAnnotationMutation = trpc.annotations.update.useMutation({
    onSuccess: () => {
      toast.success('Annotation updated');
      trpc.useUtils().annotations.list.invalidate();
    },
  });
  
  const deleteAnnotationMutation = trpc.annotations.delete.useMutation({
    onSuccess: () => {
      toast.success('Annotation deleted');
      trpc.useUtils().annotations.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to save annotation: ${error.message}`);
    },
  });
  
  const [measurementsData, setMeasurementsData] = useState<any>(null);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete key - remove selected annotation
      if (e.key === 'Delete' && selectedAnnotationId) {
        deleteAnnotationMutation.mutate({ id: selectedAnnotationId });
        setSelectedAnnotationId(null);
      }
      
      // Ctrl+E - edit selected annotation
      if (e.ctrlKey && e.key === 'e' && selectedAnnotationId) {
        e.preventDefault();
        const annotation = savedAnnotations.find((a: any) => a.id === selectedAnnotationId);
        if (annotation) {
          setEditingAnnotation(annotation);
          setAnnotationEditOpen(true);
        }
      }
      
      // Escape - clear selection
      if (e.key === 'Escape') {
        setSelectedAnnotationId(null);
        setContextMenuPos(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnotationId, savedAnnotations]);
  const [modulationType, setModulationType] = useState<string>('QPSK');
  const estimateSNRCFOMutation = trpc.captures.estimateSNRCFO.useMutation({
    onSuccess: (data) => {
      setMeasurementsData(data);
      console.log('SNR/CFO estimation complete:', data);
    },
    onError: (error) => {
      console.error('SNR/CFO estimation failed:', error);
      toast.error(`Measurement failed: ${error.message}`);
      setMeasurementsData(null);
    },
  });
  
  // Auto-trigger SNR/CFO estimation when selection or modulation type changes
  useEffect(() => {
    if (selection && currentCapture) {
      const sampleStart = selection.sampleStart;
      const sampleEnd = selection.sampleEnd;
      const sampleCount = sampleEnd - sampleStart;
      
      if (sampleCount > 0 && sampleCount < 1e6) { // Limit to 1M samples
        estimateSNRCFOMutation.mutate({
          captureId: currentCapture.id,
          sampleStart,
          sampleCount,
          modulationType: modulationType,
        });
      } else if (sampleCount >= 1e6) {
        toast.error('Selection too large for measurement (max 1M samples)');
        setMeasurementsData(null);
      } else {
        // Clear measurements when selection is cleared
        setMeasurementsData(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, currentCapture, modulationType]);
  
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

  const handleBoxSelect = (sel: { sampleStart: number; sampleEnd: number; freqLowerHz: number; freqUpperHz: number }, event?: MouseEvent) => {
    console.log('Selection:', sel);
    
    // Show context menu at mouse position if available
    if (event) {
      setContextMenuPos({ x: event.clientX, y: event.clientY });
    }
  };
  
  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuPos) {
        setContextMenuPos(null);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenuPos]);

  const handleAnalyzeCycles = () => {
    if (!selection || !currentCapture) return;
    
    const sampleCount = selection.sampleEnd - selection.sampleStart;
    
    analyzeCyclesMutation.mutate({
      captureId: currentCapture.id,
      sampleStart: selection.sampleStart,
      sampleCount,
    });
    
    setContextMenuPos(null);
  };
  
  const handleComputeSpectrum = () => {
    if (!selection || !currentCapture) return;
    
    const sampleCount = selection.sampleEnd - selection.sampleStart;
    
    computeFFTMutation.mutate({
      captureId: currentCapture.id,
      sampleStart: selection.sampleStart,
      sampleCount,
      nfft: 2048,
    });
    
    setContextMenuPos(null);
  };

  const handleClassifyModulation = () => {
    if (!selection || !currentCapture) return;
    
    const sampleCount = selection.sampleEnd - selection.sampleStart;
    
    classifyModulationMutation.mutate({
      captureId: currentCapture.id,
      sampleStart: selection.sampleStart,
      sampleCount,
    });
    
    setContextMenuPos(null);
  };
  
  const handleSaveAnnotation = () => {
    if (!selection || !currentCapture) return;
    
    const sampleCount = selection.sampleEnd - selection.sampleStart;
    const sampleRate = currentCapture.sampleRate || 1;
    
    const annotationData: SignalSelection = {
      sampleStart: selection.sampleStart,
      sampleCount,
      timeStart: selection.sampleStart / sampleRate,
      timeEnd: selection.sampleEnd / sampleRate,
      freqStart: selection.freqLowerHz,
      freqEnd: selection.freqUpperHz,
    };
    
    setPendingAnnotation(annotationData);
    setAnnotationDialogOpen(true);
    setContextMenuPos(null);
  };

  const handleDemodulate = () => {
    if (!selection || !currentCapture) return;
    
    const sampleCount = selection.sampleEnd - selection.sampleStart;
    
    // Auto-detect mode based on modulation type or use CW as default
    const mode = modulationType.includes('PSK') ? 'PSK31' : 
                 modulationType.includes('RTTY') || modulationType.includes('FSK') ? 'RTTY' : 'CW';
    
    demodMutation.mutate({
      captureId: currentCapture.id,
      sampleStart: selection.sampleStart,
      sampleCount,
      mode,
      baudRate: 45.45,
      shift: 170,
      wpm: 20,
    });
    
    setContextMenuPos(null);
  };

  const exportReportMutation = trpc.captures.exportReport.useMutation();

  const handleExportPDF = async () => {
    if (!currentCapture) return;
    
    setIsExporting(true);
    
    try {
      const result = await exportReportMutation.mutateAsync({
        captureId: currentCapture.id,
        includeAnnotations: true,
        includeClassification: false,
        includeCyclicProfile: false,
      });

      // Download PDF
      const blob = new Blob(
        [Uint8Array.from(atob(result.pdf), c => c.charCodeAt(0))],
        { type: 'application/pdf' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('PDF report exported successfully');
    } catch (error) {
      console.error('PDF export failed:', error);
      toast.error('Failed to export PDF report');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDFOld = async () => {
    if (!currentCapture) return;
    
    setIsExporting(true);
    
    try {
      // Capture visualizations
      const spectrogramImage = {} as any; // mainSpectrogramRef.current?.captureCanvas();
      const constellationImage = {} as any; // constellationPlotRef.current?.captureCanvas();
      const scfImage = {} as any; // scfSurfaceRef.current?.captureCanvas();
      
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
        annotations: savedAnnotations.map(a => ({
          id: a.id,
          label: a.label || '',
          sampleStart: a.sampleStart,
          sampleEnd: a.sampleCount ? a.sampleStart + a.sampleCount : a.sampleStart + 1000,
          color: a.color || '#3b82f6',
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

  // Show empty state message in the header when no capture is loaded
  const emptyState = !currentCapture;

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      {/* Zone A: Global Timeline (Top, Full Width) */}
      <div className="h-32 border-b border-border bg-card/30">
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <div>
              {emptyState ? (
                <>
                  <h3 className="font-black text-lg">No Signal Loaded</h3>
                  <p className="technical-label">Upload a SigMF capture from the File Manager to begin analysis</p>
                </>
              ) : (
                <>
                  <h3 className="font-black text-lg">{currentCapture?.name}</h3>
                  <div className="flex gap-4 technical-label">
                    <span>Sample Rate: {currentCapture?.sampleRate ? `${(currentCapture.sampleRate / 1e6).toFixed(2)} MHz` : 'N/A'}</span>
                    <span>Datatype: {currentCapture?.datatype || 'N/A'}</span>
                    <span>Hardware: {currentCapture?.hardware || 'N/A'}</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <span className="technical-label">Annotations: {savedAnnotations.length}</span>
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
            {savedAnnotations.map((ann) => (
              <div
                key={ann.id}
                className="absolute top-0 w-1 h-full opacity-70"
                style={{
                  left: `${(ann.sampleStart / 1000000) * 100}%`, // Placeholder calculation
                  backgroundColor: ann.color || '#3b82f6',
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
            <SignalContextMenu
              selection={selection ? {
                sampleStart: selection.sampleStart,
                sampleCount: selection.sampleEnd - selection.sampleStart,
                timeStart: selection.sampleStart / (currentCapture?.sampleRate || 1e6),
                timeEnd: selection.sampleEnd / (currentCapture?.sampleRate || 1e6),
                freqStart: 0,
                freqEnd: (currentCapture?.sampleRate || 1e6) / 2,
              } : null}
              captureId={currentCapture?.id || 0}
              onDetectHopping={(sel) => {
                if (!currentCapture) return;
                hopMutation.mutate({
                  captureId: currentCapture.id,
                  sampleStart: sel.sampleStart,
                  sampleCount: sel.sampleCount,
                });
              }}
              onAnalyzeCycles={(sel) => {
                if (!currentCapture) return;
                analyzeCyclesMutation.mutate({
                  captureId: currentCapture.id,
                  sampleStart: sel.sampleStart,
                  sampleCount: sel.sampleCount,
                  nfft: 256,
                  overlap: 0.5,
                  alphaMax: 0.5,
                });
              }}
              onClassifyModulation={(sel) => {
                if (!currentCapture) return;
                classifyModulationMutation.mutate({
                  captureId: currentCapture.id,
                  sampleStart: sel.sampleStart,
                  sampleCount: Math.min(sel.sampleCount, 4096),  // Limit to 4096 samples
                });
              }}
              onSaveAnnotation={(sel) => {
                setPendingAnnotation(sel);
                setAnnotationDialogOpen(true);
              }}
              onViewDetails={(sel) => {
                toast.info(`Selection: ${sel.sampleCount} samples, ${(sel.timeEnd - sel.timeStart).toFixed(3)}s`);
              }}
            >
              <div className="relative w-full h-full">
                {/* Zoom Controls */}
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-card/90 backdrop-blur"
                    title="Zoom in (Mouse wheel up)"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-card/90 backdrop-blur"
                    title="Zoom out (Mouse wheel down)"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-card/90 backdrop-blur"
                    title="Pan (Click and drag)"
                  >
                    <Move className="w-4 h-4" />
                  </Button>
                </div>
                
                <WebGLErrorBoundary fallbackMessage="Failed to render spectrogram. Your GPU may not support the required WebGL features.">
                  <Spectrogram
                    ref={mainSpectrogramRef}
                    width={window.innerWidth - 400} // Account for sidebar
                    height={isDockCollapsed ? window.innerHeight - 200 : window.innerHeight - 500}
                    onBoxSelect={handleBoxSelect}
                  />
                </WebGLErrorBoundary>
              </div>
            </SignalContextMenu>
            
            {/* Cyclic Profile Overlay */}
            {showCyclicProfile && scfData?.cyclicProfile && (
              <CyclicProfilePanel
                cyclicProfile={scfData.cyclicProfile}
                cyclicFreqs={scfData.cyclicFreqs}
                onClose={() => setShowCyclicProfile(false)}
                width={220}
                height={450}
              />
            )}
            
            {/* Saved Annotations Overlay */}
            {savedAnnotations.map((annotation) => (
              <div
                key={annotation.id}
                className={`absolute border-2 pointer-events-auto cursor-pointer hover:opacity-80 transition-all ${
                  selectedAnnotationId === annotation.id ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-black' : ''
                }`}
                style={{
                  left: `${(annotation.sampleStart / 1000000) * 100}%`,  // TODO: Calculate proper position from sample rate
                  width: `${(annotation.sampleCount / 1000000) * 100}%`,
                  top: 0,
                  height: '100%',
                  borderColor: annotation.color || '#3b82f6',
                  backgroundColor: `${annotation.color || '#3b82f6'}30`, // Increased opacity from 20 to 30
                  borderWidth: selectedAnnotationId === annotation.id ? '3px' : '2px',
                }}
                title={annotation.label || 'Annotation'}
                onClick={() => setSelectedAnnotationId(annotation.id)}
                onDoubleClick={() => {
                  setEditingAnnotation(annotation);
                  setAnnotationEditOpen(true);
                }}
              >
                {/* Annotation Label */}
                <div
                  className="absolute top-0 left-0 px-2 py-1 text-xs font-semibold rounded-br"
                  style={{
                    backgroundColor: annotation.color || '#3b82f6',
                    color: '#ffffff',
                  }}
                >
                  {annotation.label}
                </div>
                
                {/* Drag Handles for Resizing */}
                {selectedAnnotationId === annotation.id && (
                  <>
                    {/* Left resize handle */}
                    <div
                      className="absolute left-0 top-0 w-2 h-full bg-yellow-400/50 cursor-ew-resize hover:bg-yellow-400"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        // TODO: Implement drag resize logic
                        toast.info('Drag to resize annotation (not yet implemented)');
                      }}
                      title="Drag to resize start"
                    />
                    {/* Right resize handle */}
                    <div
                      className="absolute right-0 top-0 w-2 h-full bg-yellow-400/50 cursor-ew-resize hover:bg-yellow-400"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        // TODO: Implement drag resize logic
                        toast.info('Drag to resize annotation (not yet implemented)');
                      }}
                      title="Drag to resize end"
                    />
                  </>
                )}
                
                {/* Delete Button */}
                <button
                  className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-bl hover:bg-red-600"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete annotation "${annotation.label}"?`)) {
                      await trpc.annotations.delete.useMutation().mutateAsync({ id: annotation.id });
                      toast.success('Annotation deleted');
                    }
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            
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
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSaveAnnotation}>
                  <FileDown className="w-4 h-4 mr-2" />
                  Save as Annotation
                </Button>
                <div className="border-t border-border my-1" />
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleComputeSpectrum}>
                  <Activity className="w-4 h-4 mr-2" />
                  Compute Spectrum
                </Button>
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
          {!isDockCollapsed && (
            <div
              className="h-1.5 bg-card/50 hover:bg-cyan-500/20 cursor-ns-resize transition-colors relative group flex items-center justify-center border-y border-border"
              onMouseDown={handleResizeStart}
              style={{ userSelect: 'none' }}
            >
              {/* Grip dots indicator */}
              <div className="flex gap-1">
                <div className="w-1 h-1 rounded-full bg-border group-hover:bg-cyan-500 transition-colors" />
                <div className="w-1 h-1 rounded-full bg-border group-hover:bg-cyan-500 transition-colors" />
                <div className="w-1 h-1 rounded-full bg-border group-hover:bg-cyan-500 transition-colors" />
              </div>
            </div>
          )}
          <div className={`border-t border-border bg-card/50 flex flex-col ${isDockCollapsed ? 'h-12' : ''}`} style={!isDockCollapsed ? { height: `${dockHeight}px` } : undefined}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0">
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
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="w-full justify-start border-b rounded-none flex-shrink-0">
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
                  <TabsTrigger value="geolocation" className="gap-2">
                    <MapPin className="w-4 h-4" />
                    Geolocation
                  </TabsTrigger>
                  <TabsTrigger value="anomaly" className="gap-2">
                    <Shield className="w-4 h-4" />
                    Anomaly Detection
                  </TabsTrigger>
                  <TabsTrigger value="compressive" className="gap-2">
                    <Zap className="w-4 h-4" />
                    Compressive Sensing
                  </TabsTrigger>
                  <TabsTrigger value="protocol" className="gap-2">
                    <Wifi className="w-4 h-4" />
                    Protocol ID
                  </TabsTrigger>
                  <TabsTrigger value="sdr" className="gap-2">
                    <Settings className="w-4 h-4" />
                    SDR Control
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="spectrum" className="p-4 flex-1 overflow-auto">
                  <FFTPSDPlot
                    frequencies={fftData?.frequencies || []}
                    magnitudes={fftData?.magnitudes || []}
                    centerFreq={fftData?.centerFreq || 0}
                    width={window.innerWidth - 400}
                    height={250}
                  />
                </TabsContent>

                <TabsContent value="constellation" className="p-4 flex-1 overflow-auto">
                  <WebGLErrorBoundary fallbackMessage="Failed to render constellation plot.">
                    <ConstellationPlot ref={constellationPlotRef} width={600} height={250} />
                  </WebGLErrorBoundary>
                </TabsContent>

                <TabsContent value="cyclostationary" className="p-0 flex-1 overflow-auto">
                  <WebGLErrorBoundary fallbackMessage="Failed to render 3D SCF surface.">
                    <SCFSurface3D
                      scfMagnitude={scfData?.scfMagnitude || []}
                      spectralFreqs={scfData?.spectralFreqs || []}
                      cyclicFreqs={scfData?.cyclicFreqs || []}
                      shape={scfData?.shape || { cyclic: 0, spectral: 0 }}
                      colormap="viridis"
                    />
                  </WebGLErrorBoundary>
                </TabsContent>

                <TabsContent value="hex" className="p-0 flex-1 overflow-auto relative">
                  {demodData && (
                    <div className="absolute top-2 right-2 z-10 flex gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const data = JSON.stringify(demodData, null, 2);
                          const blob = new Blob([data], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `demod_${demodData.mode}_${Date.now()}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toast.success('Demodulation results downloaded (JSON)');
                        }}
                        className="h-7 px-2"
                        title="Download JSON"
                      >
                        JSON
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const data = `Mode: ${demodData.mode}\nConfidence: ${demodData.confidence}%\n\nDecoded Text:\n${demodData.decoded}\n\nBitstream:\n${demodData.bitstream}`;
                          const blob = new Blob([data], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `demod_${demodData.mode}_${Date.now()}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toast.success('Demodulation results downloaded (TXT)');
                        }}
                        className="h-7 px-2"
                        title="Download TXT"
                      >
                        TXT
                      </Button>
                    </div>
                  )}
                  <HexView
                    bitstream={demodData?.bitstream || ''}
                    decoded={demodData?.decoded || ''}
                    mode={demodData?.mode || 'CW'}
                    confidence={demodData?.confidence || 0}
                  />
                </TabsContent>

                <TabsContent value="geolocation" className="p-4 flex-1 overflow-auto">
                  <GeolocationPanel
                    captureId={currentCapture?.id || 0}
                    onResult={(result) => {
                      toast.success(`Emitter located at ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`);
                    }}
                  />
                </TabsContent>

                <TabsContent value="anomaly" className="p-4 flex-1 overflow-auto">
                  <AnomalyDetectionPanel
                    captureId={currentCapture?.id || 0}
                    onAnomaly={(anomaly) => {
                      toast.warning(`Anomaly detected: ${anomaly.type}`);
                    }}
                    onThreat={(threat) => {
                      toast.error(`Threat detected: ${threat.type} (${threat.severity})`);
                    }}
                  />
                </TabsContent>

                <TabsContent value="compressive" className="p-4 flex-1 overflow-auto">
                  <CompressiveSensingPanel
                    captureId={currentCapture?.id || 0}
                    sampleStart={selection?.sampleStart || 0}
                    sampleCount={selection ? (selection.sampleEnd - selection.sampleStart) : 65536}
                    onResult={(result) => {
                      toast.success(`Sparse recovery complete: ${result.support.length} components`);
                    }}
                  />
                </TabsContent>

                <TabsContent value="protocol" className="p-4 flex-1 overflow-auto">
                  <ProtocolIdentificationPanel
                    captureId={currentCapture?.id || 0}
                    sampleStart={selection?.sampleStart || 0}
                    sampleCount={selection ? (selection.sampleEnd - selection.sampleStart) : 65536}
                    onResult={(result) => {
                      toast.success(`Protocol identified: ${result.protocol} (${(result.confidence * 100).toFixed(1)}% confidence)`);
                    }}
                  />
                </TabsContent>

                <TabsContent value="sdr" className="p-4 flex-1 overflow-auto">
                  <SDRControlPanel
                    onStreamData={(data) => {
                      // Handle IQ data stream
                      console.log('IQ data received:', data.numSamples);
                    }}
                    onFFTData={(fft) => {
                      // Update FFT display
                      setFftData({
                        frequencies: Array.from(fft.frequencies),
                        magnitudes: Array.from(fft.magnitudes),
                        centerFreq: fft.centerFreq,
                      });
                    }}
                    onConnect={(device) => {
                      toast.success(`Connected to ${device.label}`);
                    }}
                    onDisconnect={() => {
                      toast.info('SDR disconnected');
                    }}
                  />
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
                  <span className="font-mono">{currentCapture?.hardware || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="technical-label">Author</span>
                  <span className="font-mono">{currentCapture?.author || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="technical-label">Sample Rate</span>
                  <span className="font-mono">
                    {currentCapture?.sampleRate ? `${(currentCapture.sampleRate / 1e6).toFixed(2)} MHz` : 'N/A'}
                  </span>
                </div>
              </div>
            </Card>

            {/* Measurements */}
            <Card className="p-4 data-panel">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-black">Measurements</h4>
                {estimateSNRCFOMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              
              {/* Modulation Type Selector */}
              <div className="mb-3">
                <div className="technical-label mb-1.5">Modulation Type</div>
                <Select value={modulationType} onValueChange={setModulationType}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px]">
                    {/* Digital Modulations */}
                    <SelectItem value="BPSK">BPSK</SelectItem>
                    <SelectItem value="QPSK">QPSK</SelectItem>
                    <SelectItem value="8PSK">8PSK</SelectItem>
                    <SelectItem value="16-QAM">16-QAM</SelectItem>
                    <SelectItem value="64-QAM">64-QAM</SelectItem>
                    <SelectItem value="FSK">FSK</SelectItem>
                    <SelectItem value="GMSK">GMSK</SelectItem>
                    <SelectItem value="OOK">OOK</SelectItem>
                    
                    {/* RTTY Variants */}
                    <SelectItem value="RTTY-45">RTTY 45.45 Baud</SelectItem>
                    <SelectItem value="RTTY-50">RTTY 50 Baud</SelectItem>
                    <SelectItem value="RTTY-75">RTTY 75 Baud</SelectItem>
                    <SelectItem value="RTTY-100">RTTY 100 Baud</SelectItem>
                    
                    {/* Maritime/Commercial */}
                    <SelectItem value="SITOR-A">SITOR-A</SelectItem>
                    <SelectItem value="SITOR-B">SITOR-B</SelectItem>
                    <SelectItem value="NAVTEX">NAVTEX</SelectItem>
                    <SelectItem value="AMTOR">AMTOR</SelectItem>
                    
                    {/* Packet Radio */}
                    <SelectItem value="PACTOR-I">PACTOR-I</SelectItem>
                    <SelectItem value="PACTOR-II">PACTOR-II</SelectItem>
                    <SelectItem value="PACTOR-III">PACTOR-III</SelectItem>
                    <SelectItem value="PACTOR-IV">PACTOR-IV</SelectItem>
                    <SelectItem value="CLOVER-2000">CLOVER-2000</SelectItem>
                    <SelectItem value="G-TOR">G-TOR</SelectItem>
                    
                    {/* PSK Modes */}
                    <SelectItem value="PSK31">PSK31</SelectItem>
                    <SelectItem value="PSK63">PSK63</SelectItem>
                    <SelectItem value="PSK125">PSK125</SelectItem>
                    
                    {/* MFSK Modes */}
                    <SelectItem value="MFSK16">MFSK16</SelectItem>
                    <SelectItem value="MFSK32">MFSK32</SelectItem>
                    <SelectItem value="Olivia">Olivia</SelectItem>
                    <SelectItem value="Contestia">Contestia</SelectItem>
                    <SelectItem value="DominoEX">DominoEX</SelectItem>
                    <SelectItem value="THROB">THROB</SelectItem>
                    <SelectItem value="MT63">MT63</SelectItem>
                    
                    {/* Weak Signal Modes */}
                    <SelectItem value="FT8">FT8</SelectItem>
                    <SelectItem value="FT4">FT4</SelectItem>
                    <SelectItem value="JT65">JT65</SelectItem>
                    <SelectItem value="JT9">JT9</SelectItem>
                    <SelectItem value="WSPR">WSPR</SelectItem>
                    <SelectItem value="ROS">ROS</SelectItem>
                    
                    {/* Military/Government */}
                    <SelectItem value="STANAG-4285">STANAG 4285</SelectItem>
                    <SelectItem value="MIL-188-110A">MIL-STD-188-110A</SelectItem>
                    <SelectItem value="MIL-188-110B">MIL-STD-188-110B</SelectItem>
                    <SelectItem value="ALE">ALE (Auto Link Est.)</SelectItem>
                    
                    {/* Legacy Modes */}
                    <SelectItem value="CW">CW (Morse Code)</SelectItem>
                    <SelectItem value="Hellschreiber">Hellschreiber</SelectItem>
                    <SelectItem value="CHIP64">CHIP64</SelectItem>
                    <SelectItem value="CHIP128">CHIP128</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Modulation hint improves SNR estimation accuracy
                </p>
              </div>
              {measurementsData ? (
                <div className="space-y-3">
                  <div>
                    <div className="technical-label">SNR (M2M4)</div>
                    <div className="flex items-baseline gap-2">
                      <span className="metric-value">
                        {measurementsData.snr.snr_db !== null 
                          ? measurementsData.snr.snr_db.toFixed(1) 
                          : 'N/A'}
                      </span>
                      <span className="metric-unit">dB</span>
                    </div>
                  </div>
                  <div>
                    <div className="technical-label">Signal Power</div>
                    <div className="flex items-baseline gap-2">
                      <span className="metric-value">
                        {measurementsData.snr.signal_power_db !== null
                          ? measurementsData.snr.signal_power_db.toFixed(1)
                          : 'N/A'}
                      </span>
                      <span className="metric-unit">dBm</span>
                    </div>
                  </div>
                  {measurementsData.cfo && (
                    <div>
                      <div className="technical-label">CFO</div>
                      <div className="flex items-baseline gap-2">
                        <span className="metric-value">
                          {(measurementsData.cfo.cfo_hz / 1000).toFixed(1)}
                        </span>
                        <span className="metric-unit">kHz</span>
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="technical-label">M2/M4 Ratio</div>
                    <div className="flex items-baseline gap-2">
                      <span className="metric-value">
                        {measurementsData.snr.m2m4_ratio.toFixed(3)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Teletype-specific parameters */}
                  {modulationType.includes('RTTY') && measurementsData.teletype && (
                    <>
                      <div className="border-t border-border pt-3 mt-3">
                        <div className="technical-label text-xs mb-2">RTTY Parameters</div>
                      </div>
                      <div>
                        <div className="technical-label">Baud Rate</div>
                        <div className="flex items-baseline gap-2">
                          <span className="metric-value text-sm">
                            {measurementsData.teletype.baudRate?.toFixed(1) || 'N/A'}
                          </span>
                          <span className="metric-unit">Bd</span>
                        </div>
                      </div>
                      <div>
                        <div className="technical-label">Shift</div>
                        <div className="flex items-baseline gap-2">
                          <span className="metric-value text-sm">
                            {measurementsData.teletype.shift?.toFixed(0) || 'N/A'}
                          </span>
                          <span className="metric-unit">Hz</span>
                        </div>
                      </div>
                      <div>
                        <div className="technical-label">Mark/Space</div>
                        <div className="font-mono text-xs">
                          {measurementsData.teletype.markFreq?.toFixed(0) || '0'} / {measurementsData.teletype.spaceFreq?.toFixed(0) || '0'} Hz
                        </div>
                      </div>
                    </>
                  )}
                  
                  {(modulationType.includes('PSK') || modulationType.includes('FT8') || modulationType === 'CW') && measurementsData.teletype && (
                    <>
                      <div className="border-t border-border pt-3 mt-3">
                        <div className="technical-label text-xs mb-2">Digital Mode Info</div>
                      </div>
                      {measurementsData.teletype.bandwidth && (
                        <div>
                          <div className="technical-label">Bandwidth</div>
                          <div className="flex items-baseline gap-2">
                            <span className="metric-value text-sm">
                              {measurementsData.teletype.bandwidth}
                            </span>
                            <span className="metric-unit">Hz</span>
                          </div>
                        </div>
                      )}
                      {measurementsData.teletype.toneCount && (
                        <div>
                          <div className="technical-label">Tone Count</div>
                          <div className="metric-value text-sm">
                            {measurementsData.teletype.toneCount}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {selection ? 'Analyzing selection...' : 'Select a region to measure'}
                </div>
              )}
            </Card>

            {/* Classification */}
            <Card className="p-4 data-panel">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-black">Classification</h4>
                {classificationResults.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const data = JSON.stringify(classificationResults, null, 2);
                      const blob = new Blob([data], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `classification_${currentCapture?.name || 'signal'}_${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success('Classification results downloaded');
                    }}
                    className="h-7 px-2"
                  >
                    <FileDown className="w-3 h-3" />
                  </Button>
                )}
              </div>
              {classificationResults.length > 0 ? (
                <div className="space-y-2">
                  {classificationResults.slice(0, 5).map((item) => (
                    <div key={item.modulation}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-mono">{item.modulation}</span>
                        <span className="font-mono">{item.confidence.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${item.confidence}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Select a region and classify to see results
                </div>
              )}
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

            {/* Annotation Filtering */}
            {currentCapture && savedAnnotations.length > 0 && (
              <Card className="p-4 space-y-3">
                <h3 className="text-sm font-semibold text-cyan-400">Filter Annotations</h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Search labels..."
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-cyan-500"
                    value={annotationSearchText}
                    onChange={(e) => setAnnotationSearchText(e.target.value)}
                  />
                  <Select value={annotationFilterModulation} onValueChange={setAnnotationFilterModulation}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Filter by modulation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Modulations</SelectItem>
                      <SelectItem value="QPSK">QPSK</SelectItem>
                      <SelectItem value="8PSK">8PSK</SelectItem>
                      <SelectItem value="16QAM">16-QAM</SelectItem>
                      <SelectItem value="RTTY">RTTY</SelectItem>
                      <SelectItem value="PSK31">PSK31</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400">Min SNR (dB):</label>
                    <input
                      type="number"
                      className="flex-1 px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded"
                      value={annotationMinSNR}
                      onChange={(e) => setAnnotationMinSNR(Number(e.target.value))}
                      step="1"
                    />
                  </div>
                </div>
              </Card>
            )}

            {/* Annotation Statistics */}
            {currentCapture && savedAnnotations.length > 0 && (
              <AnnotationStatistics captureId={currentCapture.id} />
            )}
          </div>
        </div>
      </div>
      
      {/* Annotation Dialog */}
      <AnnotationDialog
        open={annotationDialogOpen}
        onOpenChange={setAnnotationDialogOpen}
        onSave={async ({ label, color }) => {
          if (!currentCapture || !pendingAnnotation) return;
          
          await createAnnotationMutation.mutateAsync({
            captureId: currentCapture.id,
            sampleStart: pendingAnnotation.sampleStart,
            sampleCount: pendingAnnotation.sampleCount,
            freqLowerEdge: pendingAnnotation.freqStart,
            freqUpperEdge: pendingAnnotation.freqEnd,
            label,
            color,
          });
        }}
        selectionInfo={pendingAnnotation ? {
          sampleStart: pendingAnnotation.sampleStart,
          sampleCount: pendingAnnotation.sampleCount,
          timeStart: pendingAnnotation.timeStart,
          timeEnd: pendingAnnotation.timeEnd,
        } : undefined}
      />
      
      {/* Annotation Edit Dialog */}
      <AnnotationEditDialog
        open={annotationEditOpen}
        annotation={editingAnnotation}
        onClose={() => {
          setAnnotationEditOpen(false);
          setEditingAnnotation(null);
        }}
        onSave={(annotation) => {
          updateAnnotationMutation.mutate({
            id: annotation.id,
            label: annotation.label,
            color: annotation.color,
          });
        }}
        onDelete={(id) => {
          deleteAnnotationMutation.mutate({ id });
        }}
      />
    </div>
  );
}
