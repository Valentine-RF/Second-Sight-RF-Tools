import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MetadataLearningDB, type LearningStats } from '@/lib/metadataLearningDB';
import { Trash2, Download, Upload, TrendingUp, Database, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export const LearningStatsDashboard: React.FC = () => {
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = () => {
    const learningStats = MetadataLearningDB.getStats();
    setStats(learningStats);
  };

  const handleClearData = () => {
    MetadataLearningDB.clearAll();
    loadStats();
    setShowClearConfirm(false);
    toast.success('Learning data cleared');
  };

  const handleExport = () => {
    try {
      const jsonData = MetadataLearningDB.exportData();
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signal-learning-data-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Learning data exported');
    } catch (error) {
      toast.error('Export failed');
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        MetadataLearningDB.importData(text);
        loadStats();
        toast.success('Learning data imported');
      } catch (error) {
        toast.error('Import failed');
      }
    };
    
    input.click();
  };

  if (!stats) return <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Loading...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Learning Statistics</h2>
          <p className="text-sm text-muted-foreground mt-1">Metadata detection improves over time</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export</Button>
          <Button variant="outline" size="sm" onClick={handleImport}><Upload className="w-4 h-4 mr-2" />Import</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4"><div className="flex items-center gap-3"><Database className="w-8 h-8 text-primary" /><div><p className="text-2xl font-bold">{stats.totalPatterns}</p><p className="text-sm text-muted-foreground">Learned Patterns</p></div></div></Card>
        <Card className="p-4"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-400" /><div><p className="text-2xl font-bold">{stats.totalCorrections}</p><p className="text-sm text-muted-foreground">User Corrections</p></div></div></Card>
        <Card className="p-4"><div className="flex items-center gap-3"><TrendingUp className="w-8 h-8 text-blue-400" /><div><p className="text-2xl font-bold">{stats.avgConfidence.toFixed(1)}%</p><p className="text-sm text-muted-foreground">Avg Confidence</p></div></div></Card>
      </div>

      {stats.mostUsedPatterns.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Most Used Patterns</h3>
          <div className="space-y-3">
            {stats.mostUsedPatterns.map((pattern) => (
              <div key={pattern.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex-1">
                  <p className="font-mono text-sm mb-1">{pattern.filenamePattern}</p>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {pattern.metadata.sampleRate && <span>Rate: {(pattern.metadata.sampleRate / 1e6).toFixed(1)} MSps</span>}
                    {pattern.metadata.centerFrequency && <span>Freq: {(pattern.metadata.centerFrequency / 1e6).toFixed(1)} MHz</span>}
                    {pattern.metadata.datatype && <span>Type: {pattern.metadata.datatype}</span>}
                    {pattern.metadata.hardware && <span>HW: {pattern.metadata.hardware}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right"><p className="font-semibold">{pattern.matchCount}</p><p className="text-xs text-muted-foreground">matches</p></div>
                  <div className="text-right"><p className={`font-semibold ${pattern.confidence >= 80 ? 'text-green-400' : pattern.confidence >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{pattern.confidence}%</p><p className="text-xs text-muted-foreground">confidence</p></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {stats.totalPatterns === 0 && stats.totalCorrections === 0 && (
        <Card className="p-12 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Learning Data Yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Upload files using Smart Upload to start building your pattern database.</p>
        </Card>
      )}

      {(stats.totalPatterns > 0 || stats.totalCorrections > 0) && (
        <Card className="p-6 border-destructive/50">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Trash2 className="w-5 h-5 text-destructive" />Clear Learning Data</h3>
              <p className="text-sm text-muted-foreground">Permanently delete all learned patterns. Consider exporting first.</p>
            </div>
            {!showClearConfirm ? (
              <Button variant="destructive" onClick={() => setShowClearConfirm(true)}>Clear All Data</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleClearData}>Confirm Delete</Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
