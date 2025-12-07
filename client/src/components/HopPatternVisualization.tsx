import { Card } from '@/components/ui/card';

interface FrequencyHop {
  time: number;
  frequency: number;
  duration: number;
  power: number;
}

interface HopPatternVisualizationProps {
  hops: FrequencyHop[];
  hopRate: number;
  avgDwellTime: number;
  frequencyRange: number;
  uniqueFrequencies: number;
  pattern: 'random' | 'sequential' | 'periodic' | 'unknown';
}

/**
 * Hop Pattern Visualization Component
 * 
 * Displays frequency hopping timeline with transitions and statistics
 */
export function HopPatternVisualization({
  hops,
  hopRate,
  avgDwellTime,
  frequencyRange,
  uniqueFrequencies,
  pattern,
}: HopPatternVisualizationProps) {
  if (hops.length === 0) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">No hops detected</div>
      </Card>
    );
  }

  const minFreq = Math.min(...hops.map(h => h.frequency));
  const maxFreq = Math.max(...hops.map(h => h.frequency));
  const minTime = hops[0].time;
  const maxTime = hops[hops.length - 1].time + hops[hops.length - 1].duration;
  const timeRange = maxTime - minTime;

  const width = 600;
  const height = 200;
  const padding = 40;

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <Card className="p-4">
        <h4 className="font-black mb-3">Hopping Statistics</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Pattern Type</div>
            <div className="text-lg font-bold capitalize">{pattern}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Hop Rate</div>
            <div className="text-lg font-bold">{hopRate.toFixed(1)} Hz</div>
          </div>
          <div>
            <div className="text-muted-foreground">Avg Dwell Time</div>
            <div className="text-lg font-bold">{(avgDwellTime * 1000).toFixed(1)} ms</div>
          </div>
          <div>
            <div className="text-muted-foreground">Unique Frequencies</div>
            <div className="text-lg font-bold">{uniqueFrequencies}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Frequency Range</div>
            <div className="text-lg font-bold">{(frequencyRange / 1e3).toFixed(1)} kHz</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total Hops</div>
            <div className="text-lg font-bold">{hops.length}</div>
          </div>
        </div>
      </Card>

      {/* Timeline Visualization */}
      <Card className="p-4">
        <h4 className="font-black mb-3">Hop Timeline</h4>
        <svg width={width} height={height} className="overflow-visible">
          {/* Axes */}
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="currentColor"
            strokeOpacity="0.3"
          />
          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke="currentColor"
            strokeOpacity="0.3"
          />

          {/* Time axis labels */}
          <text x={padding} y={height - padding + 20} fontSize="10" fill="currentColor" opacity="0.6">
            0 ms
          </text>
          <text x={width - padding} y={height - padding + 20} fontSize="10" fill="currentColor" opacity="0.6" textAnchor="end">
            {(timeRange * 1000).toFixed(0)} ms
          </text>

          {/* Frequency axis labels */}
          <text x={padding - 5} y={height - padding} fontSize="10" fill="currentColor" opacity="0.6" textAnchor="end">
            {(minFreq / 1e3).toFixed(0)} kHz
          </text>
          <text x={padding - 5} y={padding} fontSize="10" fill="currentColor" opacity="0.6" textAnchor="end">
            {(maxFreq / 1e3).toFixed(0)} kHz
          </text>

          {/* Hop rectangles */}
          {hops.map((hop, idx) => {
            const x = padding + ((hop.time - minTime) / timeRange) * (width - 2 * padding);
            const y = padding + (1 - (hop.frequency - minFreq) / (maxFreq - minFreq)) * (height - 2 * padding);
            const w = (hop.duration / timeRange) * (width - 2 * padding);
            const h = 4;

            return (
              <g key={idx}>
                <rect
                  x={x}
                  y={y - h / 2}
                  width={w}
                  height={h}
                  fill="hsl(var(--primary))"
                  opacity="0.8"
                />
                <circle
                  cx={x}
                  cy={y}
                  r="2"
                  fill="hsl(var(--primary))"
                />
              </g>
            );
          })}

          {/* Hop transitions (lines connecting hops) */}
          {hops.slice(0, -1).map((hop, idx) => {
            const nextHop = hops[idx + 1];
            const x1 = padding + ((hop.time + hop.duration - minTime) / timeRange) * (width - 2 * padding);
            const y1 = padding + (1 - (hop.frequency - minFreq) / (maxFreq - minFreq)) * (height - 2 * padding);
            const x2 = padding + ((nextHop.time - minTime) / timeRange) * (width - 2 * padding);
            const y2 = padding + (1 - (nextHop.frequency - minFreq) / (maxFreq - minFreq)) * (height - 2 * padding);

            return (
              <line
                key={idx}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="hsl(var(--primary))"
                strokeWidth="1"
                strokeOpacity="0.3"
                strokeDasharray="2,2"
              />
            );
          })}
        </svg>
      </Card>
    </div>
  );
}
