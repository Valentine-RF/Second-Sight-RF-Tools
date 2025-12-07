import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Spectrogram } from '@/components/Spectrogram';
import { WebGLErrorBoundary } from '@/components/WebGLErrorBoundary';
import { DifferenceHeatmap } from '@/components/DifferenceHeatmap';
import { WaterfallDisplay } from '@/components/WaterfallDisplay';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { 
  Link2, Link2Off, ZoomIn, ZoomOut, MoveHorizontal, 
  Radio, X, ArrowLeftRight, GitCompare, FileDown 
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Textarea } from '@/components/ui/textarea';

interface ComparisonCapture {
  id: number;
  name: string;
  sampleRate: number | null;
  datatype: string | null;
  hardware: string | null;
}

interface SyncState {
  zoom: number;
  timeOffset: number;
  freqCenter: number;
}

/**
 * Signal Comparison Mode
 * 
 * Features:
 * - Side-by-side spectrogram comparison (2-4 captures)
 * - Synchronized zoom controls
 * - Synchronized time alignment
 * - Linked panning across all spectrograms
 * - Individual capture metadata display
 * - Toggle sync on/off
 */
export default function ComparisonMode() {
  const { user, loading } = useAuth();
  const { data: captures, isLoading: capturesLoading } = trpc.captures.list.useQuery(undefined, {
    enabled: !!user,
  });

  const [selectedCaptures, setSelectedCaptures] = useState<ComparisonCapture[]>([]);
  const [isSynced, setIsSynced] = useState(true);
  const [showDifference, setShowDifference] = useState(false);
  const [showWaterfall, setShowWaterfall] = useState(false);
  const [analysisNotes, setAnalysisNotes] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const notesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create or update session mutation
  const createSessionMutation = trpc.comparisonSessions.create.useMutation();
  const updateSessionMutation = trpc.comparisonSessions.update.useMutation();
  const [syncState, setSyncState] = useState<SyncState>({
    zoom: 1.0,
    timeOffset: 0,
    freqCenter: 0,
  });

  const spectrogramRefs = useRef<HTMLDivElement[]>([]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if user is typing in an input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.key) {
      case ' ': // Space - toggle sync
        e.preventDefault();
        setIsSynced(prev => !prev);
        toast.info(isSynced ? 'Sync disabled' : 'Sync enabled');
        break;
      case '+':
      case '=': // Plus/Equals - zoom in
        e.preventDefault();
        handleZoomIn();
        break;
      case '-':
      case '_': // Minus/Underscore - zoom out
        e.preventDefault();
        handleZoomOut();
        break;
      case 'ArrowLeft': // Left arrow - shift time left
        e.preventDefault();
        handleTimeShift('left');
        break;
      case 'ArrowRight': // Right arrow - shift time right
        e.preventDefault();
        handleTimeShift('right');
        break;
      case '1':
      case '2':
      case '3':
      case '4': // Number keys - quick select first 4 captures
        e.preventDefault();
        if (captures && captures.length > 0) {
          const index = parseInt(e.key) - 1;
          if (index < captures.length) {
            const capture = captures[index];
            const isSelected = selectedCaptures.some(c => c.id === capture.id);
            handleCaptureToggle(capture, !isSelected);
          }
        }
        break;
    }
  }, [isSynced, captures, selectedCaptures]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleCaptureToggle = (capture: any, checked: boolean) => {
    if (checked) {
      if (selectedCaptures.length >= 4) {
        toast.error('Maximum 4 captures can be compared at once');
        return;
      }
      setSelectedCaptures([...selectedCaptures, capture]);
    } else {
      setSelectedCaptures(selectedCaptures.filter(c => c.id !== capture.id));
    }
  };

  const handleZoomIn = () => {
    if (isSynced) {
      setSyncState(prev => ({ ...prev, zoom: Math.min(prev.zoom * 1.5, 10) }));
    }
  };

  const handleZoomOut = () => {
    if (isSynced) {
      setSyncState(prev => ({ ...prev, zoom: Math.max(prev.zoom / 1.5, 0.1) }));
    }
  };

  const handleTimeShift = (direction: 'left' | 'right') => {
    if (isSynced) {
      const shift = direction === 'left' ? -1000 : 1000; // 1000 samples
      setSyncState(prev => ({ ...prev, timeOffset: prev.timeOffset + shift }));
    }
  };

  const handleRemoveCapture = (id: number) => {
    setSelectedCaptures(selectedCaptures.filter(c => c.id !== id));
  };

  // Auto-save notes with debouncing
  const handleNotesChange = (value: string) => {
    setAnalysisNotes(value);

    // Clear existing timeout
    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current);
    }

    // Set new timeout for auto-save (2 seconds after user stops typing)
    notesTimeoutRef.current = setTimeout(async () => {
      if (selectedCaptures.length === 0) return;

      try {
        if (currentSessionId) {
          // Update existing session
          await updateSessionMutation.mutateAsync({
            id: currentSessionId,
            notes: value,
            settings: syncState,
          });
        } else {
          // Create new session
          const result = await createSessionMutation.mutateAsync({
            name: `Comparison ${new Date().toLocaleString()}`,
            notes: value,
            captureIds: selectedCaptures.map(c => c.id),
            settings: syncState,
          });
          if (result.id) {
            setCurrentSessionId(result.id);
          }
        }
        toast.success('Notes saved');
      } catch (error) {
        console.error('Failed to save notes:', error);
        toast.error('Failed to save notes');
      }
    }, 2000);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (notesTimeoutRef.current) {
        clearTimeout(notesTimeoutRef.current);
      }
    };
  }, []);

  const handleExportPDF = async () => {
    if (selectedCaptures.length === 0) {
      toast.error('No captures selected for export');
      return;
    }

    setIsExporting(true);
    toast.info('Generating PDF report...');

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;

      // Title
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Signal Comparison Report', margin, margin + 10);

      // Metadata table
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      let yPos = margin + 25;

      pdf.text('Capture Metadata:', margin, yPos);
      yPos += 7;

      selectedCaptures.forEach((capture, index) => {
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${index + 1}. ${capture.name}`, margin + 5, yPos);
        yPos += 5;
        pdf.setFont('helvetica', 'normal');
        pdf.text(`   Sample Rate: ${capture.sampleRate ? `${(capture.sampleRate / 1e6).toFixed(2)} MHz` : 'N/A'}`, margin + 5, yPos);
        yPos += 5;
        pdf.text(`   Datatype: ${capture.datatype || 'N/A'}`, margin + 5, yPos);
        yPos += 5;
        pdf.text(`   Hardware: ${capture.hardware || 'N/A'}`, margin + 5, yPos);
        yPos += 7;
      });

      // Analysis notes
      if (analysisNotes) {
        yPos += 5;
        pdf.setFont('helvetica', 'bold');
        pdf.text('Analysis Notes:', margin, yPos);
        yPos += 7;
        pdf.setFont('helvetica', 'normal');
        const splitNotes = pdf.splitTextToSize(analysisNotes, pageWidth - 2 * margin);
        pdf.text(splitNotes, margin + 5, yPos);
        yPos += splitNotes.length * 5 + 10;
      }

      // Capture screenshots
      for (let i = 0; i < spectrogramRefs.current.length; i++) {
        const element = spectrogramRefs.current[i];
        if (element) {
          if (yPos > pageHeight - 80) {
            pdf.addPage();
            yPos = margin;
          }

          const canvas = await html2canvas(element, {
            backgroundColor: '#000000',
            scale: 2,
          });

          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - 2 * margin;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          pdf.text(`Capture ${i + 1}: ${selectedCaptures[i]?.name}`, margin, yPos);
          yPos += 7;
          pdf.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 10;
        }
      }

      // Footer
      const timestamp = new Date().toISOString();
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      pdf.text(`Generated: ${timestamp}`, margin, pageHeight - 10);

      // Save
      pdf.save(`comparison-report-${Date.now()}.pdf`);
      toast.success('PDF report exported successfully!');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF report');
    } finally {
      setIsExporting(false);
    }
  };

  const getGridClass = () => {
    switch (selectedCaptures.length) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-2';
      case 3:
        return 'grid-cols-3';
      case 4:
        return 'grid-cols-2 grid-rows-2';
      default:
        return 'grid-cols-1';
    }
  };

  if (loading || capturesLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-black">Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header with Controls */}
      <div className="border-b border-border bg-card/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-black mb-1">Signal Comparison Mode</h1>
            <p className="technical-label">
              Compare up to 4 signal captures side-by-side with synchronized controls
            </p>
            <p className="technical-label text-xs mt-1 opacity-70">
              Shortcuts: 1-4 (select), Space (sync), +/- (zoom), ← → (time)
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant={showWaterfall ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowWaterfall(!showWaterfall)}
              className="gap-2"
            >
              <Radio className="w-4 h-4" />
              {showWaterfall ? 'Waterfall' : 'Spectrogram'}
            </Button>
            <Button
              variant={showDifference ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (selectedCaptures.length !== 2) {
                  toast.error('Difference mode requires exactly 2 captures');
                  return;
                }
                setShowDifference(!showDifference);
              }}
              className="gap-2"
              disabled={selectedCaptures.length !== 2}
            >
              <GitCompare className="w-4 h-4" />
              {showDifference ? 'Difference' : 'Normal'}
            </Button>
            <Button
              variant={isSynced ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsSynced(!isSynced)}
              className="gap-2"
            >
              {isSynced ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
              {isSynced ? 'Synced' : 'Independent'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={selectedCaptures.length === 0 || isExporting}
              onClick={handleExportPDF}
            >
              <FileDown className="w-4 h-4" />
              {isExporting ? 'Exporting...' : 'Export PDF'}
            </Button>
          </div>
        </div>

        {/* Sync Controls */}
        {isSynced && selectedCaptures.length > 0 && (
          <div className="flex items-center gap-4 p-3 bg-primary/10 rounded-lg">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleZoomOut}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2 min-w-[200px]">
                <span className="technical-label text-xs">Zoom:</span>
                <Slider
                  value={[syncState.zoom]}
                  onValueChange={([value]) => setSyncState(prev => ({ ...prev, zoom: value }))}
                  min={0.1}
                  max={10}
                  step={0.1}
                  className="flex-1"
                />
                <span className="font-mono text-xs w-12">{syncState.zoom.toFixed(1)}x</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleZoomIn}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>

            <div className="h-6 w-px bg-border" />

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleTimeShift('left')}>
                <ArrowLeftRight className="w-4 h-4 rotate-180" />
              </Button>
              <div className="flex items-center gap-2 min-w-[200px]">
                <span className="technical-label text-xs">Time Offset:</span>
                <Slider
                  value={[syncState.timeOffset]}
                  onValueChange={([value]) => setSyncState(prev => ({ ...prev, timeOffset: value }))}
                  min={-10000}
                  max={10000}
                  step={100}
                  className="flex-1"
                />
                <span className="font-mono text-xs w-16">{syncState.timeOffset}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleTimeShift('right')}>
                <ArrowLeftRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Annotation Notes */}
        {selectedCaptures.length > 0 && (
          <div className="mt-3 p-3 bg-card/50 rounded-lg border border-border">
            <label className="technical-label text-xs mb-2 block">Analysis Notes (auto-saved)</label>
            <Textarea
              value={analysisNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Document your findings, observations, and analysis here..."
              className="min-h-[80px] font-mono text-sm"
            />
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Capture Selection Sidebar */}
        <div className="w-80 border-r border-border bg-card/30 overflow-y-auto p-4">
          <h3 className="font-black mb-3">Select Captures to Compare</h3>
          <p className="technical-label text-xs mb-4">
            Choose 2-4 signal captures (max 4)
          </p>

          <div className="space-y-2">
            {captures && captures.length > 0 ? (
              captures.map((capture) => {
                const isSelected = selectedCaptures.some(c => c.id === capture.id);
                return (
                  <Card
                    key={capture.id}
                    className={`p-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/20 border-primary' : 'hover:bg-accent/50'
                    }`}
                    onClick={() => handleCaptureToggle(capture, !isSelected)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleCaptureToggle(capture, checked as boolean)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm font-bold truncate">{capture.name}</div>
                        <div className="text-xs space-y-1 mt-2">
                          <div className="flex justify-between">
                            <span className="technical-label">Sample Rate:</span>
                            <span className="font-mono">
                              {capture.sampleRate ? `${(capture.sampleRate / 1e6).toFixed(2)} MHz` : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="technical-label">Datatype:</span>
                            <span className="font-mono">{capture.datatype || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            ) : (
              <div className="text-center py-8">
                <Radio className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <p className="technical-label">No captures available</p>
              </div>
            )}
          </div>
        </div>

        {/* Comparison View */}
        <div className="flex-1 p-4 overflow-auto">
          {selectedCaptures.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4">
                <MoveHorizontal className="w-16 h-16 mx-auto text-muted-foreground" />
                <h2 className="text-2xl font-black">No Captures Selected</h2>
                <p className="technical-label">
                  Select 2-4 signal captures from the sidebar to begin comparison
                </p>
              </div>
            </div>
          ) : (
            <div className={`grid ${getGridClass()} gap-4 h-full`}>
              {selectedCaptures.map((capture, index) => (
                <Card key={capture.id} className="p-4 data-panel flex flex-col">
                  {/* Capture Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-black truncate">{capture.name}</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleRemoveCapture(capture.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className="technical-label">
                          {capture.sampleRate ? `${(capture.sampleRate / 1e6).toFixed(2)} MHz` : 'N/A'}
                        </span>
                        <span className="technical-label">{capture.datatype || 'N/A'}</span>
                        <span className="technical-label">{capture.hardware || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Spectrogram or Difference Heatmap */}
                  <div
                    ref={(el) => {
                      if (el) spectrogramRefs.current[index] = el;
                    }}
                    className="flex-1 bg-black rounded overflow-hidden"
                  >
                    <WebGLErrorBoundary>
                      {showDifference && selectedCaptures.length === 2 ? (
                        <DifferenceHeatmap
                          width={spectrogramRefs.current[index]?.clientWidth || 400}
                          height={spectrogramRefs.current[index]?.clientHeight || 300}
                          capture1Name={selectedCaptures[0].name}
                          capture2Name={selectedCaptures[1].name}
                        />
                      ) : showWaterfall ? (
                        <WaterfallDisplay
                          width={spectrogramRefs.current[index]?.clientWidth || 400}
                          height={spectrogramRefs.current[index]?.clientHeight || 300}
                          colormap="viridis"
                        />
                      ) : (
                        <Spectrogram
                          width={spectrogramRefs.current[index]?.clientWidth || 400}
                          height={spectrogramRefs.current[index]?.clientHeight || 300}
                        />
                      )}
                    </WebGLErrorBoundary>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
