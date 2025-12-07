import { useState, useEffect, useRef } from 'react';
import { WebGLErrorBoundary } from '@/components/WebGLErrorBoundary';
import { CockpitSkeleton } from '@/components/CockpitSkeleton';
import { useAuth } from '@/_core/hooks/useAuth';
import { useSignalStore } from '@/store/signalStore';
import { Spectrogram } from '@/components/Spectrogram';
import { ConstellationPlot } from '@/components/ConstellationPlot';
import SCFSurface3D from '@/components/SCFSurface3D';
import { FFTPSDPlot } from '@/components/FFTPSDPlot';
import { HexView } from '@/components/HexView';
import { AnnotationStatistics } from '@/components/AnnotationStatistics';
import { HopPatternVisualization } from '@/components/HopPatternVisualization';
import { SDRStreamingPanel } from '@/components/SDRStreamingPanel';
import { SDRControls } from '@/components/SDRControls';
import { DSPChainFlow } from '@/components/DSPChainFlow';
import { AnnotationEditDialog } from '@/components/AnnotationEditDialog';
import SignalContextMenu, { type SignalSelection } from '@/components/SignalContextMenu';
import CyclicProfilePanel from '@/components/CyclicProfilePanel';
import AnnotationDialog from '@/components/AnnotationDialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Activity, Radio, Waves, Binary, FileDown, Loader2, Plus, Minus, Move, Download } from 'lucide-react';
import { WVDHeatmap } from '@/components/WVDHeatmap';
import { WaveformDisplay } from '@/components/WaveformDisplay';
import { ReconstructedSignalPlot } from '@/components/ReconstructedSignalPlot';
import { AlgorithmComparison } from '@/components/AlgorithmComparison';
import { PhaseTrackingPlot } from '@/components/PhaseTrackingPlot';
import { CFODriftTimeline } from '@/components/CFODriftTimeline';
import { SlicePlaneControls } from '@/components/SlicePlaneControls';
import { SCFCrossSection2D } from '@/components/SCFCrossSection2D';
import { ReportGenerator, type ReportData } from '@/lib/reportGenerator';
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
  const [scfData, setScfData] = useState<any>(null);  const [showCyclicProfile, setShowCyclicProfile] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
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
  
  // Advanced signal processing state
  const [csAlgorithm, setCsAlgorithm] = useState('omp');
  const [sparsityLevel, setSparsityLevel] = useState(10);
  const [measurementRatio, setMeasurementRatio] = useState(0.5);
  const [csResult, setCsResult] = useState<any>(null);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparisonResults, setComparisonResults] = useState<any[]>([]);
  
  const [wvdType, setWvdType] = useState('wvd');
  const [windowSize, setWindowSize] = useState(64);
  const [sigma, setSigma] = useState(1.0);
  const [wvdResult, setWvdResult] = useState<any>(null);
  
  const [bssAlgorithm, setBssAlgorithm] = useState('fastica');
  const [numComponents, setNumComponents] = useState(2);
  const [bssResult, setBssResult] = useState<any>(null);
  
  // SCF cross-section state
  const [sliceType, setSliceType] = useState<'alpha' | 'tau'>('alpha');
  const [sliceValue, setSliceValue] = useState(0);
  const [crossSectionData, setCrossSectionData] = useState<any>(null);
  
  const extractCrossSectionMutation = trpc.captures.extractCrossSection.useMutation({
    onSuccess: (data) => {
      setCrossSectionData(data);
    },
    onError: (error: any) => {
      toast.error(`Cross-section extraction failed: ${error.message}`);
    },
  });
  
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
  });
  
  // Advanced signal processing mutations
  const reconstructSparseMutation = trpc.captures.reconstructSparse.useMutation({
    onSuccess: (data) => {
      if (comparisonMode) {
        // Add to comparison results
        setComparisonResults(prev => {
          // Remove existing result for same algorithm
          const filtered = prev.filter(r => r.algorithm !== data.algorithm);
          return [...filtered, data];
        });
        toast.success(`${data.algorithm.toUpperCase()} added to comparison (RMSE: ${data.rmse.toFixed(6)})`);
      } else {
        setCsResult(data);
        toast.success(`Sparse reconstruction complete (RMSE: ${data.rmse.toFixed(6)})`);
      }
      setActiveTab('compressive');
    },
    onError: (error) => {
      toast.error(`Reconstruction failed: ${error.message}`);
    },
  });
  
  const computeWVDMutation = trpc.captures.computeWVD.useMutation({
    onSuccess: (data) => {
      setWvdResult(data);
      setActiveTab('timefreq');
      toast.success(`Time-frequency analysis complete (${data.distributionType.toUpperCase()})`);
    },
    onError: (error) => {
      toast.error(`WVD computation failed: ${error.message}`);
    },
  });
  
  const separateSourcesMutation = trpc.captures.separateSources.useMutation({
    onSuccess: (data) => {
      setBssResult(data);
      setActiveTab('separation');
      toast.success(`Separated ${data.numComponents} sources using ${data.algorithm.toUpperCase()}`);
    },
    onError: (error) => {
      toast.error(`Source separation failed: ${error.message}`);
    },
  });
  
  const deleteAnnotationMutation2 = trpc.annotations.delete.useMutation({
    onSuccess: () => {
      toast.success('Annotation deleted');
      trpc.useUtils().annotations.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to save annotation: ${error.message}`);
    },
  });
  
  const [measurementsData, setMeasurementsData] = useState<any>(null);
  const [costasResult, setCostasResult] = useState<any>(null);
  const [costasModOrder, setCostasModOrder] = useState(4);
  const [costasLoopBW, setCostasLoopBW] = useState(0.01);
  
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
  
  const refineCFOMutation = trpc.captures.refineCFO.useMutation({
    onSuccess: (data) => {
      setCostasResult(data);
      toast.success(`CFO refined: ${data.total_cfo_hz.toFixed(1)} Hz ${data.lock_detected ? '(Locked)' : '(No Lock)'}`);
    },
    onError: (error) => {
      toast.error(`CFO refinement failed: ${error.message}`);
      setCostasResult(null);
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
  
  const handleReconstructSparse = () => {
    if (!selection || !currentCapture) return;
    
    const sampleCount = selection.sampleEnd - selection.sampleStart;
    
    reconstructSparseMutation.mutate({
      captureId: currentCapture.id,
      sampleStart: selection.sampleStart,
      sampleCount,
      algorithm: csAlgorithm as 'omp' | 'cosamp' | 'lasso' | 'fista',
      sparsityLevel,
      measurementRatio,
    });
    
    setContextMenuPos(null);
  };
  
  const handleTimeFreqAnalysis = () => {
    if (!selection || !currentCapture) return;
    
    const sampleCount = selection.sampleEnd - selection.sampleStart;
    
    computeWVDMutation.mutate({
      captureId: currentCapture.id,
      sampleStart: selection.sampleStart,
      sampleCount,
      distributionType: wvdType as 'wvd' | 'spwvd' | 'choi-williams',
      windowSize: wvdType === 'spwvd' ? windowSize : undefined,
      sigma: wvdType === 'choi-williams' ? sigma : undefined,
    });
    
    setContextMenuPos(null);
  };
  
  const handleSeparateSources = () => {
    if (!selection || !currentCapture) return;
    
    const sampleCount = selection.sampleEnd - selection.sampleStart;
    
    separateSourcesMutation.mutate({
      captureId: currentCapture.id,
      sampleStart: selection.sampleStart,
      sampleCount,
      algorithm: bssAlgorithm as 'fastica' | 'nmf',
      numComponents,
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

  const [exportFormat, setExportFormat] = useState<'pdf' | 'html'>('pdf');

  const handleExportReport = async () => {
    if (!currentCapture) return;
    
    setIsExporting(true);
    
    try {
      // Capture visualizations
      let spectrogramImage: string | undefined;
      let famPlotImage: string | undefined;
      
      // Try to capture spectrogram canvas
      const spectrogramCanvas = document.querySelector('canvas[data-spectrogram="main"]') as HTMLCanvasElement;
      if (spectrogramCanvas) {
        spectrogramImage = await ReportGenerator.captureCanvas(spectrogramCanvas);
      }
      
      // Try to capture FAM plot
      const famPlotElement = document.querySelector('[data-fam-plot]') as HTMLElement;
      if (famPlotElement) {
        famPlotImage = await ReportGenerator.captureElement(famPlotElement);
      }
      
      // Build report data
      const reportData: ReportData = {
        captureName: currentCapture.name,
        description: currentCapture.description || undefined,
        sampleRate: currentCapture.sampleRate || 0,
        centerFrequency: undefined,
        datatype: currentCapture.datatype || 'unknown',
        hardware: currentCapture.hardware || undefined,
        captureDate: new Date(currentCapture.createdAt).toLocaleString(),
        fileSize: 0,
        duration: undefined,
        spectrogramImage,
        famPlotImage,
        metrics: {
          snr: undefined,
          peakPower: undefined,
          avgPower: undefined,
          dynamicRange: undefined,
          bandwidth: undefined,
        },
        annotations: savedAnnotations.map(ann => ({
          id: String(ann.id),
          timestamp: ann.sampleStart / (currentCapture.sampleRate || 1),
          frequency: ann.freqLowerEdge && ann.freqUpperEdge ? (ann.freqLowerEdge + ann.freqUpperEdge) / 2 : 0,
          label: ann.label || 'Annotation',
          notes: undefined,
        })),
        analysisNotes: undefined,
      };
      
      if (exportFormat === 'pdf') {
        const blob = await ReportGenerator.generatePDF(reportData);
        const filename = `${currentCapture.name.replace(/\s+/g, '_')}_Report_${Date.now()}.pdf`;
        ReportGenerator.downloadBlob(blob, filename);
        toast.success('PDF report generated successfully');
      } else {
        const html = ReportGenerator.generateHTML(reportData);
        const filename = `${currentCapture.name.replace(/\s+/g, '_')}_Report_${Date.now()}.html`;
        ReportGenerator.downloadHTML(html, filename);
        toast.success('HTML report generated successfully');
      }
    } catch (error) {
      console.error('Report export failed:', error);
      toast.error(`Failed to generate ${exportFormat.toUpperCase()} report`);
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
              <span className="technical-label">Annotations: {savedAnnotations.length}</span>
              <div className="flex gap-2 ml-4">
                <Select value={exportFormat} onValueChange={(value: 'pdf' | 'html') => setExportFormat(value)}>
                  <SelectTrigger className="w-24 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportReport}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    <><FileDown className="w-4 h-4 mr-2" /> Export Report</>
                  )}
                </Button>
              </div>
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
                className={`absolute top-0 w-1 h-full opacity-70 cursor-pointer transition-all hover:opacity-100 hover:w-2 ${
                  selectedAnnotationId === ann.id ? 'ring-2 ring-white w-2' : ''
                }`}
                style={{
                  left: `${(ann.sampleStart / 1000000) * 100}%`, // Placeholder calculation
                  backgroundColor: ann.color || '#3b82f6',
                }}
                title={ann.label || 'Annotation'}
                onClick={() => setSelectedAnnotationId(ann.id)}
                onDoubleClick={() => {
                  setSelectedAnnotationId(ann.id);
                  setAnnotationDialogOpen(true);
                }}
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
              onDemodulate={(sel, mode) => {
                if (!currentCapture) return;
                demodMutation.mutate({
                  captureId: currentCapture.id,
                  sampleStart: sel.sampleStart,
                  sampleCount: sel.sampleCount,
                  mode: mode,
                  coarseCfoHz: measurementsData?.cfo?.cfo_hz,
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
                    sampleRate={currentCapture?.sampleRate || 1e6}
                    lodQuality="auto"
                    onBoxSelect={handleBoxSelect}
                    onFPSUpdate={(fps) => {
                      // FPS monitoring for performance tracking
                      if (fps < 30) {
                        console.warn('[Spectrogram] Low FPS detected:', fps);
                      }
                    }}
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
                <div className="border-t border-border my-1" />
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleReconstructSparse}>
                  <Activity className="w-4 h-4 mr-2" />
                  Reconstruct Sparse
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleTimeFreqAnalysis}>
                  <Waves className="w-4 h-4 mr-2" />
                  Time-Frequency Analysis
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSeparateSources}>
                  <Radio className="w-4 h-4 mr-2" />
                  Separate Sources
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
                  <TabsTrigger value="compressive" className="gap-2">
                    <Activity className="w-4 h-4" />
                    Compressive Sensing
                  </TabsTrigger>
                  <TabsTrigger value="timefreq" className="gap-2">
                    <Waves className="w-4 h-4" />
                    Time-Frequency
                  </TabsTrigger>
                  <TabsTrigger value="separation" className="gap-2">
                    <Radio className="w-4 h-4" />
                    Source Separation
                  </TabsTrigger>
                  <TabsTrigger value="streaming" className="gap-2">
                    <Radio className="w-4 h-4" />
                    Live Streaming
                  </TabsTrigger>
                  <TabsTrigger value="dspchain" className="gap-2">
                    <Activity className="w-4 h-4" />
                    DSP Chain
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="spectrum" className="p-4 h-full">
                  <FFTPSDPlot
                    frequencies={fftData?.frequencies || []}
                    magnitudes={fftData?.magnitudes || []}
                    centerFreq={fftData?.centerFreq || 0}
                    width={window.innerWidth - 400}
                    height={250}
                  />
                </TabsContent>

                <TabsContent value="constellation" className="p-4 h-full">
                  <WebGLErrorBoundary fallbackMessage="Failed to render constellation plot.">
                    <ConstellationPlot ref={constellationPlotRef} width={600} height={250} />
                  </WebGLErrorBoundary>
                </TabsContent>

                <TabsContent value="cyclostationary" className="p-4 h-full overflow-auto space-y-4">
                  {scfData ? (
                    <>
                      {/* 3D SCF Surface */}
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold">3D Spectral Correlation Function</h3>
                        <WebGLErrorBoundary fallbackMessage="Failed to render 3D SCF surface.">
                          <SCFSurface3D
                            scfMagnitude={scfData.scf || []}
                            spectralFreqs={scfData.freq || []}
                            cyclicFreqs={scfData.alpha || []}
                            shape={{ cyclic: scfData.alpha?.length || 0, spectral: scfData.freq?.length || 0 }}
                            colormap="viridis"
                          />
                        </WebGLErrorBoundary>
                      </div>

                      {/* Cross-Section Controls and Visualization */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Slice Controls */}
                        <div>
                          <SlicePlaneControls
                            sliceType={sliceType}
                            minValue={sliceType === 'alpha' ? Math.min(...(scfData.alpha || [0])) : 0}
                            maxValue={sliceType === 'alpha' ? Math.max(...(scfData.alpha || [0])) : (scfData.freq?.length || 1) - 1}
                            currentValue={sliceValue}
                            onValueChange={(value) => {
                              setSliceValue(value);
                              // Extract cross-section
                              extractCrossSectionMutation.mutate({
                                scfData: {
                                  alpha: scfData.alpha || [],
                                  tau: Array.from({ length: scfData.freq?.length || 0 }, (_, i) => i),
                                  scf: scfData.scf || [],
                                },
                                sliceType,
                                sliceValue: value,
                                interpolate: true,
                              });
                            }}
                            onSliceTypeChange={(type) => {
                              setSliceType(type);
                              // Reset slice value to center
                              const newValue = type === 'alpha'
                                ? (Math.min(...(scfData.alpha || [0])) + Math.max(...(scfData.alpha || [0]))) / 2
                                : Math.floor((scfData.freq?.length || 1) / 2);
                              setSliceValue(newValue);
                            }}
                            onExport={() => {
                              if (crossSectionData) {
                                const csv = `${sliceType === 'alpha' ? 'Tau' : 'Alpha'},SCF_Magnitude,${sliceType}=${crossSectionData.slicePosition}\n` +
                                  crossSectionData.axis.map((v: number, i: number) => `${v},${crossSectionData.values[i]}`).join('\n');
                                const blob = new Blob([csv], { type: 'text/csv' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `scf_cross_section_${sliceType}_${crossSectionData.slicePosition.toFixed(2)}.csv`;
                                a.click();
                                URL.revokeObjectURL(url);
                                toast.success('Cross-section exported to CSV');
                              }
                            }}
                            disabled={extractCrossSectionMutation.isPending}
                          />
                        </div>

                        {/* 2D Cross-Section Plot */}
                        <div className="lg:col-span-2">
                          {crossSectionData ? (
                            <SCFCrossSection2D
                              data={crossSectionData}
                              width={700}
                              height={400}
                              showPeak={true}
                            />
                          ) : (
                            <div className="flex items-center justify-center h-96 border border-border rounded bg-muted/20">
                              <p className="text-muted-foreground text-sm">
                                {extractCrossSectionMutation.isPending
                                  ? 'Extracting cross-section...'
                                  : 'Adjust the slice position to extract a cross-section'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-muted-foreground text-sm">
                        Run cyclostationary analysis to view SCF data
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="hex" className="p-0 h-full relative">
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

                <TabsContent value="compressive" className="p-4 h-full overflow-y-auto">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-lg">Compressive Sensing Reconstruction</h4>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={comparisonMode}
                            onChange={(e) => {
                              setComparisonMode(e.target.checked);
                              if (!e.target.checked) {
                                setComparisonResults([]);
                              }
                            }}
                            className="w-4 h-4"
                          />
                          <span>Comparison Mode</span>
                        </label>
                        {reconstructSparseMutation.isPending && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                      </div>
                    </div>
                    
                    {comparisonMode && (
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3 text-sm">
                        <div className="font-medium mb-1">🔬 Comparison Mode Active</div>
                        <div className="text-muted-foreground">
                          Select different algorithms and run reconstruction to compare results side-by-side.
                          {comparisonResults.length > 0 && (
                            <span className="ml-1 font-mono text-blue-500">
                              ({comparisonResults.length} algorithms compared)
                            </span>
                          )}
                        </div>
                        {comparisonResults.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => setComparisonResults([])}
                          >
                            Clear Comparison
                          </Button>
                        )}
                      </div>
                    )}
                    
                    {/* Algorithm Selector */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">Algorithm</label>
                      <Select value={csAlgorithm} onValueChange={setCsAlgorithm}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="omp">OMP (Orthogonal Matching Pursuit)</SelectItem>
                          <SelectItem value="cosamp">CoSaMP (Compressive Sampling MP)</SelectItem>
                          <SelectItem value="lasso">LASSO (L1 Regularization)</SelectItem>
                          <SelectItem value="fista">FISTA (Fast Iterative Shrinkage)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Sparsity Level Slider */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Sparsity Level: {sparsityLevel}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={sparsityLevel}
                        onChange={(e) => setSparsityLevel(Number(e.target.value))}
                        className="w-full"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        Number of non-zero coefficients in sparse representation
                      </div>
                    </div>
                    
                    {/* Measurement Ratio Slider */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Measurement Ratio: {measurementRatio.toFixed(2)}
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={measurementRatio}
                        onChange={(e) => setMeasurementRatio(Number(e.target.value))}
                        className="w-full"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        Ratio of measurements to signal length (lower = more compression)
                      </div>
                    </div>
                    
                    {/* Results Display */}
                    {csResult && !comparisonMode && (
                      <div className="space-y-3">
                        {/* Export Button */}
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const csv = `Sample,Reconstructed\n${csResult.reconstructed.map((v: number, i: number) => `${i},${v}`).join('\n')}`;
                              const blob = new Blob([csv], { type: 'text/csv' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `reconstructed_${csResult.algorithm}_${Date.now()}.csv`;
                              a.click();
                              URL.revokeObjectURL(url);
                              toast.success('Reconstructed signal exported');
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                          </Button>
                        </div>
                        
                        {/* Visualization */}
                        <ReconstructedSignalPlot
                          reconstructed={csResult.reconstructed}
                          width={650}
                          height={200}
                        />
                        
                        {/* Metrics */}
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">Algorithm:</span>
                            <span className="font-mono">{csResult.algorithm.toUpperCase()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Signal Length:</span>
                            <span className="font-mono">{csResult.signalLength}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Measurements:</span>
                            <span className="font-mono">{csResult.numMeasurements}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Compression:</span>
                            <span className="font-mono">{((1 - csResult.measurementRatio) * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">RMSE:</span>
                            <span className="font-mono">{csResult.rmse.toFixed(6)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Iterations:</span>
                            <span className="font-mono">{csResult.iterations}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {!csResult && !comparisonMode && (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        Select a signal region and choose "Reconstruct Sparse" from context menu
                      </div>
                    )}
                    
                    {/* Comparison View */}
                    {comparisonMode && comparisonResults.length > 0 && (
                      <AlgorithmComparison results={comparisonResults} />
                    )}
                    
                    {comparisonMode && comparisonResults.length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        Run reconstructions with different algorithms to compare their performance
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="timefreq" className="p-4 h-full overflow-y-auto">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-lg">Time-Frequency Analysis</h4>
                      {computeWVDMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                    </div>
                    
                    {/* Distribution Type Selector */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">Distribution Type</label>
                      <Select value={wvdType} onValueChange={setWvdType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wvd">WVD (Wigner-Ville)</SelectItem>
                          <SelectItem value="spwvd">SPWVD (Smoothed Pseudo-WVD)</SelectItem>
                          <SelectItem value="choi-williams">Choi-Williams Distribution</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Window Size Slider (for SPWVD) */}
                    {wvdType === 'spwvd' && (
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Window Size: {windowSize}
                        </label>
                        <input
                          type="range"
                          min="16"
                          max="512"
                          step="16"
                          value={windowSize}
                          onChange={(e) => setWindowSize(Number(e.target.value))}
                          className="w-full"
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                          Smoothing window size for cross-term mitigation
                        </div>
                      </div>
                    )}
                    
                    {/* Sigma Parameter (for Choi-Williams) */}
                    {wvdType === 'choi-williams' && (
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Sigma: {sigma.toFixed(2)}
                        </label>
                        <input
                          type="range"
                          min="0.1"
                          max="10"
                          step="0.1"
                          value={sigma}
                          onChange={(e) => setSigma(Number(e.target.value))}
                          className="w-full"
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                          Kernel parameter for cross-term suppression
                        </div>
                      </div>
                    )}
                    
                    {/* WVD Heatmap Display */}
                    {wvdResult && (
                      <div className="space-y-3">
                        {/* Export Button */}
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const json = JSON.stringify({
                                distributionType: wvdResult.distributionType,
                                timePoints: wvdResult.timePoints,
                                freqPoints: wvdResult.freqPoints,
                                wvd: wvdResult.wvd,
                              }, null, 2);
                              const blob = new Blob([json], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `wvd_${wvdResult.distributionType}_${Date.now()}.json`;
                              a.click();
                              URL.revokeObjectURL(url);
                              toast.success('WVD matrix exported');
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export JSON
                          </Button>
                        </div>
                        
                        {/* Heatmap Visualization */}
                        <WVDHeatmap
                          data={wvdResult.wvd}
                          timePoints={wvdResult.timePoints}
                          freqPoints={wvdResult.freqPoints}
                          width={650}
                          height={300}
                          colormap="viridis"
                        />
                        
                        {/* Metrics */}
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="font-medium">Distribution:</span>
                            <span className="font-mono">{wvdResult.distributionType.toUpperCase()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Time Points:</span>
                            <span className="font-mono">{wvdResult.timePoints}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Freq Points:</span>
                            <span className="font-mono">{wvdResult.freqPoints}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {!wvdResult && (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        Select a signal region and choose "Time-Frequency Analysis" from context menu
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="separation" className="p-4 h-full overflow-y-auto">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-lg">Blind Source Separation</h4>
                      {separateSourcesMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                    </div>
                    
                    {/* Algorithm Selector */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">Algorithm</label>
                      <Select value={bssAlgorithm} onValueChange={setBssAlgorithm}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fastica">FastICA (Independent Component Analysis)</SelectItem>
                          <SelectItem value="nmf">NMF (Non-negative Matrix Factorization)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Number of Components Slider */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Number of Components: {numComponents}
                      </label>
                      <input
                        type="range"
                        min="2"
                        max="8"
                        value={numComponents}
                        onChange={(e) => setNumComponents(Number(e.target.value))}
                        className="w-full"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        Number of independent sources to extract
                      </div>
                    </div>
                    
                    {/* Results Display */}
                    {bssResult && (
                      <div className="space-y-3">
                        {/* Export Button */}
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const csv = bssResult.sources.map((source: number[], idx: number) => {
                                const header = `Source ${idx + 1}`;
                                const values = source.join('\n');
                                return `${header}\n${values}`;
                              }).join('\n\n');
                              const blob = new Blob([csv], { type: 'text/csv' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `separated_sources_${bssResult.algorithm}_${Date.now()}.csv`;
                              a.click();
                              URL.revokeObjectURL(url);
                              toast.success('Separated sources exported');
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                          </Button>
                        </div>
                        
                        {/* Metrics */}
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="font-medium">Algorithm:</span>
                            <span className="font-mono">{bssResult.algorithm.toUpperCase()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Components:</span>
                            <span className="font-mono">{bssResult.numComponents}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Iterations:</span>
                            <span className="font-mono">{bssResult.iterations}</span>
                          </div>
                        </div>
                        
                        {/* Separated Sources Waveforms */}
                        <div className="space-y-2">
                          <div className="font-medium text-sm">Separated Sources:</div>
                          {bssResult.sources.map((source: number[], idx: number) => (
                            <div key={idx} className="space-y-1">
                              <WaveformDisplay
                                data={source}
                                width={650}
                                height={100}
                                color={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][idx % 6]}
                                label={`Source ${idx + 1}`}
                                sampleRate={currentCapture?.sampleRate || 1}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {!bssResult && (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        Select a signal region and choose "Separate Sources" from context menu
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="streaming" className="p-4 h-full overflow-y-auto">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-lg">Live SDR Streaming</h4>
                    </div>
                    
                    <SDRControls
                      isStreaming={isStreaming}
                      onSessionStart={(sessionId: string) => {
                        console.log('[ForensicCockpit] Streaming session started:', sessionId);
                        setIsStreaming(true);
                        toast.success('Streaming session started');
                      }}
                      onSessionStop={() => {
                        console.log('[ForensicCockpit] Streaming session stopped');
                        setIsStreaming(false);
                        toast.info('Streaming session stopped');
                      }}
                    />
                    
                    <div className="text-sm text-muted-foreground mt-4">
                      <p>Connect an RTL-SDR, HackRF, or USRP device to start live signal streaming.</p>
                      <p className="mt-2">The spectrogram will update in real-time with FFT data from the SDR.</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="dspchain" className="p-4 h-full overflow-y-auto">
                  <DSPChainFlow
                    onParameterChange={(nodeId, parameter, value) => {
                      console.log(`[DSPChain] ${nodeId}.${parameter} = ${value}`);
                      // TODO: Wire to actual DSP pipeline
                      toast.info(`Updated ${parameter} to ${value}`);
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
                  
                  {/* Costas Loop CFO Refinement */}
                  {measurementsData?.cfo && (
                    <div className="border-t border-border pt-3 mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="technical-label text-xs">CFO Refinement (Costas Loop)</div>
                        {refineCFOMutation.isPending && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      
                      <div className="space-y-2 mb-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Modulation Order</label>
                          <Select value={costasModOrder.toString()} onValueChange={(v) => setCostasModOrder(Number(v))}>
                            <SelectTrigger className="w-full h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="2">BPSK (2)</SelectItem>
                              <SelectItem value="4">QPSK (4)</SelectItem>
                              <SelectItem value="8">8PSK (8)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <label className="text-xs text-muted-foreground">Loop Bandwidth</label>
                          <Select value={costasLoopBW.toString()} onValueChange={(v) => setCostasLoopBW(Number(v))}>
                            <SelectTrigger className="w-full h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0.005">Narrow (0.005)</SelectItem>
                              <SelectItem value="0.01">Medium (0.01)</SelectItem>
                              <SelectItem value="0.02">Wide (0.02)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          if (selection && currentCapture) {
                            refineCFOMutation.mutate({
                              captureId: currentCapture.id,
                              sampleStart: selection.sampleStart,
                              sampleCount: Math.min(selection.sampleEnd - selection.sampleStart, 32768),
                              coarseCfoHz: measurementsData.cfo.cfo_hz,
                              modulationOrder: costasModOrder,
                              loopBandwidth: costasLoopBW,
                            });
                          }
                        }}
                        disabled={!selection || refineCFOMutation.isPending}
                      >
                        Refine CFO
                      </Button>
                      
                      {costasResult && (
                        <div className="mt-3 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Total CFO:</span>
                            <span className="font-mono font-semibold">{costasResult.total_cfo_hz.toFixed(1)} Hz</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Fine Correction:</span>
                            <span className="font-mono">{costasResult.fine_cfo_hz.toFixed(1)} Hz</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Lock Status:</span>
                            <span className={`font-semibold ${costasResult.lock_detected ? 'text-green-500' : 'text-red-500'}`}>
                              {costasResult.lock_detected ? '✓ Locked' : '✗ No Lock'}
                            </span>
                          </div>
                          {costasResult.lock_time_samples !== null && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Lock Time:</span>
                              <span className="font-mono">{costasResult.lock_time_samples} samples</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Convergence:</span>
                            <span className="font-mono">{costasResult.convergence_time_samples} samples</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Phase Error Var:</span>
                            <span className="font-mono">{costasResult.phase_error_variance.toFixed(4)}</span>
                          </div>
                          
                          {/* Phase Tracking Visualization */}
                          {costasResult.phase_errors && costasResult.frequencies && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <div className="text-xs text-muted-foreground mb-2">Phase Tracking Plot</div>
                              <PhaseTrackingPlot
                                phaseErrors={costasResult.phase_errors}
                                frequencies={costasResult.frequencies}
                                lockThreshold={0.1}
                                lockTimeSamples={costasResult.lock_time_samples}
                                loopBandwidth={costasLoopBW}
                                modulationOrder={costasModOrder}
                                width={320}
                                height={200}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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
                      a.download = `classification_${currentCapture.name}_${Date.now()}.json`;
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
