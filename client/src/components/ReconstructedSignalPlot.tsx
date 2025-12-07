import { useEffect, useRef } from 'react';

interface ReconstructedSignalPlotProps {
  original?: number[];
  reconstructed: number[];
  width?: number;
  height?: number;
}

/**
 * Reconstructed Signal Plot Component
 * Overlays original and reconstructed signals for comparison
 */
export function ReconstructedSignalPlot({
  original,
  reconstructed,
  width = 700,
  height = 250,
}: ReconstructedSignalPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !reconstructed || reconstructed.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Find global min/max for consistent scaling
    let min = Infinity;
    let max = -Infinity;
    
    for (let i = 0; i < reconstructed.length; i++) {
      if (reconstructed[i] < min) min = reconstructed[i];
      if (reconstructed[i] > max) max = reconstructed[i];
    }
    
    if (original) {
      for (let i = 0; i < original.length; i++) {
        if (original[i] < min) min = original[i];
        if (original[i] > max) max = original[i];
      }
    }

    const range = max - min || 1;

    // Draw grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    
    // Horizontal lines
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Vertical lines
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw original signal (if provided)
    if (original && original.length > 0) {
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();

      const step = Math.max(1, Math.floor(original.length / width));
      
      for (let i = 0; i < original.length; i += step) {
        const x = (i / original.length) * width;
        const normalized = (original[i] - min) / range;
        const y = height - normalized * height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw reconstructed signal
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const step = Math.max(1, Math.floor(reconstructed.length / width));
    
    for (let i = 0; i < reconstructed.length; i += step) {
      const x = (i / reconstructed.length) * width;
      const normalized = (reconstructed[i] - min) / range;
      const y = height - normalized * height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw legend
    ctx.font = '12px monospace';
    
    if (original) {
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(10, 15);
      ctx.lineTo(40, 15);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = '#666';
      ctx.fillText('Original', 45, 18);
    }

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 35);
    ctx.lineTo(40, 35);
    ctx.stroke();
    
    ctx.fillStyle = '#10b981';
    ctx.fillText('Reconstructed', 45, 38);

    // Draw amplitude scale
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.fillText(`${max.toFixed(3)}`, width - 60, 12);
    ctx.fillText(`${min.toFixed(3)}`, width - 60, height - 5);
  }, [original, reconstructed, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="border border-border rounded bg-black"
      style={{ maxWidth: '100%', height: 'auto' }}
    />
  );
}
