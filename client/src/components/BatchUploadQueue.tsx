import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { SignalFormatDetector, type DetectedMetadata } from '@/lib/signalFormatDetector';
import { SignalPreviewGenerator, type SignalPreview } from '@/lib/signalPreviewGenerator';
import { MetadataLearningDB } from '@/lib/metadataLearningDB';
import { Upload, X, CheckCircle, AlertCircle, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface QueuedFile {
  id: string;
  file: File;
  metadata: DetectedMetadata | null;
  preview: SignalPreview | null;
  status: 'pending' | 'analyzing' | 'ready' | 'uploading' | 'completed' | 'error';
  error?: string;
  progress: number;
}

interface BatchUploadQueueProps {
  onUpload: (file: File, metadata: DetectedMetadata) => Promise<void>;
}

export const BatchUploadQueue: React.FC<BatchUploadQueueProps> = ({ onUpload }) => {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const newFiles: QueuedFile[] = files.map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      metadata: null,
      preview: null,
      status: 'pending',
      progress: 0,
    }));

    setQueue(prev => [...prev, ...newFiles]);
    processQueue(newFiles);
  }, []);

  const processQueue = async (files: QueuedFile[]) => {
    setIsProcessing(true);

    await Promise.all(
      files.map(async (queuedFile) => {
        updateFileStatus(queuedFile.id, 'analyzing');

        try {
          const detected = await SignalFormatDetector.detect(queuedFile.file);
          const { metadata: boostedMetadata } = MetadataLearningDB.boostConfidence(
            queuedFile.file.name,
            {
              sampleRate: detected.sampleRate ?? undefined,
              centerFrequency: detected.centerFrequency ?? undefined,
              datatype: detected.datatype,
              hardware: detected.hardware ?? undefined,
              confidence: detected.confidence,
            }
          );

          const finalMetadata = { ...detected, ...boostedMetadata } as DetectedMetadata;

          let preview: SignalPreview | null = null;
          if (finalMetadata.sampleRate && finalMetadata.datatype && finalMetadata.datatype !== 'unknown') {
            try {
              preview = await SignalPreviewGenerator.generate(
                queuedFile.file,
                finalMetadata.datatype,
                finalMetadata.sampleRate
              );
            } catch (err) {
              console.error('Preview generation failed:', err);
            }
          }

          setQueue(prev =>
            prev.map(f =>
              f.id === queuedFile.id
                ? { ...f, metadata: finalMetadata, preview, status: 'ready' }
                : f
            )
          );
        } catch (error) {
          setQueue(prev =>
            prev.map(f =>
              f.id === queuedFile.id
                ? { ...f, status: 'error', error: 'Analysis failed' }
                : f
            )
          );
        }
      })
    );

    setIsProcessing(false);
    toast.success(`Analyzed ${files.length} files`);
  };

  const updateFileStatus = (id: string, status: QueuedFile['status'], progress = 0) => {
    setQueue(prev =>
      prev.map(f => (f.id === id ? { ...f, status, progress } : f))
    );
  };

  const handleUploadAll = async () => {
    const readyFiles = queue.filter(f => f.status === 'ready' && f.metadata);

    if (readyFiles.length === 0) {
      toast.error('No files ready to upload');
      return;
    }

    setIsProcessing(true);

    for (const queuedFile of readyFiles) {
      if (!queuedFile.metadata) continue;

      updateFileStatus(queuedFile.id, 'uploading', 0);

      try {
        await onUpload(queuedFile.file, queuedFile.metadata);
        updateFileStatus(queuedFile.id, 'completed', 100);
      } catch (error) {
        updateFileStatus(queuedFile.id, 'error');
        setQueue(prev =>
          prev.map(f =>
            f.id === queuedFile.id
              ? { ...f, error: 'Upload failed' }
              : f
          )
        );
      }
    }

    setIsProcessing(false);
    toast.success(`Uploaded ${readyFiles.length} files`);
  };

  const handleRemoveFile = (id: string) => {
    setQueue(prev => prev.filter(f => f.id !== id));
  };

  const handleClearCompleted = () => {
    setQueue(prev => prev.filter(f => f.status !== 'completed'));
  };

  const totalProgress = queue.length > 0
    ? queue.reduce((sum, f) => sum + f.progress, 0) / queue.length
    : 0;

  const completedCount = queue.filter(f => f.status === 'completed').length;
  const readyCount = queue.filter(f => f.status === 'ready').length;
  const errorCount = queue.filter(f => f.status === 'error').length;

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">Batch Upload Queue</h2>

      {queue.length === 0 ? (
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            isDragging ? 'border-primary bg-primary/10' : 'border-border'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-2">Drop multiple files here</p>
          <p className="text-sm text-muted-foreground">All files will be analyzed in parallel</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-4 text-sm">
              <span>{queue.length} total</span>
              <span className="text-green-400">{completedCount} completed</span>
              <span className="text-yellow-400">{readyCount} ready</span>
              {errorCount > 0 && <span className="text-red-400">{errorCount} errors</span>}
            </div>
            <div className="flex gap-2">
              {completedCount > 0 && (
                <Button variant="outline" size="sm" onClick={handleClearCompleted}>Clear Completed</Button>
              )}
              <Button onClick={handleUploadAll} disabled={readyCount === 0 || isProcessing}>
                <Upload className="w-4 h-4 mr-2" />Upload All ({readyCount})
              </Button>
            </div>
          </div>

          {isProcessing && <Progress value={totalProgress} className="h-2" />}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
            {queue.map(queuedFile => (
              <Card key={queuedFile.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveFile(queuedFile.id)}><X className="w-4 h-4" /></Button>
                </div>

                <p className="text-sm font-medium mb-1 truncate">{queuedFile.file.name}</p>
                <p className="text-xs text-muted-foreground mb-3">{(queuedFile.file.size / 1024 / 1024).toFixed(2)} MB</p>

                {queuedFile.status === 'analyzing' && (
                  <div className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</div>
                )}

                {queuedFile.status === 'ready' && queuedFile.preview && (
                  <div className="mb-2">
                    <img src={queuedFile.preview.imageDataUrl} alt="Preview" className="w-full rounded border" />
                    <div className="text-xs mt-1 space-y-0.5">
                      <p>SNR: {queuedFile.preview.metrics.snrEstimate.toFixed(1)} dB</p>
                      {queuedFile.metadata && <p>Rate: {(queuedFile.metadata.sampleRate! / 1e6).toFixed(1)} MSps</p>}
                    </div>
                  </div>
                )}

                {queuedFile.status === 'uploading' && (
                  <div><Progress value={queuedFile.progress} className="h-2 mb-1" /><p className="text-xs text-muted-foreground">Uploading...</p></div>
                )}

                {queuedFile.status === 'completed' && (
                  <div className="flex items-center gap-2 text-sm text-green-400"><CheckCircle className="w-4 h-4" />Completed</div>
                )}

                {queuedFile.status === 'error' && (
                  <div className="flex items-center gap-2 text-sm text-red-400"><AlertCircle className="w-4 h-4" />{queuedFile.error}</div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};
