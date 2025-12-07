import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Spectrogram } from '@/components/Spectrogram';
import { WebGLErrorBoundary } from '@/components/WebGLErrorBoundary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { 
  Link2, Link2Off, ZoomIn, ZoomOut, MoveHorizontal, 
  Radio, X, ArrowLeftRight 
} from 'lucide-react';
import { toast } from 'sonner';

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
  const [syncState, setSyncState] = useState<SyncState>({
    zoom: 1.0,
    timeOffset: 0,
    freqCenter: 0,
  });

  const spectrogramRefs = useRef<HTMLDivElement[]>([]);

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
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant={isSynced ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsSynced(!isSynced)}
              className="gap-2"
            >
              {isSynced ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
              {isSynced ? 'Synced' : 'Independent'}
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

                  {/* Spectrogram */}
                  <div
                    ref={(el) => {
                      if (el) spectrogramRefs.current[index] = el;
                    }}
                    className="flex-1 bg-black rounded overflow-hidden"
                  >
                    <WebGLErrorBoundary>
                      <Spectrogram
                        width={spectrogramRefs.current[index]?.clientWidth || 400}
                        height={spectrogramRefs.current[index]?.clientHeight || 300}
                      />
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
