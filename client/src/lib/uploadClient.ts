/**
 * Upload client for signal file uploads with progress tracking
 * Uses REST API endpoints instead of tRPC for proper multipart file handling
 */

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface SigMFUploadParams {
  metaFile: File;
  dataFile: File;
  name?: string;
  description?: string;
  onProgress?: (progress: UploadProgress) => void;
}

export interface RawIQUploadParams {
  dataFile: File;
  name: string;
  datatype: string;
  sampleRate: number;
  centerFrequency?: number;
  hardware?: string;
  author?: string;
  description?: string;
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadResponse {
  success: boolean;
  captureId: number;
  metaFileUrl: string;
  dataFileUrl: string;
}

/**
 * Upload SigMF file pair (.sigmf-meta + .sigmf-data)
 */
export async function uploadSigMFFiles(
  params: SigMFUploadParams
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('metaFile', params.metaFile);
  formData.append('dataFile', params.dataFile);
  
  if (params.name) {
    formData.append('name', params.name);
  }
  if (params.description) {
    formData.append('description', params.description);
  }

  return uploadWithProgress('/api/upload/sigmf', formData, params.onProgress);
}

/**
 * Upload raw IQ file with manual metadata parameters
 */
export async function uploadRawIQFile(
  params: RawIQUploadParams
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('dataFile', params.dataFile);
  formData.append('name', params.name);
  formData.append('datatype', params.datatype);
  formData.append('sampleRate', params.sampleRate.toString());
  
  if (params.centerFrequency) {
    formData.append('centerFrequency', params.centerFrequency.toString());
  }
  if (params.hardware) {
    formData.append('hardware', params.hardware);
  }
  if (params.author) {
    formData.append('author', params.author);
  }
  if (params.description) {
    formData.append('description', params.description);
  }

  return uploadWithProgress('/api/upload/raw-iq', formData, params.onProgress);
}

/**
 * Internal helper to upload with XMLHttpRequest for progress tracking
 * Fetch API doesn't support upload progress yet
 */
function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percentage: Math.round((e.loaded / e.total) * 100),
        });
      }
    });

    // Handle completion
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (error) {
          reject(new Error('Failed to parse response'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.message || error.error || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    // Handle errors
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    // Send request
    xhr.open('POST', url);
    xhr.send(formData);
  });
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Estimate remaining time based on upload speed
 */
export function estimateRemainingTime(
  loaded: number,
  total: number,
  startTime: number
): string {
  const elapsed = Date.now() - startTime;
  const speed = loaded / (elapsed / 1000); // bytes per second
  const remaining = (total - loaded) / speed; // seconds
  
  if (remaining < 60) {
    return `${Math.round(remaining)}s`;
  } else if (remaining < 3600) {
    return `${Math.round(remaining / 60)}m`;
  } else {
    return `${Math.round(remaining / 3600)}h`;
  }
}
