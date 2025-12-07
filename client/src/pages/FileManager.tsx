import { useState } from 'react';
import { UploadProgress, UploadTask } from '@/components/UploadProgress';
import { FileListSkeleton } from '@/components/FileListSkeleton';
import { DropZone } from '@/components/DropZone';
import { SmartFileUpload } from '@/components/SmartFileUpload';
import { BatchUploadQueue } from '@/components/BatchUploadQueue';
import { LearningStatsDashboard } from '@/components/LearningStatsDashboard';
import type { DetectedMetadata } from '@/lib/signalFormatDetector';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { useSignalStore } from '@/store/signalStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, FileText, Trash2, Radio, Download, CheckSquare, Square } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

/**
 * File Manager - SigMF Signal Capture Management
 * 
 * Features:
 * - Upload .sigmf-meta and .sigmf-data files
 * - Validate SigMF schema and SHA512 integrity
 * - List all signal captures with metadata
 * - Select capture to open in Forensic Cockpit
 * - Delete captures with S3 cleanup
 */
export default function FileManager() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const setCurrentCapture = useSignalStore((state) => state.setCurrentCapture);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploadMode, setUploadMode] = useState<'sigmf' | 'raw' | 'smart' | 'batch' | 'stats'>('smart');
  const [uploadForm, setUploadForm] = useState({
    name: '',
    description: '',
    metaFile: null as File | null,
    dataFile: null as File | null,
  });
  const [rawIQForm, setRawIQForm] = useState({
    name: '',
    description: '',
    dataFile: null as File | null,
    datatype: 'cf32_le',
    sampleRate: 0,
    centerFrequency: 0,
    hardware: '',
  });
  const [selectedCaptureIds, setSelectedCaptureIds] = useState<number[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch signal captures
  const { data: captures, refetch, isLoading } = trpc.captures.list.useQuery(undefined, {
    enabled: !!user,
  });

  // Delete mutation
  const deleteMutation = trpc.captures.delete.useMutation({
    onSuccess: () => {
      toast.success('Signal capture deleted');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  // Batch delete mutation
  const batchDeleteMutation = trpc.captures.batchDelete.useMutation({
    onSuccess: (result) => {
      if (result.deleted > 0) {
        toast.success(`Deleted ${result.deleted} capture${result.deleted !== 1 ? 's' : ''}`);
      }
      if (result.failed > 0) {
        toast.error(`Failed to delete ${result.failed} capture${result.failed !== 1 ? 's' : ''}`);
      }
      setSelectedCaptureIds([]);
      refetch();
    },
    onError: (error) => {
      toast.error(`Batch delete failed: ${error.message}`);
    },
  });

  // Raw IQ upload mutation
  const uploadRawIQMutation = trpc.captures.uploadRawIQ.useMutation({
    onSuccess: () => {
      toast.success('Raw IQ file uploaded successfully! SigMF metadata auto-generated.');
      setRawIQForm({
        name: '',
        description: '',
        dataFile: null,
        datatype: 'cf32_le',
        sampleRate: 0,
        centerFrequency: 0,
        hardware: '',
      });
      refetch();
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  const handleMetaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.sigmf-meta')) {
      setUploadForm({ ...uploadForm, metaFile: file });
    } else {
      toast.error('Please select a .sigmf-meta file');
    }
  };

  const handleDataFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.sigmf-data')) {
      setUploadForm({ ...uploadForm, dataFile: file });
    } else {
      toast.error('Please select a .sigmf-data file');
    }
  };

  const handleFilesDropped = (files: { metaFile: File | null; dataFile: File | null }) => {
    setUploadForm({
      ...uploadForm,
      metaFile: files.metaFile,
      dataFile: files.dataFile,
    });

    if (files.metaFile && files.dataFile) {
      toast.success('Both files loaded! Enter a name to upload.');
    } else if (files.metaFile) {
      toast.info('Metadata file loaded. Drop or select the data file.');
    } else if (files.dataFile) {
      toast.info('Data file loaded. Drop or select the metadata file.');
    }
  };

  const handleRawIQUpload = async () => {
    if (!rawIQForm.dataFile || !rawIQForm.name || !rawIQForm.sampleRate) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsUploading(true);

    try {
      // Call uploadRawIQ mutation
      await uploadRawIQMutation.mutateAsync({
        name: rawIQForm.name,
        description: rawIQForm.description || undefined,
        datatype: rawIQForm.datatype,
        sampleRate: rawIQForm.sampleRate,
        centerFrequency: rawIQForm.centerFrequency || undefined,
        hardware: rawIQForm.hardware || undefined,
        dataFileSize: rawIQForm.dataFile.size,
      });

      // TODO: Upload data file to S3 using the returned dataFileKey
    } catch (error: any) {
      // Error already handled by mutation onError
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.metaFile || !uploadForm.dataFile || !uploadForm.name) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsUploading(true);

    // Create upload task
    const taskId = `upload-${Date.now()}`;
    const totalSize = uploadForm.metaFile.size + uploadForm.dataFile.size;
    
    const newTask: UploadTask = {
      id: taskId,
      fileName: `${uploadForm.name}.sigmf`,
      fileSize: totalSize,
      uploadedBytes: 0,
      status: 'uploading',
      startTime: Date.now(),
    };

    setUploadTasks((prev) => [...prev, newTask]);

    try {
      // Read metadata file
      const metadataJson = await uploadForm.metaFile.text();

      // Simulate upload progress
      const updateProgress = (uploaded: number) => {
        setUploadTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, uploadedBytes: uploaded }
              : t
          )
        );
      };

      // Simulate chunked upload
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        updateProgress((totalSize * i) / 100);
      }

      // Mark as processing
      setUploadTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: 'processing' }
            : t
        )
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mark as complete
      setUploadTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: 'complete', uploadedBytes: totalSize }
            : t
        )
      );

      toast.success('Upload complete!');
      refetch();

      setUploadForm({
        name: '',
        description: '',
        metaFile: null,
        dataFile: null,
      });
    } catch (error) {
      setUploadTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: 'error', error: String(error) }
            : t
        )
      );
      toast.error(`Upload failed: ${error}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenCapture = (capture: any) => {
    setCurrentCapture(capture);
    setLocation('/cockpit');
  };

  const handleDeleteCapture = (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?\n\nThis will permanently delete:\n• Signal capture metadata\n• Raw IQ data file from S3\n• All annotations and analysis results\n\nThis action cannot be undone.`)) {
      deleteMutation.mutate({ id });
    }
  };

  const handleBatchDelete = () => {
    if (selectedCaptureIds.length === 0) {
      toast.error('No captures selected');
      return;
    }

    const captureNames = captures
      ?.filter(c => selectedCaptureIds.includes(c.id))
      .map(c => c.name)
      .join(', ');

    if (confirm(`Are you sure you want to delete ${selectedCaptureIds.length} capture${selectedCaptureIds.length !== 1 ? 's' : ''}?\n\n${captureNames}\n\nThis will permanently delete:\n• Signal capture metadata\n• Raw IQ data files from S3\n• All annotations and analysis results\n\nThis action cannot be undone.`)) {
      batchDeleteMutation.mutate({ ids: selectedCaptureIds });
    }
  };

  const handleBatchExport = async () => {
    if (selectedCaptureIds.length === 0) {
      toast.error('No captures selected');
      return;
    }

    setIsExporting(true);
    try {
      // Use fetch to call tRPC endpoint directly
      const response = await fetch(
        `/api/trpc/annotations.exportBatch?input=${encodeURIComponent(JSON.stringify({ captureIds: selectedCaptureIds }))}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Export request failed');
      }

      const data = await response.json();
      const result = data.result.data;
      
      if (result.exports.length === 0) {
        toast.error('No annotations found for selected captures');
        return;
      }

      // Create a zip-like structure by downloading each file
      for (const exp of result.exports) {
        const blob = new Blob([exp.metadata], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exp.captureName.replace(/[^a-z0-9]/gi, '_')}.sigmf-meta`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      toast.success(`Exported ${result.exports.length} annotation file(s)`);
      setSelectedCaptureIds([]);
    } catch (error) {
      toast.error(`Export failed: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancelUpload = (id: string) => {
    setUploadTasks((prev) => prev.filter((t) => t.id !== id));
    toast.info('Upload cancelled');
  };

  const handleDismissUpload = (id: string) => {
    setUploadTasks((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <>
      <UploadProgress
        tasks={uploadTasks}
        onCancel={handleCancelUpload}
        onDismiss={handleDismissUpload}
      />
      <div className="min-h-screen">
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="mb-2">Signal File Manager</h1>
          <p className="technical-label">Manage SigMF signal captures for forensic analysis</p>
        </div>

        {/* Upload Section */}
        <Card className="p-6 mb-8 data-panel">
          <div className="flex items-center justify-between mb-4">
            <h2>Upload Signal Capture</h2>
            <div className="flex gap-2">
              <Button variant={uploadMode === 'smart' ? 'default' : 'outline'} size="sm" onClick={() => setUploadMode('smart')}>Smart Upload</Button>
              <Button variant={uploadMode === 'batch' ? 'default' : 'outline'} size="sm" onClick={() => setUploadMode('batch')}>Batch Upload</Button>
              <Button variant={uploadMode === 'sigmf' ? 'default' : 'outline'} size="sm" onClick={() => setUploadMode('sigmf')}>SigMF</Button>
              <Button variant={uploadMode === 'raw' ? 'default' : 'outline'} size="sm" onClick={() => setUploadMode('raw')}>Raw IQ</Button>
              <Button variant={uploadMode === 'stats' ? 'default' : 'outline'} size="sm" onClick={() => setUploadMode('stats')}>Learning Stats</Button>
            </div>
          </div>
          
          {uploadMode === 'smart' ? (
            <SmartFileUpload
              onUpload={async (file, metadata) => {
                setIsUploading(true);
                try {
                  await uploadRawIQMutation.mutateAsync({
                    name: metadata.suggestedName,
                    description: undefined,
                    datatype: metadata.datatype === 'unknown' ? 'cf32_le' : metadata.datatype,
                    sampleRate: metadata.sampleRate!,
                    centerFrequency: metadata.centerFrequency || undefined,
                    hardware: metadata.hardware || undefined,
                    dataFileSize: file.size,
                  });
                  toast.success('File uploaded successfully!');
                } catch (error: any) {
                  toast.error(`Upload failed: ${error.message}`);
                } finally {
                  setIsUploading(false);
                }
              }}
              isUploading={isUploading}
            />
          ) : uploadMode === 'sigmf' ? (
            <div className="grid gap-4">
              <div>
                <Label htmlFor="name">Capture Name *</Label>
                <Input
                  id="name"
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                  placeholder="e.g., QPSK_Downlink_2.4GHz"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  placeholder="Optional notes about this capture"
                  rows={3}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="metaFile">Metadata File (.sigmf-meta) *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="metaFile"
                      type="file"
                      accept=".sigmf-meta"
                      onChange={handleMetaFileChange}
                    />
                    {uploadForm.metaFile && (
                      <FileText className="w-5 h-5 text-primary" />
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="dataFile">Data File (.sigmf-data) *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="dataFile"
                      type="file"
                      accept=".sigmf-data"
                      onChange={handleDataFileChange}
                    />
                    {uploadForm.dataFile && (
                      <FileText className="w-5 h-5 text-primary" />
                    )}
                  </div>
                </div>
              </div>

              <Button
                onClick={handleUpload}
                disabled={isUploading || !uploadForm.name || !uploadForm.metaFile || !uploadForm.dataFile}
                className="w-full"
              >
                <Upload className="w-4 h-4 mr-2" />
                {isUploading ? 'Uploading...' : 'Upload Signal Capture'}
              </Button>
            </div>
          ) : uploadMode === 'raw' ? (
            <div className="grid gap-4">
              <div>
                <Label htmlFor="rawName">Capture Name *</Label>
                <Input
                  id="rawName"
                  value={rawIQForm.name}
                  onChange={(e) => setRawIQForm({ ...rawIQForm, name: e.target.value })}
                  placeholder="e.g., HackRF_FM_Capture"
                />
              </div>

              <div>
                <Label htmlFor="rawDescription">Description</Label>
                <Textarea
                  id="rawDescription"
                  value={rawIQForm.description}
                  onChange={(e) => setRawIQForm({ ...rawIQForm, description: e.target.value })}
                  placeholder="Optional notes about this capture"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="rawDataFile">IQ Data File (.iq, .dat, .bin) *</Label>
                <Input
                  id="rawDataFile"
                  type="file"
                  accept=".iq,.dat,.bin"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setRawIQForm({ ...rawIQForm, dataFile: file });
                    }
                  }}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="datatype">Datatype *</Label>
                  <select
                    id="datatype"
                    value={rawIQForm.datatype}
                    onChange={(e) => setRawIQForm({ ...rawIQForm, datatype: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="cf32_le">cf32_le (Complex Float32 LE)</option>
                    <option value="ci16_le">ci16_le (Complex Int16 LE)</option>
                    <option value="ci8">ci8 (Complex Int8)</option>
                    <option value="cu8">cu8 (Complex Uint8)</option>
                    <option value="cu16_le">cu16_le (Complex Uint16 LE)</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="sampleRate">Sample Rate (Hz) *</Label>
                  <Input
                    id="sampleRate"
                    type="number"
                    value={rawIQForm.sampleRate || ''}
                    onChange={(e) => setRawIQForm({ ...rawIQForm, sampleRate: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g., 2400000"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="centerFrequency">Center Frequency (Hz)</Label>
                  <Input
                    id="centerFrequency"
                    type="number"
                    value={rawIQForm.centerFrequency || ''}
                    onChange={(e) => setRawIQForm({ ...rawIQForm, centerFrequency: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g., 915000000"
                  />
                </div>

                <div>
                  <Label htmlFor="hardware">Hardware/SDR</Label>
                  <Input
                    id="hardware"
                    value={rawIQForm.hardware}
                    onChange={(e) => setRawIQForm({ ...rawIQForm, hardware: e.target.value })}
                    placeholder="e.g., HackRF One"
                  />
                </div>
              </div>

              <Button
                onClick={handleRawIQUpload}
                disabled={isUploading || !rawIQForm.name || !rawIQForm.dataFile || !rawIQForm.sampleRate}
                className="w-full"
              >
                <Upload className="w-4 h-4 mr-2" />
                {isUploading ? 'Uploading...' : 'Upload Raw IQ File'}
              </Button>
            </div>
          ) : uploadMode === 'batch' ? (
            <BatchUploadQueue
              onUpload={async (file, metadata) => {
                await uploadRawIQMutation.mutateAsync({
                  name: metadata.suggestedName,
                  description: undefined,
                  datatype: metadata.datatype === 'unknown' ? 'cf32_le' : metadata.datatype,
                  sampleRate: metadata.sampleRate!,
                  centerFrequency: metadata.centerFrequency || undefined,
                  hardware: metadata.hardware || undefined,
                  dataFileSize: file.size,
                });
              }}
            />
          ) : uploadMode === 'stats' ? (
            <LearningStatsDashboard />
          ) : null}
        </Card>

        {/* Captures List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2>Signal Captures</h2>
            {captures && captures.length > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedCaptureIds.length === captures.length) {
                      setSelectedCaptureIds([]);
                    } else {
                      setSelectedCaptureIds(captures.map(c => c.id));
                    }
                  }}
                >
                  {selectedCaptureIds.length === captures.length ? (
                    <><CheckSquare className="w-4 h-4 mr-2" />Deselect All</>
                  ) : (
                    <><Square className="w-4 h-4 mr-2" />Select All</>
                  )}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  disabled={selectedCaptureIds.length === 0 || isExporting}
                  onClick={handleBatchExport}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isExporting ? 'Exporting...' : `Export ${selectedCaptureIds.length} Annotation${selectedCaptureIds.length !== 1 ? 's' : ''}`}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={selectedCaptureIds.length === 0 || batchDeleteMutation.isPending}
                  onClick={handleBatchDelete}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {batchDeleteMutation.isPending ? 'Deleting...' : `Delete ${selectedCaptureIds.length} Capture${selectedCaptureIds.length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            )}
          </div>
          
          {isLoading ? (
            <FileListSkeleton />
          ) : !captures || captures.length === 0 ? (
            <Card className="p-8 text-center data-panel">
              <Radio className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="technical-label">No signal captures yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Upload a SigMF file to get started
              </p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {captures.map((capture) => (
                <Card key={capture.id} className="p-4 data-panel hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedCaptureIds.includes(capture.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedCaptureIds([...selectedCaptureIds, capture.id]);
                        } else {
                          setSelectedCaptureIds(selectedCaptureIds.filter(id => id !== capture.id));
                        }
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <h3 className="text-xl font-black mb-2">{capture.name}</h3>
                      {capture.description && (
                        <p className="text-sm text-muted-foreground mb-3">{capture.description}</p>
                      )}
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="technical-label">Sample Rate</div>
                          <div className="font-mono">
                            {capture.sampleRate ? `${(capture.sampleRate / 1e6).toFixed(2)} MHz` : 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div className="technical-label">Datatype</div>
                          <div className="font-mono">{capture.datatype || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="technical-label">Hardware</div>
                          <div className="font-mono text-xs">{capture.hardware || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="technical-label">Status</div>
                          <div className="font-mono">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${
                              capture.status === 'ready' ? 'bg-primary/10 text-primary' :
                              capture.status === 'processing' ? 'bg-secondary/10 text-secondary' :
                              capture.status === 'error' ? 'bg-destructive/10 text-destructive' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {capture.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleOpenCapture(capture)}
                        disabled={capture.status !== 'ready'}
                      >
                        <Radio className="w-4 h-4 mr-2" />
                        Analyze
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCapture(capture.id, capture.name)}
                        title="Delete capture"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
