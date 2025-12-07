import { useEffect, useRef } from 'react';

interface WaveformDisplayProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  label?: string;
  sampleRate?: number;
}

/**
 * Waveform Display Canvas Component
 * Renders time-domain signal waveform
 */
export function WaveformDisplay({
  data,
  width = 600,
  height = 120,
  color = '#3b82f6',
  label,
  sampleRate = 1,
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Find min/max for scaling
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }

    const range = max - min || 1;
    const midY = height / 2;

    // Draw grid lines
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    
    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Vertical grid lines
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const step = Math.max(1, Math.floor(data.length / width));
    
    for (let i = 0; i < data.length; i += step) {
      const x = (i / data.length) * width;
      const normalized = (data[i] - min) / range;
      const y = height - normalized * height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw label
    if (label) {
      ctx.fillStyle = '#fff';
      ctx.font = '11px monospace';
      ctx.fillText(label, 5, 15);
    }

    // Draw amplitude scale
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.fillText(`${max.toFixed(3)}`, width - 50, 12);
    ctx.fillText(`${min.toFixed(3)}`, width - 50, height - 5);

    // Draw time scale
    const duration = data.length / sampleRate;
    ctx.fillText(`0s`, 5, height - 5);
    ctx.fillText(`${duration.toFixed(2)}s`, width - 50, height - 5);
  }, [data, width, height, color, label, sampleRate]);

  return (
    <canvas
      ref={canvasRef}
      className="border border-border rounded bg-black"
      style={{ maxWidth: '100%', height: 'auto' }}
    />
  );
}
