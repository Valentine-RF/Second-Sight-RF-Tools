import { useEffect, useRef } from 'react';

interface CFODataPoint {
  annotationId: number;
  label?: string;
  timestamp: number; // Sample index or time
  coarseCfoHz: number;
  refinedCfoHz?: number;
  lockDetected?: boolean;
}

interface CFODriftTimelineProps {
  dataPoints: CFODataPoint[];
  sampleRate?: number;
  width?: number;
  height?: number;
  driftThreshold?: number; // Hz/s threshold for highlighting instability
}

/**
 * CFODriftTimeline - Canvas visualization for CFO history and carrier drift
 * 
 * Shows CFO evolution over time with drift rate indicators
 */
export function CFODriftTimeline({
  dataPoints,
  sampleRate = 1e6,
  width = 800,
  height = 400,
  driftThreshold = 100, // Hz/s
}: CFODriftTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dataPoints.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Calculate plot dimensions
    const padding = { top: 50, right: 80, bottom: 60, left: 80 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    // Find data ranges
    const timestamps = dataPoints.map(d => d.timestamp);
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const timeRange = maxTime - minTime || 1;

    const allCfos = dataPoints.flatMap(d => [d.coarseCfoHz, d.refinedCfoHz || d.coarseCfoHz]);
    const minCfo = Math.min(...allCfos);
    const maxCfo = Math.max(...allCfos);
    const cfoRange = maxCfo - minCfo || 100;
    const cfoMargin = cfoRange * 0.1;

    // Helper functions
    const xScale = (t: number) => padding.left + ((t - minTime) / timeRange) * plotWidth;
    const yScale = (cfo: number) => padding.top + plotHeight - ((cfo - minCfo + cfoMargin) / (cfoRange + 2 * cfoMargin)) * plotHeight;

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    // Horizontal grid lines (CFO)
    const cfoStep = Math.pow(10, Math.floor(Math.log10(cfoRange))) / 2;
    for (let cfo = Math.floor(minCfo / cfoStep) * cfoStep; cfo <= maxCfo; cfo += cfoStep) {
      const y = yScale(cfo);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotWidth, y);
      ctx.stroke();
    }

    // Vertical grid lines (time)
    const timeStep = Math.pow(10, Math.floor(Math.log10(timeRange))) / 4;
    for (let t = Math.ceil(minTime / timeStep) * timeStep; t <= maxTime; t += timeStep) {
      const x = xScale(t);
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

    // Draw coarse CFO line
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    dataPoints.forEach((point, i) => {
      const x = xScale(point.timestamp);
      const y = yScale(point.coarseCfoHz);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();

    // Draw refined CFO line
    const refinedPoints = dataPoints.filter(d => d.refinedCfoHz !== undefined);
    if (refinedPoints.length > 0) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      refinedPoints.forEach((point, i) => {
        const x = xScale(point.timestamp);
        const y = yScale(point.refinedCfoHz!);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
    }

    // Calculate and draw drift rate indicators
    for (let i = 1; i < dataPoints.length; i++) {
      const prev = dataPoints[i - 1];
      const curr = dataPoints[i];
      
      const prevCfo = prev.refinedCfoHz || prev.coarseCfoHz;
      const currCfo = curr.refinedCfoHz || curr.coarseCfoHz;
      
      const timeDiff = (curr.timestamp - prev.timestamp) / sampleRate; // seconds
      const cfoDiff = currCfo - prevCfo; // Hz
      const driftRate = timeDiff > 0 ? cfoDiff / timeDiff : 0; // Hz/s
      
      // Highlight high drift rates
      if (Math.abs(driftRate) > driftThreshold) {
        const x1 = xScale(prev.timestamp);
        const y1 = yScale(prevCfo);
        const x2 = xScale(curr.timestamp);
        const y2 = yScale(currCfo);
        
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw drift rate label
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        ctx.fillStyle = '#ef4444';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${driftRate.toFixed(1)} Hz/s`, midX, midY - 5);
      }
    }

    // Draw data points
    dataPoints.forEach((point) => {
      const x = xScale(point.timestamp);
      
      // Coarse CFO point
      const yCoarse = yScale(point.coarseCfoHz);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(x, yCoarse, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      // Refined CFO point
      if (point.refinedCfoHz !== undefined) {
        const yRefined = yScale(point.refinedCfoHz);
        ctx.fillStyle = point.lockDetected ? '#4ade80' : '#f97316';
        ctx.beginPath();
        ctx.arc(x, yRefined, 5, 0, 2 * Math.PI);
        ctx.fill();
        
        // Lock indicator
        if (point.lockDetected) {
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, yRefined, 7, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    });

    // Draw labels
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';

    // Y-axis labels (CFO)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let cfo = Math.floor(minCfo / cfoStep) * cfoStep; cfo <= maxCfo; cfo += cfoStep) {
      const y = yScale(cfo);
      ctx.fillText(`${cfo.toFixed(0)} Hz`, padding.left - 10, y);
    }

    // X-axis labels (time)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    for (let t = Math.ceil(minTime / timeStep) * timeStep; t <= maxTime; t += timeStep) {
      const x = xScale(t);
      const timeMs = (t / sampleRate) * 1000;
      ctx.fillText(`${timeMs.toFixed(0)} ms`, x, padding.top + plotHeight + 10);
    }

    // Axis titles
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('CFO Drift Timeline', width / 2, 25);

    // Y-axis title
    ctx.save();
    ctx.translate(20, padding.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Carrier Frequency Offset (Hz)', 0, 0);
    ctx.restore();

    // X-axis title
    ctx.fillStyle = '#aaa';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Time (ms)', width / 2, height - 20);

    // Legend
    const legendX = width - padding.right + 10;
    const legendY = padding.top + 20;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '11px monospace';

    // Coarse CFO
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(legendX, legendY, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillText('Coarse', legendX + 10, legendY);

    // Refined CFO
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(legendX, legendY + 20, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillText('Refined', legendX + 10, legendY + 20);

    // High drift
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(legendX - 5, legendY + 40);
    ctx.lineTo(legendX + 5, legendY + 40);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ef4444';
    ctx.fillText(`Drift >${driftThreshold} Hz/s`, legendX + 10, legendY + 40);

    // Annotation count
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.fillText(`${dataPoints.length} annotations`, legendX, legendY + 60);

  }, [dataPoints, sampleRate, width, height, driftThreshold]);

  if (dataPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border border-border rounded bg-muted/20">
        <p className="text-muted-foreground text-sm">No CFO data available</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="border border-border rounded"
      />
    </div>
  );
}
