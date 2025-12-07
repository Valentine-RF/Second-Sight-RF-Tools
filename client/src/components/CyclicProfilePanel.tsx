/**
 * Cyclic Profile Panel
 * 
 * Displays 1D cyclic profile (max-hold along spectral frequency)
 * as a side panel overlay on the main spectrogram for quick feature detection
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';

interface CyclicProfilePanelProps {
  cyclicProfile: number[];
  cyclicFreqs: number[];
  onClose?: () => void;
  width?: number;
  height?: number;
}

export default function CyclicProfilePanel({
  cyclicProfile,
  cyclicFreqs,
  onClose,
  width = 200,
  height = 400,
}: CyclicProfilePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || cyclicProfile.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Find peaks for markers
    const peaks = findPeaks(cyclicProfile, 0.3); // 30% threshold

    // Normalize profile to canvas height
    const maxVal = Math.max(...cyclicProfile);
    const minVal = Math.min(...cyclicProfile);
    const range = maxVal - minVal || 1;

    const padding = 20;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    // Draw grid lines
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (plotHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw cyclic profile line
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < cyclicProfile.length; i++) {
      const x = padding + (i / (cyclicProfile.length - 1)) * plotWidth;
      const normalized = (cyclicProfile[i] - minVal) / range;
      const y = height - padding - normalized * plotHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw peak markers
    ctx.fillStyle = '#ff0000';
    peaks.forEach((peakIdx) => {
      const x = padding + (peakIdx / (cyclicProfile.length - 1)) * plotWidth;
      const normalized = (cyclicProfile[peakIdx] - minVal) / range;
      const y = height - padding - normalized * plotHeight;

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw axis labels
    ctx.fillStyle = '#999999';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';

    // Y-axis labels (magnitude)
    for (let i = 0; i <= 5; i++) {
      const val = minVal + (range / 5) * (5 - i);
      const y = padding + (plotHeight / 5) * i;
      ctx.fillText(val.toFixed(2), padding - 5, y + 3);
    }

    // X-axis label
    ctx.textAlign = 'center';
    ctx.fillText('Cyclic Freq (Hz)', width / 2, height - 5);

    // Draw frequency range at top
    ctx.textAlign = 'left';
    ctx.fillText(`${cyclicFreqs[0]?.toFixed(0) || 0}`, padding, 12);
    ctx.textAlign = 'right';
    ctx.fillText(`${cyclicFreqs[cyclicFreqs.length - 1]?.toFixed(0) || 0}`, width - padding, 12);

  }, [cyclicProfile, cyclicFreqs, width, height]);

  if (cyclicProfile.length === 0) {
    return null;
  }

  return (
    <div
      className="absolute right-4 top-4 bg-black/90 border border-cyan-500/50 rounded shadow-lg"
      style={{ width, height }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-cyan-500/30">
        <span className="text-xs font-semibold text-cyan-400">Cyclic Profile</span>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 hover:bg-cyan-500/20"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height - 24} // Account for header
        className="block"
      />

      {/* Legend */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-400 space-y-1">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-cyan-400" />
          <span>Profile</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>Peaks</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Simple peak detection algorithm
 * Returns indices of local maxima above threshold
 */
function findPeaks(data: number[], thresholdRatio: number = 0.3): number[] {
  const peaks: number[] = [];
  const maxVal = Math.max(...data);
  const threshold = maxVal * thresholdRatio;

  for (let i = 1; i < data.length - 1; i++) {
    if (
      data[i] > threshold &&
      data[i] > data[i - 1] &&
      data[i] > data[i + 1]
    ) {
      peaks.push(i);
    }
  }

  return peaks;
}
