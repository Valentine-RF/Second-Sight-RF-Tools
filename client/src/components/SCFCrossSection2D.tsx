import { useEffect, useRef } from 'react';

interface CrossSectionData {
  axis: number[];
  values: number[];
  slicePosition: number;
  sliceType: 'alpha' | 'tau';
}

interface SCFCrossSection2DProps {
  data: CrossSectionData;
  width?: number;
  height?: number;
  showPeak?: boolean;
}

/**
 * SCFCrossSection2D - Canvas visualization for SCF cross-section slices
 * 
 * Displays 2D line plot of SCF magnitude along alpha or tau axis
 */
export function SCFCrossSection2D({
  data,
  width = 600,
  height = 300,
  showPeak = true,
}: SCFCrossSection2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.axis.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Calculate plot dimensions
    const padding = { top: 50, right: 60, bottom: 60, left: 70 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    // Find data ranges
    const minAxis = Math.min(...data.axis);
    const maxAxis = Math.max(...data.axis);
    const axisRange = maxAxis - minAxis || 1;

    const minValue = Math.min(...data.values);
    const maxValue = Math.max(...data.values);
    const valueRange = maxValue - minValue || 1;
    const valueMargin = valueRange * 0.1;

    // Helper functions
    const xScale = (axisVal: number) => 
      padding.left + ((axisVal - minAxis) / axisRange) * plotWidth;
    
    const yScale = (value: number) => 
      padding.top + plotHeight - ((value - minValue + valueMargin) / (valueRange + 2 * valueMargin)) * plotHeight;

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    // Horizontal grid lines (magnitude)
    const valueStep = Math.pow(10, Math.floor(Math.log10(valueRange))) / 2;
    for (let val = Math.floor(minValue / valueStep) * valueStep; val <= maxValue; val += valueStep) {
      const y = yScale(val);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotWidth, y);
      ctx.stroke();
    }

    // Vertical grid lines (axis)
    const axisStep = Math.pow(10, Math.floor(Math.log10(axisRange))) / 4;
    for (let axisVal = Math.ceil(minAxis / axisStep) * axisStep; axisVal <= maxAxis; axisVal += axisStep) {
      const x = xScale(axisVal);
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

    // Draw zero line if in range
    if (minValue <= 0 && maxValue >= 0) {
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      const y0 = yScale(0);
      ctx.beginPath();
      ctx.moveTo(padding.left, y0);
      ctx.lineTo(padding.left + plotWidth, y0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw cross-section line
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.axis.forEach((axisVal, i) => {
      const x = xScale(axisVal);
      const y = yScale(data.values[i]);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw data points
    ctx.fillStyle = '#3b82f6';
    data.axis.forEach((axisVal, i) => {
      const x = xScale(axisVal);
      const y = yScale(data.values[i]);
      
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Find and mark peak
    if (showPeak) {
      let peakIdx = 0;
      let peakValue = data.values[0];
      
      data.values.forEach((val, i) => {
        if (val > peakValue) {
          peakValue = val;
          peakIdx = i;
        }
      });

      const peakX = xScale(data.axis[peakIdx]);
      const peakY = yScale(peakValue);

      // Draw peak marker
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(peakX, peakY, 6, 0, 2 * Math.PI);
      ctx.stroke();

      // Draw peak label
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PEAK', peakX, peakY - 15);
      
      ctx.font = '10px monospace';
      ctx.fillText(
        `${data.axis[peakIdx].toFixed(2)}, ${peakValue.toFixed(3)}`,
        peakX,
        peakY - 28
      );
    }

    // Draw labels
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';

    // Y-axis labels (magnitude)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let val = Math.floor(minValue / valueStep) * valueStep; val <= maxValue; val += valueStep) {
      const y = yScale(val);
      ctx.fillText(val.toFixed(3), padding.left - 10, y);
    }

    // X-axis labels (axis)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    for (let axisVal = Math.ceil(minAxis / axisStep) * axisStep; axisVal <= maxAxis; axisVal += axisStep) {
      const x = xScale(axisVal);
      ctx.fillText(axisVal.toFixed(1), x, padding.top + plotHeight + 10);
    }

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    const sliceLabel = data.sliceType === 'alpha'
      ? `SCF Cross-Section at α = ${data.slicePosition.toFixed(2)} Hz`
      : `SCF Cross-Section at τ = ${data.slicePosition.toFixed(2)} samples`;
    
    ctx.fillText(sliceLabel, width / 2, 25);

    // Y-axis title
    ctx.save();
    ctx.translate(20, padding.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText('SCF Magnitude', 0, 0);
    ctx.restore();

    // X-axis title
    ctx.fillStyle = '#aaa';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    const xAxisLabel = data.sliceType === 'alpha'
      ? 'Lag (τ) [samples]'
      : 'Cyclic Frequency (α) [Hz]';
    
    ctx.fillText(xAxisLabel, width / 2, height - 20);

    // Statistics box
    const mean = data.values.reduce((sum, v) => sum + v, 0) / data.values.length;
    const statsX = width - padding.right + 10;
    const statsY = padding.top + 20;

    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillText(`Max: ${maxValue.toFixed(3)}`, statsX, statsY);
    ctx.fillText(`Mean: ${mean.toFixed(3)}`, statsX, statsY + 15);
    ctx.fillText(`Min: ${minValue.toFixed(3)}`, statsX, statsY + 30);

  }, [data, width, height, showPeak]);

  if (data.axis.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border border-border rounded bg-muted/20">
        <p className="text-muted-foreground text-sm">No cross-section data available</p>
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
