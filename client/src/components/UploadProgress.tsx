import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { X, CheckCircle2, AlertCircle, Upload } from 'lucide-react';

export interface UploadTask {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedBytes: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
  startTime: number;
}

interface UploadProgressProps {
  tasks: UploadTask[];
  onCancel?: (id: string) => void;
  onDismiss?: (id: string) => void;
}

/**
 * Upload Progress Tracker
 * 
 * Features:
 * - Real-time progress percentage
 * - Upload speed calculation
 * - Estimated time remaining
 * - Multiple simultaneous uploads
 * - Cancel and dismiss actions
 */
export function UploadProgress({ tasks, onCancel, onDismiss }: UploadProgressProps) {
  const [speeds, setSpeeds] = useState<Record<string, number>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      const newSpeeds: Record<string, number> = {};
      
      tasks.forEach((task) => {
        if (task.status === 'uploading') {
          const elapsed = (Date.now() - task.startTime) / 1000; // seconds
          const speed = elapsed > 0 ? task.uploadedBytes / elapsed : 0;
          newSpeeds[task.id] = speed;
        }
      });

      setSpeeds(newSpeeds);
    }, 500);

    return () => clearInterval(interval);
  }, [tasks]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return `${formatBytes(bytesPerSecond)}/s`;
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getETA = (task: UploadTask): string => {
    const speed = speeds[task.id];
    if (!speed || speed === 0) return '--:--';
    
    const remaining = task.fileSize - task.uploadedBytes;
    const eta = remaining / speed;
    return formatTime(eta);
  };

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 space-y-2 z-50">
      {tasks.map((task) => {
        const percentage = (task.uploadedBytes / task.fileSize) * 100;

        return (
          <Card key={task.id} className="p-4 data-panel shadow-lg">
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="mt-1">
                {task.status === 'complete' && (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                )}
                {task.status === 'error' && (
                  <AlertCircle className="w-5 h-5 text-destructive" />
                )}
                {(task.status === 'uploading' || task.status === 'processing') && (
                  <Upload className="w-5 h-5 text-cyan-400 animate-pulse" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm truncate">{task.fileName}</div>
                    <div className="technical-label text-xs">
                      {task.status === 'uploading' && `${formatBytes(task.uploadedBytes)} / ${formatBytes(task.fileSize)}`}
                      {task.status === 'processing' && 'Processing...'}
                      {task.status === 'complete' && 'Upload complete'}
                      {task.status === 'error' && task.error}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1">
                    {task.status === 'uploading' && onCancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => onCancel(task.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    {(task.status === 'complete' || task.status === 'error') && onDismiss && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => onDismiss(task.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {(task.status === 'uploading' || task.status === 'processing') && (
                  <>
                    <Progress value={percentage} className="h-2 mb-2" />
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-cyan-400">{percentage.toFixed(1)}%</span>
                      {task.status === 'uploading' && (
                        <>
                          <span className="technical-label">
                            {formatSpeed(speeds[task.id] || 0)}
                          </span>
                          <span className="technical-label">
                            ETA: {getETA(task)}
                          </span>
                        </>
                      )}
                      {task.status === 'processing' && (
                        <span className="technical-label">Validating SigMF...</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
