import { useEffect, useRef } from 'react';

interface WVDHeatmapProps {
  data: number[][];
  timePoints: number;
  freqPoints: number;
  width?: number;
  height?: number;
  colormap?: 'viridis' | 'turbo' | 'plasma';
}

/**
 * WVD Heatmap Canvas Component
 * Renders Wigner-Ville Distribution as a 2D heatmap
 */
export function WVDHeatmap({
  data,
  timePoints,
  freqPoints,
  width = 800,
  height = 400,
  colormap = 'viridis',
}: WVDHeatmapProps) {
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
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Find min/max for normalization
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      for (let j = 0; j < data[i].length; j++) {
        const val = data[i][j];
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }

    const range = max - min || 1;

    // Calculate pixel sizes
    const pixelWidth = width / timePoints;
    const pixelHeight = height / freqPoints;

    // Render heatmap
    for (let t = 0; t < timePoints; t++) {
      for (let f = 0; f < freqPoints; f++) {
        if (t >= data.length || f >= data[t].length) continue;

        const value = data[t][f];
        const normalized = (value - min) / range;

        // Apply colormap
        const color = getColor(normalized, colormap);
        ctx.fillStyle = color;

        // Draw pixel (flip vertically so low frequencies are at bottom)
        const x = t * pixelWidth;
        const y = height - (f + 1) * pixelHeight;
        ctx.fillRect(x, y, Math.ceil(pixelWidth), Math.ceil(pixelHeight));
      }
    }

    // Draw axes labels
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText('Time →', width - 60, height - 5);
    ctx.save();
    ctx.translate(10, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Frequency →', 0, 0);
    ctx.restore();
  }, [data, timePoints, freqPoints, width, height, colormap]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="border border-border rounded"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    </div>
  );
}

/**
 * Get color from colormap
 */
function getColor(value: number, colormap: string): string {
  // Clamp value to [0, 1]
  value = Math.max(0, Math.min(1, value));

  switch (colormap) {
    case 'viridis':
      return viridis(value);
    case 'turbo':
      return turbo(value);
    case 'plasma':
      return plasma(value);
    default:
      return viridis(value);
  }
}

/**
 * Viridis colormap (approximation)
 */
function viridis(t: number): string {
  const r = Math.round(255 * (0.267 + t * (0.329 - 0.267)));
  const g = Math.round(255 * (0.005 + t * (0.993 - 0.005)));
  const b = Math.round(255 * (0.329 + t * (0.545 - 0.329)));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Turbo colormap (approximation)
 */
function turbo(t: number): string {
  const r = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(2 * t - 1))));
  const g = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(2 * t - 0.5))));
  const b = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(2 * t))));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Plasma colormap (approximation)
 */
function plasma(t: number): string {
  const r = Math.round(255 * (0.050 + t * (0.940 - 0.050)));
  const g = Math.round(255 * (0.030 + t * (0.280 - 0.030)));
  const b = Math.round(255 * (0.530 + t * (0.150 - 0.530)));
  return `rgb(${r}, ${g}, ${b})`;
}
