import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

interface AnnotationStatisticsProps {
  captureId?: number;
}

/**
 * Annotation Statistics Dashboard
 * 
 * Displays:
 * - Modulation type distribution (bar chart)
 * - Average SNR across annotations
 * - Temporal analysis of signal characteristics
 * - Total annotation count and coverage
 */
export function AnnotationStatistics({ captureId }: AnnotationStatisticsProps) {
  const { data: annotations, isLoading } = trpc.annotations.list.useQuery(
    { captureId: captureId! },
    { enabled: !!captureId }
  );

  const stats = useMemo(() => {
    if (!annotations || annotations.length === 0) {
      return null;
    }

    // Modulation type distribution
    const modulationCounts: Record<string, number> = {};
    annotations.forEach((ann: any) => {
      const mod = ann.label || 'Unknown';
      modulationCounts[mod] = (modulationCounts[mod] || 0) + 1;
    });

    const modulationDist = Object.entries(modulationCounts)
      .map(([label, count]) => ({ label, count, percentage: (count / annotations.length) * 100 }))
      .sort((a, b) => b.count - a.count);

    // SNR statistics (if available in metadata)
    const snrValues = annotations
      .map((ann: any) => ann.metadata?.snr)
      .filter((snr): snr is number => typeof snr === 'number');
    
    const avgSNR = snrValues.length > 0
      ? snrValues.reduce((sum, val) => sum + val, 0) / snrValues.length
      : null;

    const maxSNR = snrValues.length > 0 ? Math.max(...snrValues) : null;
    const minSNR = snrValues.length > 0 ? Math.min(...snrValues) : null;

    // Temporal coverage
    const totalSamples = annotations.reduce((sum: number, ann: any) => sum + (ann.sampleCount || 0), 0);

    return {
      totalAnnotations: annotations.length,
      modulationDist,
      avgSNR,
      maxSNR,
      minSNR,
      totalSamples,
    };
  }, [annotations]);

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Loading statistics...</div>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">No annotations to analyze</div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <Card className="p-4">
        <h4 className="font-black mb-3">Summary</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Total Annotations</div>
            <div className="text-2xl font-bold">{stats.totalAnnotations}</div>
          </div>
          {stats.avgSNR !== null && (
            <div>
              <div className="text-muted-foreground">Avg SNR</div>
              <div className="text-2xl font-bold">{stats.avgSNR.toFixed(1)} dB</div>
            </div>
          )}
        </div>
      </Card>

      {/* Modulation Distribution */}
      <Card className="p-4">
        <h4 className="font-black mb-3">Modulation Distribution</h4>
        <div className="space-y-2">
          {stats.modulationDist.map((item) => (
            <div key={item.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-mono">{item.label}</span>
                <span className="font-mono">
                  {item.count} ({item.percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* SNR Range */}
      {stats.avgSNR !== null && (
        <Card className="p-4">
          <h4 className="font-black mb-3">SNR Range</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Minimum</span>
              <span className="font-mono">{stats.minSNR?.toFixed(1)} dB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Average</span>
              <span className="font-mono font-bold">{stats.avgSNR.toFixed(1)} dB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Maximum</span>
              <span className="font-mono">{stats.maxSNR?.toFixed(1)} dB</span>
            </div>
          </div>
        </Card>
      )}

      {/* Coverage */}
      <Card className="p-4">
        <h4 className="font-black mb-3">Coverage</h4>
        <div className="text-sm">
          <div className="text-muted-foreground">Total Samples Annotated</div>
          <div className="text-lg font-mono">{stats.totalSamples.toLocaleString()}</div>
        </div>
      </Card>
    </div>
  );
}
