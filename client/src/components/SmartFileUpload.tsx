import React, { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignalFormatDetector, type DetectedMetadata } from '@/lib/signalFormatDetector';
import { SignalPreviewGenerator, type SignalPreview } from '@/lib/signalPreviewGenerator';
import { MetadataLearningDB } from '@/lib/metadataLearningDB';
import { toast } from 'sonner';

/**
 * Smart File Upload Component
 * 
 * Features:
 * - Drag-and-drop file upload
 * - Automatic format detection
 * - Metadata extraction from filename and headers
 * - Editable auto-detected fields
 * - Confidence indicator
 * - One-click upload with minimal user input
 */

interface SmartFileUploadProps {
  onUpload: (file: File, metadata: DetectedMetadata) => Promise<void>;
  isUploading?: boolean;
}

export const SmartFileUpload: React.FC<SmartFileUploadProps> = ({
  onUpload,
  isUploading = false,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<DetectedMetadata | null>(null);
  const [originalMetadata, setOriginalMetadata] = useState<DetectedMetadata | null>(null);
  const [preview, setPreview] = useState<SignalPreview | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setIsAnalyzing(true);

    try {
      // Auto-detect metadata
      const detected = await SignalFormatDetector.detect(selectedFile);
      
      // Apply learning system boost
      const { metadata: boostedPartial, boosted, learnedPattern } = 
        MetadataLearningDB.boostConfidence(selectedFile.name, {
          sampleRate: detected.sampleRate ?? undefined,
          centerFrequency: detected.centerFrequency ?? undefined,
          datatype: detected.datatype,
          hardware: detected.hardware ?? undefined,
          confidence: detected.confidence,
        });
      
      // Merge boosted metadata with original detected metadata
      const boostedMetadata = {
        ...detected,
        ...boostedPartial,
      } as DetectedMetadata;
      
      setMetadata(boostedMetadata);
      setOriginalMetadata(detected);

      // Show confidence feedback
      if (boosted) {
        toast.success(`Learned from previous uploads!`, {
          description: `Confidence boosted to ${boostedMetadata.confidence}%`,
        });
      } else if (boostedMetadata.confidence >= 80) {
        toast.success(`Auto-detected: ${detected.detectionMethod}`, {
          description: `Confidence: ${boostedMetadata.confidence}%`,
        });
      } else if (boostedMetadata.confidence >= 50) {
        toast.info(`Partially detected: ${detected.detectionMethod}`, {
          description: `Confidence: ${boostedMetadata.confidence}%. Please verify fields.`,
        });
      } else {
        toast.warning('Low confidence detection', {
          description: 'Please manually verify all fields before uploading.',
        });
      }
      
      // Generate preview thumbnail (async, non-blocking)
      if (boostedMetadata.sampleRate && boostedMetadata.datatype && boostedMetadata.datatype !== 'unknown') {
        setIsGeneratingPreview(true);
        try {
          const signalPreview = await SignalPreviewGenerator.generate(
            selectedFile,
            boostedMetadata.datatype,
            boostedMetadata.sampleRate
          );
          setPreview(signalPreview);
          
          toast.success('Signal preview generated', {
            description: `SNR: ${signalPreview.metrics.snrEstimate.toFixed(1)} dB, Peak: ${signalPreview.metrics.peakPower.toFixed(1)} dB`,
          });
        } catch (previewError) {
          console.error('[SmartFileUpload] Preview generation failed:', previewError);
          // Don't block upload if preview fails
        } finally {
          setIsGeneratingPreview(false);
        }
      }
    } catch (error) {
      console.error('[SmartFileUpload] Detection failed:', error);
      toast.error('Failed to analyze file', {
        description: 'Please enter metadata manually.',
      });
      
      // Set default metadata
      setMetadata({
        format: 'unknown',
        datatype: 'cf32_le',
        sampleRate: null,
        centerFrequency: null,
        hardware: null,
        confidence: 0,
        detectionMethod: 'Manual entry required',
        suggestedName: selectedFile.name,
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  /**
   * Handle drag events
   */
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

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      await handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  /**
   * Handle file input change
   */
  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      await handleFileSelect(selectedFile);
    }
  }, [handleFileSelect]);

  /**
   * Handle upload
   */
  const handleUpload = useCallback(async () => {
    if (!file || !metadata) return;

    // Validate required fields
    if (!metadata.sampleRate) {
      toast.error('Sample rate is required', {
        description: 'Please enter the sample rate manually.',
      });
      return;
    }

    try {
      await onUpload(file, metadata);
      
      // Record correction if user edited metadata
      if (originalMetadata && (
        metadata.sampleRate !== originalMetadata.sampleRate ||
        metadata.centerFrequency !== originalMetadata.centerFrequency ||
        metadata.datatype !== originalMetadata.datatype ||
        metadata.hardware !== originalMetadata.hardware
      )) {
        MetadataLearningDB.recordCorrection(
          file.name,
          {
            sampleRate: originalMetadata.sampleRate ?? undefined,
            centerFrequency: originalMetadata.centerFrequency ?? undefined,
            datatype: originalMetadata.datatype,
            hardware: originalMetadata.hardware ?? undefined,
          },
          {
            sampleRate: metadata.sampleRate ?? undefined,
            centerFrequency: metadata.centerFrequency ?? undefined,
            datatype: metadata.datatype,
            hardware: metadata.hardware ?? undefined,
          }
        );
        console.log('[SmartFileUpload] Recorded metadata correction for learning');
      }
      
      // Reset form
      setFile(null);
      setMetadata(null);
      setOriginalMetadata(null);
      setPreview(null);
    } catch (error) {
      // Error handled by parent
    }
  }, [file, metadata, onUpload]);

  /**
   * Handle metadata field changes
   */
  const updateMetadata = useCallback((field: keyof DetectedMetadata, value: any) => {
    if (!metadata) return;
    setMetadata({ ...metadata, [field]: value });
  }, [metadata]);

  /**
   * Get confidence color
   */
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  /**
   * Get confidence icon
   */
  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 80) return <CheckCircle className="w-5 h-5 text-green-400" />;
    if (confidence >= 50) return <AlertCircle className="w-5 h-5 text-yellow-400" />;
    return <AlertCircle className="w-5 h-5 text-red-400" />;
  };

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">Upload Signal File</h2>

      {/* Drag and Drop Zone */}
      {!file && (
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-primary/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-2">
            Drag and drop your signal file here
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Supports: SigMF (.sigmf-data), WAV (.wav), Raw IQ (.iq, .dat, .bin)
          </p>
          <div className="relative">
            <input
              type="file"
              accept=".sigmf-data,.sigmf-meta,.wav,.iq,.dat,.bin,.raw"
              onChange={handleFileInputChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Button variant="outline">
              <FileText className="w-4 h-4 mr-2" />
              Browse Files
            </Button>
          </div>
        </div>
      )}

      {/* File Analysis */}
      {file && isAnalyzing && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary mr-3" />
          <div>
            <p className="font-medium">Analyzing file...</p>
            <p className="text-sm text-muted-foreground">
              Detecting format, sample rate, and metadata
            </p>
          </div>
        </div>
      )}

      {/* Metadata Form */}
      {file && metadata && !isAnalyzing && (
        <div className="space-y-4">
          {/* File Info */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-primary" />
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFile(null);
                setMetadata(null);
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Detection Confidence */}
          <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
            {getConfidenceIcon(metadata.confidence)}
            <div className="flex-1">
              <p className="text-sm font-medium">
                Detection Confidence:{' '}
                <span className={getConfidenceColor(metadata.confidence)}>
                  {metadata.confidence}%
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {metadata.detectionMethod}
              </p>
            </div>
          </div>

          {/* Signal Preview Thumbnail */}
          {isGeneratingPreview && (
            <div className="flex items-center justify-center p-4 bg-muted/30 rounded-lg">
              <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
              <p className="text-sm">Generating signal preview...</p>
            </div>
          )}
          
          {preview && (
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-sm font-medium mb-2">Signal Preview</p>
              <div className="flex gap-4">
                <img
                  src={preview.imageDataUrl}
                  alt="Signal preview spectrogram"
                  className="rounded border border-border"
                  style={{ width: preview.width, height: preview.height }}
                />
                <div className="flex-1 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SNR Estimate:</span>
                    <span className="font-mono">{preview.metrics.snrEstimate.toFixed(1)} dB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Peak Power:</span>
                    <span className="font-mono">{preview.metrics.peakPower.toFixed(1)} dB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Power:</span>
                    <span className="font-mono">{preview.metrics.avgPower.toFixed(1)} dB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dynamic Range:</span>
                    <span className="font-mono">{preview.metrics.dynamicRange.toFixed(1)} dB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Samples:</span>
                    <span className="font-mono">{preview.sampleCount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Editable Fields */}
          <div className="grid gap-4">
            {/* Capture Name */}
            <div>
              <Label htmlFor="name">Capture Name *</Label>
              <Input
                id="name"
                value={metadata.suggestedName}
                onChange={(e) => updateMetadata('suggestedName', e.target.value)}
                placeholder="e.g., QPSK_Downlink_915MHz"
              />
            </div>

            {/* Sample Rate */}
            <div>
              <Label htmlFor="sampleRate">
                Sample Rate (Hz) *
                {metadata.sampleRate && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({SignalFormatDetector.formatSampleRate(metadata.sampleRate)})
                  </span>
                )}
              </Label>
              <Input
                id="sampleRate"
                type="number"
                value={metadata.sampleRate || ''}
                onChange={(e) =>
                  updateMetadata('sampleRate', parseFloat(e.target.value) || null)
                }
                placeholder="e.g., 2400000"
                className={!metadata.sampleRate ? 'border-yellow-500' : ''}
              />
              {!metadata.sampleRate && (
                <p className="text-xs text-yellow-500 mt-1">
                  ⚠️ Sample rate is required - could not auto-detect
                </p>
              )}
            </div>

            {/* Center Frequency */}
            <div>
              <Label htmlFor="centerFrequency">
                Center Frequency (Hz)
                {metadata.centerFrequency && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({SignalFormatDetector.formatFrequency(metadata.centerFrequency)})
                  </span>
                )}
              </Label>
              <Input
                id="centerFrequency"
                type="number"
                value={metadata.centerFrequency || ''}
                onChange={(e) =>
                  updateMetadata('centerFrequency', parseFloat(e.target.value) || null)
                }
                placeholder="e.g., 915000000"
              />
            </div>

            {/* Datatype */}
            <div>
              <Label htmlFor="datatype">Datatype *</Label>
              <select
                id="datatype"
                value={metadata.datatype}
                onChange={(e) => updateMetadata('datatype', e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="cf32_le">cf32_le (Complex Float32 LE)</option>
                <option value="ci16_le">ci16_le (Complex Int16 LE)</option>
                <option value="ci8">ci8 (Complex Int8)</option>
                <option value="cu8">cu8 (Complex Uint8)</option>
                <option value="cu16_le">cu16_le (Complex Uint16 LE)</option>
              </select>
            </div>

            {/* Hardware */}
            <div>
              <Label htmlFor="hardware">Hardware/SDR</Label>
              <Input
                id="hardware"
                value={metadata.hardware || ''}
                onChange={(e) => updateMetadata('hardware', e.target.value || null)}
                placeholder="e.g., HackRF One, RTL-SDR"
              />
            </div>
          </div>

          {/* Upload Button */}
          <Button
            onClick={handleUpload}
            disabled={isUploading || !metadata.sampleRate}
            className="w-full"
            size="lg"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload and Analyze
              </>
            )}
          </Button>

          {/* Help Text */}
          <p className="text-xs text-muted-foreground text-center">
            Fields marked with * are required. Auto-detected values can be edited before upload.
          </p>
        </div>
      )}
    </Card>
  );
};
