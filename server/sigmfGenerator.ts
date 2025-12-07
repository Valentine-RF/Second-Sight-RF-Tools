/**
 * SigMF Metadata Generator
 * 
 * Automatically generates SigMF .sigmf-meta JSON files from raw IQ file parameters
 * Enables ingestion of raw .iq, .dat, .bin files without manual SigMF wrapping
 */

export interface RawIQMetadata {
  /** Capture name */
  name: string;
  /** Optional description */
  description?: string;
  /** SigMF datatype (cf32_le, ci16_le, cu8, ci8, etc.) */
  datatype: string;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Center frequency in Hz (optional) */
  centerFrequency?: number;
  /** Hardware/SDR used for capture (optional) */
  hardware?: string;
  /** Author name (optional) */
  author?: string;
  /** Dataset name (optional) */
  dataset?: string;
  /** License (optional, defaults to CC0-1.0) */
  license?: string;
}

/**
 * Generate SigMF metadata JSON from raw IQ file parameters
 */
export function generateSigMFMetadata(params: RawIQMetadata): string {
  const now = new Date().toISOString();
  
  const metadata = {
    global: {
      "core:datatype": params.datatype,
      "core:sample_rate": params.sampleRate,
      "core:version": "1.0.0",
      "core:sha512": "", // Will be calculated after upload
      "core:description": params.description || `Raw IQ capture: ${params.name}`,
      "core:author": params.author || "Unknown",
      "core:recorder": params.hardware || "Unknown SDR",
      "core:hw": params.hardware || "Unknown",
      "core:license": params.license || "CC0-1.0",
      "core:dataset": params.dataset || params.name,
    },
    captures: [
      {
        "core:sample_start": 0,
        "core:frequency": params.centerFrequency || 0,
        "core:datetime": now,
      }
    ],
    annotations: []
  };
  
  return JSON.stringify(metadata, null, 2);
}

/**
 * Validate SigMF datatype string
 */
export function isValidDatatype(datatype: string): boolean {
  const validDatatypes = [
    'cf32_le', 'cf32_be',
    'ci32_le', 'ci32_be',
    'ci16_le', 'ci16_be',
    'ci8',
    'cu32_le', 'cu32_be',
    'cu16_le', 'cu16_be',
    'cu8',
    'rf32_le', 'rf32_be',
    'ri32_le', 'ri32_be',
    'ri16_le', 'ri16_be',
    'ri8',
    'ru32_le', 'ru32_be',
    'ru16_le', 'ru16_be',
    'ru8',
  ];
  
  return validDatatypes.includes(datatype);
}

/**
 * Calculate bytes per sample for a given datatype
 */
export function getBytesPerSample(datatype: string): number {
  if (datatype.startsWith('c') || datatype.startsWith('r')) {
    const bits = parseInt(datatype.match(/\d+/)?.[0] || '0');
    const isComplex = datatype.startsWith('c');
    return (bits / 8) * (isComplex ? 2 : 1);
  }
  return 0;
}

/**
 * Estimate number of samples from file size and datatype
 */
export function estimateSampleCount(fileSizeBytes: number, datatype: string): number {
  const bytesPerSample = getBytesPerSample(datatype);
  if (bytesPerSample === 0) return 0;
  return Math.floor(fileSizeBytes / bytesPerSample);
}

/**
 * Validate that file size matches expected sample count
 */
export function validateFileSize(fileSizeBytes: number, datatype: string): boolean {
  const bytesPerSample = getBytesPerSample(datatype);
  if (bytesPerSample === 0) return false;
  
  // File size must be an exact multiple of bytes per sample
  return fileSizeBytes % bytesPerSample === 0;
}
