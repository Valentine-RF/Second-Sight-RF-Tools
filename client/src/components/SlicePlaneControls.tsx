import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Play, Pause, SkipBack, SkipForward } from 'lucide-react';

interface SlicePlaneControlsProps {
  sliceType: 'alpha' | 'tau';
  minValue: number;
  maxValue: number;
  currentValue: number;
  onValueChange: (value: number) => void;
  onSliceTypeChange: (type: 'alpha' | 'tau') => void;
  onExport?: () => void;
  disabled?: boolean;
}

/**
 * SlicePlaneControls - Interactive controls for SCF cross-section slicing
 * 
 * Provides slider, animation controls, and export functionality
 */
export function SlicePlaneControls({
  sliceType,
  minValue,
  maxValue,
  currentValue,
  onValueChange,
  onSliceTypeChange,
  onExport,
  disabled = false,
}: SlicePlaneControlsProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(50); // ms per step

  useEffect(() => {
    if (!isAnimating) return;

    const range = maxValue - minValue;
    const step = range / 100; // 100 steps across range

    const interval = setInterval(() => {
      const next = currentValue + step;
      if (next > maxValue) {
        setIsAnimating(false);
        onValueChange(minValue); // Loop back
      } else {
        onValueChange(next);
      }
    }, animationSpeed);

    return () => clearInterval(interval);
  }, [isAnimating, animationSpeed, minValue, maxValue, onValueChange]);

  const handleStepForward = () => {
    const range = maxValue - minValue;
    const step = range / 20; // 5% steps
    const newValue = Math.min(currentValue + step, maxValue);
    onValueChange(newValue);
  };

  const handleStepBackward = () => {
    const range = maxValue - minValue;
    const step = range / 20;
    const newValue = Math.max(currentValue - step, minValue);
    onValueChange(newValue);
  };

  const handleReset = () => {
    onValueChange((minValue + maxValue) / 2);
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Cross-Section Slice</h3>
        {onExport && (
          <Button
            size="sm"
            variant="outline"
            onClick={onExport}
            disabled={disabled}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Slice Type Selector */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Slice Axis</label>
        <Select
          value={sliceType}
          onValueChange={(value) => onSliceTypeChange(value as 'alpha' | 'tau')}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alpha">
              Alpha (Cyclic Frequency) - Fixed α, vary τ
            </SelectItem>
            <SelectItem value="tau">
              Tau (Lag) - Fixed τ, vary α
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Slice Position Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">
            {sliceType === 'alpha' ? 'Alpha (Hz)' : 'Tau (samples)'}
          </label>
          <span className="text-xs font-mono">
            {currentValue.toFixed(2)}
          </span>
        </div>
        
        <Slider
          value={[currentValue]}
          onValueChange={([value]) => onValueChange(value)}
          min={minValue}
          max={maxValue}
          step={(maxValue - minValue) / 200}
          disabled={disabled}
          className="w-full"
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{minValue.toFixed(1)}</span>
          <span>{maxValue.toFixed(1)}</span>
        </div>
      </div>

      {/* Animation Controls */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Animation</label>
        
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleStepBackward}
            disabled={disabled || currentValue <= minValue}
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          <Button
            size="sm"
            variant={isAnimating ? "destructive" : "default"}
            onClick={() => setIsAnimating(!isAnimating)}
            disabled={disabled}
            className="flex-1"
          >
            {isAnimating ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Animate
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleStepForward}
            disabled={disabled || currentValue >= maxValue}
          >
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>

        {/* Animation Speed */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Speed</label>
            <span className="text-xs font-mono">
              {(1000 / animationSpeed).toFixed(1)} fps
            </span>
          </div>
          
          <Slider
            value={[animationSpeed]}
            onValueChange={([value]) => setAnimationSpeed(value)}
            min={10}
            max={200}
            step={10}
            disabled={disabled}
            className="w-full"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleReset}
          disabled={disabled}
          className="flex-1"
        >
          Reset to Center
        </Button>
        
        <Button
          size="sm"
          variant="outline"
          onClick={() => onValueChange(minValue)}
          disabled={disabled}
          className="flex-1"
        >
          Min
        </Button>
        
        <Button
          size="sm"
          variant="outline"
          onClick={() => onValueChange(maxValue)}
          disabled={disabled}
          className="flex-1"
        >
          Max
        </Button>
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">
          <strong>Keyboard:</strong> ← → to step, Space to play/pause
        </p>
      </div>
    </Card>
  );
}
