import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { ClassificationResult, ModulationType } from '@/lib/modulationClassifier';
import { MODULATION_TYPES } from '@/lib/modulationClassifier';

interface ModulationOverlayProps {
  result: ClassificationResult | null;
  isClassifying: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  showAllScores?: boolean;
}

/**
 * Overlay component to display modulation classification results on spectrogram
 */
export function ModulationOverlay({
  result,
  isClassifying,
  position = 'top-right',
  showAllScores = false,
}: ModulationOverlayProps) {
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    if (result || isClassifying) {
      setVisible(true);
    }
  }, [result, isClassifying]);
  
  if (!visible && !result && !isClassifying) {
    return null;
  }
  
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };
  
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-orange-400';
  };
  
  const getConfidenceBadgeVariant = (confidence: number): 'default' | 'secondary' | 'destructive' => {
    if (confidence >= 0.8) return 'default';
    if (confidence >= 0.6) return 'secondary';
    return 'destructive';
  };
  
  return (
    <div className={`absolute ${positionClasses[position]} z-50 pointer-events-none`}>
      <Card className="p-4 bg-card/95 backdrop-blur-sm border-2 border-cyan-500/50 shadow-lg min-w-[280px] pointer-events-auto">
        {isClassifying && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-cyan-400">Classifying Modulation...</span>
            </div>
            <Progress value={undefined} className="h-1" />
          </div>
        )}
        
        {result && !isClassifying && (
          <div className="space-y-3">
            {/* Main Classification Result */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Detected Modulation</span>
                <Badge variant={getConfidenceBadgeVariant(result.confidence)} className="text-xs">
                  {(result.confidence * 100).toFixed(1)}%
                </Badge>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="text-3xl font-black text-cyan-400">
                  {result.modulation}
                </div>
                <div className={`text-sm font-mono ${getConfidenceColor(result.confidence)}`}>
                  {(result.confidence * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            
            {/* Feature Summary */}
            <div className="space-y-1 pt-2 border-t border-border/50">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Signal Features</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amplitude:</span>
                  <span className="font-mono">{result.features.meanAmplitude.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phase:</span>
                  <span className="font-mono">{result.features.meanPhase.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amp Std:</span>
                  <span className="font-mono">{result.features.stdAmplitude.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phase Std:</span>
                  <span className="font-mono">{result.features.stdPhase.toFixed(3)}</span>
                </div>
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span className="text-muted-foreground">Spectral Flatness:</span>
                <span className="font-mono">{result.features.spectralFlatness.toFixed(4)}</span>
              </div>
            </div>
            
            {/* All Scores (Optional) */}
            {showAllScores && (
              <div className="space-y-1.5 pt-2 border-t border-border/50">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">All Predictions</div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {MODULATION_TYPES.map((modType) => {
                    const score = result.allScores[modType];
                    const isTop = modType === result.modulation;
                    
                    return (
                      <div key={modType} className="flex items-center gap-2">
                        <span className={`text-xs font-mono w-16 ${isTop ? 'text-cyan-400 font-bold' : 'text-muted-foreground'}`}>
                          {modType}
                        </span>
                        <div className="flex-1">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${isTop ? 'bg-cyan-400' : 'bg-muted-foreground/50'}`}
                              style={{ width: `${score * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                          {(score * 100).toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Confidence Indicator */}
            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center gap-2 text-xs">
                <div className={`h-2 w-2 rounded-full ${
                  result.confidence >= 0.8 ? 'bg-green-400' :
                  result.confidence >= 0.6 ? 'bg-yellow-400' :
                  'bg-orange-400'
                }`} />
                <span className="text-muted-foreground">
                  {result.confidence >= 0.8 ? 'High Confidence' :
                   result.confidence >= 0.6 ? 'Medium Confidence' :
                   'Low Confidence'}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Close Button */}
        {result && !isClassifying && (
          <button
            onClick={() => setVisible(false)}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close overlay"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </Card>
    </div>
  );
}

/**
 * Compact version for inline display
 */
export function ModulationBadge({ result }: { result: ClassificationResult | null }) {
  if (!result) return null;
  
  const getVariant = (confidence: number): 'default' | 'secondary' | 'destructive' => {
    if (confidence >= 0.8) return 'default';
    if (confidence >= 0.6) return 'secondary';
    return 'destructive';
  };
  
  return (
    <Badge variant={getVariant(result.confidence)} className="gap-1.5">
      <span className="font-bold">{result.modulation}</span>
      <span className="text-xs opacity-80">{(result.confidence * 100).toFixed(0)}%</span>
    </Badge>
  );
}
