import { useEffect, useRef } from 'react';
import { useSignalMetrics } from '@/hooks/useSignalMetrics';
import { useSignalStore } from '@/store/signalStore';

interface FFTPSDPlotProps {
  frequencies: number[];
  magnitudes: number[];
  width?: number;
  height?: number;
  centerFreq?: number;
}

export function FFTPSDPlot({ frequencies, magnitudes, width = 800, height = 300, centerFreq = 0 }: FFTPSDPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { updateMetricsFromPlot } = useSignalMetrics();
  const currentCapture = useSignalStore((state) => state.currentCapture);

  useEffect(() => {
    if (!canvasRef.current || frequencies.length === 0 || magnitudes.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, width, height);

    // Margins
    const marginLeft = 60;
    const marginRight = 20;
    const marginTop = 20;
    const marginBottom = 40;
    const plotWidth = width - marginLeft - marginRight;
    const plotHeight = height - marginTop - marginBottom;

    // Find min/max for scaling
    const minMag = Math.min(...magnitudes);
    const maxMag = Math.max(...magnitudes);
    const minFreq = frequencies[0];
    const maxFreq = frequencies[frequencies.length - 1];

    // Draw grid
    ctx.strokeStyle = '#1a2332';
    ctx.lineWidth = 1;

    // Horizontal grid lines (magnitude)
    for (let i = 0; i <= 5; i++) {
      const y = marginTop + (plotHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(marginLeft + plotWidth, y);
      ctx.stroke();

      // Y-axis labels (dB)
      const mag = maxMag - (maxMag - minMag) * (i / 5);
      ctx.fillStyle = '#64748b';
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(mag.toFixed(1), marginLeft - 10, y + 4);
    }

    // Vertical grid lines (frequency)
    for (let i = 0; i <= 10; i++) {
      const x = marginLeft + (plotWidth / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, marginTop);
      ctx.lineTo(x, marginTop + plotHeight);
      ctx.stroke();

      // X-axis labels (frequency in MHz)
      const freq = minFreq + (maxFreq - minFreq) * (i / 10);
      const freqMHz = (freq + centerFreq) / 1e6;
      ctx.fillStyle = '#64748b';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(freqMHz.toFixed(2), x, marginTop + plotHeight + 20);
    }

    // Draw axes labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Frequency (MHz)', marginLeft + plotWidth / 2, height - 5);

    ctx.save();
    ctx.translate(15, marginTop + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Power (dB)', 0, 0);
    ctx.restore();

    // Draw PSD curve
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < frequencies.length; i++) {
      const x = marginLeft + ((frequencies[i] - minFreq) / (maxFreq - minFreq)) * plotWidth;
      const y = marginTop + plotHeight - ((magnitudes[i] - minMag) / (maxMag - minMag)) * plotHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw peak marker if exists
    const peakIdx = magnitudes.indexOf(maxMag);
    if (peakIdx !== -1) {
      const peakX = marginLeft + ((frequencies[peakIdx] - minFreq) / (maxFreq - minFreq)) * plotWidth;
      const peakY = marginTop + plotHeight - ((magnitudes[peakIdx] - minMag) / (maxMag - minMag)) * plotHeight;

      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(peakX, peakY, 4, 0, 2 * Math.PI);
      ctx.fill();

      // Peak label
      const peakFreqMHz = (frequencies[peakIdx] + centerFreq) / 1e6;
      ctx.fillStyle = '#f472b6';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Peak: ${peakFreqMHz.toFixed(3)} MHz, ${maxMag.toFixed(1)} dB`, peakX + 8, peakY - 8);
    }

    // Calculate and store metrics
    if (currentCapture?.sampleRate) {
      updateMetricsFromPlot(frequencies, magnitudes, currentCapture.sampleRate);
    }

  }, [frequencies, magnitudes, width, height, centerFreq, currentCapture, updateMetricsFromPlot]);

  if (frequencies.length === 0 || magnitudes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a signal region and classify to view FFT spectrum
      </div>
    );
  }

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
