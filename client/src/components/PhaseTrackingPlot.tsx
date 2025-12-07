import { useEffect, useRef } from 'react';

interface PhaseTrackingPlotProps {
  phaseErrors: number[];
  frequencies: number[];
  lockThreshold?: number;
  lockTimeSamples?: number | null;
  loopBandwidth: number;
  modulationOrder: number;
  width?: number;
  height?: number;
}

/**
 * PhaseTrackingPlot - Canvas visualization for Costas loop phase tracking
 * 
 * Displays phase error variance and frequency convergence over time
 */
export function PhaseTrackingPlot({
  phaseErrors,
  frequencies,
  lockThreshold = 0.1,
  lockTimeSamples,
  loopBandwidth,
  modulationOrder,
  width = 600,
  height = 300,
}: PhaseTrackingPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Calculate plot dimensions
    const padding = { top: 40, right: 60, bottom: 40, left: 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    // Horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (plotHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotWidth, y);
      ctx.stroke();
    }

    // Vertical grid lines
    for (let i = 0; i <= 4; i++) {
      const x = padding.left + (plotWidth / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + plotHeight);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Draw axes
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + plotHeight);
    ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
    ctx.stroke();

    // Calculate data ranges
    const numSamples = phaseErrors.length;
    const maxPhaseError = Math.max(...phaseErrors.map(Math.abs));
    const minFreq = Math.min(...frequencies);
    const maxFreq = Math.max(...frequencies);
    const freqRange = maxFreq - minFreq;

    // Draw phase error plot (top half)
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < numSamples; i++) {
      const x = padding.left + (i / numSamples) * plotWidth;
      const normalizedError = phaseErrors[i] / (maxPhaseError || 1);
      const y = padding.top + plotHeight * 0.25 - (normalizedError * plotHeight * 0.2);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw lock threshold line
    if (lockThreshold) {
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      
      const thresholdY = padding.top + plotHeight * 0.25 - (lockThreshold / (maxPhaseError || 1) * plotHeight * 0.2);
      ctx.beginPath();
      ctx.moveTo(padding.left, thresholdY);
      ctx.lineTo(padding.left + plotWidth, thresholdY);
      ctx.stroke();
      
      ctx.setLineDash([]);
    }

    // Draw lock time indicator
    if (lockTimeSamples !== null && lockTimeSamples !== undefined && lockTimeSamples > 0) {
      const lockX = padding.left + (lockTimeSamples / numSamples) * plotWidth;
      
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(lockX, padding.top);
      ctx.lineTo(lockX, padding.top + plotHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Lock label
      ctx.fillStyle = '#4ade80';
      ctx.font = '10px monospace';
      ctx.fillText('LOCK', lockX + 5, padding.top + 15);
    }

    // Draw frequency plot (bottom half)
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < numSamples; i++) {
      const x = padding.left + (i / numSamples) * plotWidth;
      const normalizedFreq = freqRange > 0 ? (frequencies[i] - minFreq) / freqRange : 0.5;
      const y = padding.top + plotHeight * 0.75 - (normalizedFreq * plotHeight * 0.4);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw labels
    ctx.fillStyle = '#aaa';
    ctx.font = '12px monospace';

    // Y-axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    // Phase error labels
    ctx.fillText(maxPhaseError.toFixed(3), padding.left - 5, padding.top + plotHeight * 0.05);
    ctx.fillText('0', padding.left - 5, padding.top + plotHeight * 0.25);
    ctx.fillText((-maxPhaseError).toFixed(3), padding.left - 5, padding.top + plotHeight * 0.45);
    
    // Frequency labels
    ctx.fillText(maxFreq.toFixed(3), padding.left - 5, padding.top + plotHeight * 0.55);
    ctx.fillText(((maxFreq + minFreq) / 2).toFixed(3), padding.left - 5, padding.top + plotHeight * 0.75);
    ctx.fillText(minFreq.toFixed(3), padding.left - 5, padding.top + plotHeight * 0.95);

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('0', padding.left, padding.top + plotHeight + 5);
    ctx.fillText((numSamples / 2).toFixed(0), padding.left + plotWidth / 2, padding.top + plotHeight + 5);
    ctx.fillText(numSamples.toFixed(0), padding.left + plotWidth, padding.top + plotHeight + 5);

    // Axis titles
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Phase Tracking Performance', width / 2, 20);

    // Y-axis title (phase error)
    ctx.save();
    ctx.translate(15, padding.top + plotHeight * 0.25);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('Phase Error', 0, 0);
    ctx.restore();

    // Y-axis title (frequency)
    ctx.save();
    ctx.translate(15, padding.top + plotHeight * 0.75);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('Frequency (norm)', 0, 0);
    ctx.restore();

    // X-axis title
    ctx.fillStyle = '#aaa';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Sample Index', width / 2, height - 15);

    // Legend
    const legendX = width - padding.right - 10;
    const legendY = padding.top + 10;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = '10px monospace';

    ctx.fillStyle = '#00d4ff';
    ctx.fillText('Phase Error', legendX, legendY);
    
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('Frequency', legendX, legendY + 15);
    
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText(`Threshold: ${lockThreshold}`, legendX, legendY + 30);
    
    ctx.fillStyle = '#aaa';
    ctx.fillText(`BW: ${loopBandwidth}`, legendX, legendY + 45);
    ctx.fillText(`Order: ${modulationOrder}`, legendX, legendY + 60);

  }, [phaseErrors, frequencies, lockThreshold, lockTimeSamples, loopBandwidth, modulationOrder, width, height]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="border border-border rounded"
      />
    </div>
  );
}
