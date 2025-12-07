import { useCallback, useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropZoneProps {
  onFilesDropped: (files: { metaFile: File | null; dataFile: File | null }) => void;
  className?: string;
}

/**
 * Drag-and-Drop Upload Zone
 * 
 * Features:
 * - Visual drop target highlighting on drag over
 * - Accepts .sigmf-meta and .sigmf-data files
 * - Validates file extensions
 * - Click to browse fallback
 * - Displays dropped file names
 */
export function DropZone({ onFilesDropped, className }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<{ metaFile: File | null; dataFile: File | null }>({
    metaFile: null,
    dataFile: null,
  });

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only set dragging to false if we're leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    processFiles(files);
  }, []);

  const processFiles = (files: File[]) => {
    let metaFile: File | null = null;
    let dataFile: File | null = null;

    files.forEach((file) => {
      if (file.name.endsWith('.sigmf-meta')) {
        metaFile = file;
      } else if (file.name.endsWith('.sigmf-data')) {
        dataFile = file;
      }
    });

    const result = { metaFile, dataFile };
    setDroppedFiles(result);
    onFilesDropped(result);
  };

  return (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-lg p-8 transition-all cursor-pointer',
        isDragging
          ? 'border-primary bg-primary/10 scale-[1.02]'
          : 'border-border hover:border-primary/50 hover:bg-accent/5',
        className
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      {/* Hidden file input */}
      <input
        id="file-input"
        type="file"
        multiple
        accept=".sigmf-meta,.sigmf-data"
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Drop zone content */}
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        <div className={cn(
          'p-4 rounded-full transition-colors',
          isDragging ? 'bg-primary/20' : 'bg-accent'
        )}>
          <Upload className={cn(
            'w-8 h-8 transition-colors',
            isDragging ? 'text-primary animate-bounce' : 'text-muted-foreground'
          )} />
        </div>

        <div>
          <h3 className="font-black text-lg mb-1">
            {isDragging ? 'Drop files here' : 'Drag & Drop SigMF Files'}
          </h3>
          <p className="technical-label text-sm">
            or click to browse
          </p>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>Accepted formats: .sigmf-meta, .sigmf-data</p>
          <p>You can drop both files at once</p>
        </div>

        {/* Display dropped files */}
        {(droppedFiles.metaFile || droppedFiles.dataFile) && (
          <div className="w-full max-w-md space-y-2 pt-4 border-t border-border">
            <div className="technical-label text-xs mb-2">Dropped Files:</div>
            {droppedFiles.metaFile && (
              <div className="flex items-center gap-2 text-sm bg-primary/10 px-3 py-2 rounded">
                <FileText className="w-4 h-4 text-primary" />
                <span className="font-mono flex-1 truncate">{droppedFiles.metaFile.name}</span>
                <span className="technical-label text-xs">
                  {(droppedFiles.metaFile.size / 1024).toFixed(1)} KB
                </span>
              </div>
            )}
            {droppedFiles.dataFile && (
              <div className="flex items-center gap-2 text-sm bg-secondary/10 px-3 py-2 rounded">
                <FileText className="w-4 h-4 text-secondary" />
                <span className="font-mono flex-1 truncate">{droppedFiles.dataFile.name}</span>
                <span className="technical-label text-xs">
                  {(droppedFiles.dataFile.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
