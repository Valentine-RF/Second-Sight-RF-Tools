import { Card } from '@/components/ui/card';
import { ReconstructedSignalPlot } from './ReconstructedSignalPlot';

interface ComparisonResult {
  algorithm: string;
  reconstructed: number[];
  rmse: number;
  iterations: number;
  sparsity: number;
}

interface AlgorithmComparisonProps {
  results: ComparisonResult[];
  original?: number[];
}

/**
 * Algorithm Comparison Component
 * Displays side-by-side comparison of multiple algorithm results
 */
export function AlgorithmComparison({ results, original }: AlgorithmComparisonProps) {
  if (results.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No comparison results available
      </div>
    );
  }

  // Sort by RMSE (best first)
  const sortedResults = [...results].sort((a, b) => a.rmse - b.rmse);

  return (
    <div className="space-y-4">
      {/* Summary Table */}
      <Card className="p-4">
        <h4 className="font-bold mb-3">Performance Comparison</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2">Rank</th>
                <th className="text-left py-2 px-2">Algorithm</th>
                <th className="text-right py-2 px-2">RMSE</th>
                <th className="text-right py-2 px-2">Iterations</th>
                <th className="text-right py-2 px-2">Sparsity</th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((result, idx) => (
                <tr
                  key={idx}
                  className={`border-b border-border/50 ${idx === 0 ? 'bg-green-500/10' : ''}`}
                >
                  <td className="py-2 px-2 font-mono">
                    {idx === 0 ? '🏆' : idx + 1}
                  </td>
                  <td className="py-2 px-2 font-mono font-bold">
                    {result.algorithm.toUpperCase()}
                  </td>
                  <td className="py-2 px-2 font-mono text-right">
                    {result.rmse.toFixed(6)}
                  </td>
                  <td className="py-2 px-2 font-mono text-right">
                    {result.iterations}
                  </td>
                  <td className="py-2 px-2 font-mono text-right">
                    {result.sparsity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Individual Visualizations */}
      <div className="space-y-3">
        <h4 className="font-bold">Signal Reconstructions</h4>
        {sortedResults.map((result, idx) => (
          <Card key={idx} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h5 className="font-mono font-bold">
                {idx === 0 && '🏆 '}
                {result.algorithm.toUpperCase()}
              </h5>
              <div className="text-xs text-muted-foreground">
                RMSE: {result.rmse.toFixed(6)}
              </div>
            </div>
            <ReconstructedSignalPlot
              original={original}
              reconstructed={result.reconstructed}
              width={600}
              height={150}
            />
          </Card>
        ))}
      </div>

      {/* Best Algorithm Recommendation */}
      <Card className="p-4 bg-green-500/5 border-green-500/20">
        <div className="flex items-start gap-3">
          <div className="text-2xl">💡</div>
          <div>
            <h5 className="font-bold mb-1">Recommendation</h5>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono font-bold text-green-500">
                {sortedResults[0].algorithm.toUpperCase()}
              </span>{' '}
              achieved the lowest reconstruction error (RMSE: {sortedResults[0].rmse.toFixed(6)})
              {sortedResults[0].iterations < sortedResults[sortedResults.length - 1].iterations &&
                ' with faster convergence'}
              . Consider using this algorithm for similar signals.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
