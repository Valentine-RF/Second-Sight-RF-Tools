import { z } from "zod";
import crypto from "crypto";

/**
 * SigMF Global Object Schema
 * Validates core fields required for forensic signal processing
 */
const SigMFGlobalSchema = z.object({
  "core:datatype": z.string(), // e.g., "cf32_le", "ci16_le"
  "core:sample_rate": z.number().positive(), // Hz
  "core:version": z.string().optional(),
  "core:hw": z.string().optional(), // Hardware description
  "core:author": z.string().optional(), // Capture author
  "core:description": z.string().optional(),
  "core:license": z.string().optional(),
  "core:sha512": z.string().optional(), // Data file integrity hash
});

/**
 * SigMF Capture Object Schema
 * Represents a contiguous block of samples with timing information
 */
const SigMFCaptureSchema = z.object({
  "core:sample_start": z.number().int().nonnegative(), // Sample index where segment begins
  "core:frequency": z.number().optional(), // Center frequency in Hz
  "core:datetime": z.string().optional(), // ISO 8601 timestamp
});

/**
 * SigMF Annotation Object Schema
 * Stores analysis results and regions of interest
 */
const SigMFAnnotationSchema = z.object({
  "core:sample_start": z.number().int().nonnegative(),
  "core:sample_count": z.number().int().positive(),
  "core:freq_lower_edge": z.number().optional(), // Hz
  "core:freq_upper_edge": z.number().optional(), // Hz
  "core:label": z.string().optional(),
  "core:comment": z.string().optional(),
  // Signal extension namespace for forensic data
  "signal:modulation": z.string().optional(), // QPSK, BPSK, 16-QAM, etc.
  "signal:snr": z.number().optional(), // dB
  "signal:cfo": z.number().optional(), // Hz
  "signal:baud": z.number().optional(), // symbols/sec
  "signal:confidence": z.number().min(0).max(1).optional(), // Classification confidence
});

/**
 * Complete SigMF Metadata File Schema
 */
const SigMFMetadataSchema = z.object({
  global: SigMFGlobalSchema,
  captures: z.array(SigMFCaptureSchema).optional().default([]),
  annotations: z.array(SigMFAnnotationSchema).optional().default([]),
});

export type SigMFMetadata = z.infer<typeof SigMFMetadataSchema>;
export type SigMFGlobal = z.infer<typeof SigMFGlobalSchema>;
export type SigMFCapture = z.infer<typeof SigMFCaptureSchema>;
export type SigMFAnnotation = z.infer<typeof SigMFAnnotationSchema>;

/**
 * Parse and validate SigMF metadata JSON
 * @param jsonContent - Raw JSON string from .sigmf-meta file
 * @returns Validated SigMF metadata object
 * @throws Error if validation fails
 */
export function parseSigMFMetadata(jsonContent: string): SigMFMetadata {
  try {
    const parsed = JSON.parse(jsonContent);
    return SigMFMetadataSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`SigMF validation failed: ${error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw new Error(`Failed to parse SigMF metadata: ${error}`);
  }
}

/**
 * Calculate SHA512 hash of binary data file
 * @param dataBuffer - Binary data from .sigmf-data file
 * @returns Hex-encoded SHA512 hash
 */
export function calculateSHA512(dataBuffer: Buffer): string {
  return crypto.createHash('sha512').update(dataBuffer).digest('hex');
}

/**
 * Verify data file integrity against metadata hash
 * @param dataBuffer - Binary data from .sigmf-data file
 * @param expectedHash - SHA512 hash from metadata
 * @returns true if hashes match, false otherwise
 */
export function verifySHA512(dataBuffer: Buffer, expectedHash: string): boolean {
  const actualHash = calculateSHA512(dataBuffer);
  return actualHash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Get sample size in bytes based on datatype
 * @param datatype - SigMF core:datatype string (e.g., "cf32_le", "ci16_le")
 * @returns Number of bytes per sample
 */
export function getSampleSize(datatype: string): number {
  const datatypeMap: Record<string, number> = {
    "cf32_le": 8,  // Complex Float32 Little Endian (2 * 4 bytes)
    "cf32_be": 8,  // Complex Float32 Big Endian
    "ci32_le": 8,  // Complex Int32 Little Endian (2 * 4 bytes)
    "ci32_be": 8,  // Complex Int32 Big Endian
    "ci16_le": 4,  // Complex Int16 Little Endian (2 * 2 bytes)
    "ci16_be": 4,  // Complex Int16 Big Endian
    "ci8": 2,      // Complex Int8 (2 * 1 byte)
    "cu8": 2,      // Complex Uint8
    "rf32_le": 4,  // Real Float32 Little Endian
    "rf32_be": 4,  // Real Float32 Big Endian
    "ri32_le": 4,  // Real Int32 Little Endian
    "ri32_be": 4,  // Real Int32 Big Endian
    "ri16_le": 2,  // Real Int16 Little Endian
    "ri16_be": 2,  // Real Int16 Big Endian
    "ri8": 1,      // Real Int8
    "ru8": 1,      // Real Uint8
  };

  const size = datatypeMap[datatype];
  if (!size) {
    throw new Error(`Unknown SigMF datatype: ${datatype}`);
  }
  return size;
}

/**
 * Validate that data file size matches expected size based on metadata
 * @param fileSize - Actual file size in bytes
 * @param datatype - SigMF core:datatype
 * @param expectedSamples - Expected number of samples (optional)
 * @returns Validation result with sample count
 */
export function validateDataFileSize(
  fileSize: number,
  datatype: string,
  expectedSamples?: number
): { valid: boolean; sampleCount: number; error?: string } {
  const sampleSize = getSampleSize(datatype);
  
  if (fileSize % sampleSize !== 0) {
    return {
      valid: false,
      sampleCount: 0,
      error: `File size ${fileSize} is not a multiple of sample size ${sampleSize} for datatype ${datatype}`
    };
  }

  const actualSampleCount = fileSize / sampleSize;

  if (expectedSamples !== undefined && actualSampleCount !== expectedSamples) {
    return {
      valid: false,
      sampleCount: actualSampleCount,
      error: `Expected ${expectedSamples} samples but file contains ${actualSampleCount}`
    };
  }

  return {
    valid: true,
    sampleCount: actualSampleCount
  };
}

/**
 * Convert annotation from database format to SigMF format
 * @param annotation - Database annotation object
 * @returns SigMF annotation object
 */
export function annotationToSigMF(annotation: {
  sampleStart: number;
  sampleCount: number;
  freqLowerEdge: number | null;
  freqUpperEdge: number | null;
  label: string | null;
  modulationType: string | null;
  confidence: number | null;
  estimatedSNR: number | null;
  estimatedCFO: number | null;
  estimatedBaud: number | null;
}): SigMFAnnotation {
  const sigmfAnnotation: SigMFAnnotation = {
    "core:sample_start": annotation.sampleStart,
    "core:sample_count": annotation.sampleCount,
  };

  if (annotation.freqLowerEdge !== null) {
    sigmfAnnotation["core:freq_lower_edge"] = annotation.freqLowerEdge;
  }
  if (annotation.freqUpperEdge !== null) {
    sigmfAnnotation["core:freq_upper_edge"] = annotation.freqUpperEdge;
  }
  if (annotation.label !== null) {
    sigmfAnnotation["core:label"] = annotation.label;
  }
  if (annotation.modulationType !== null) {
    sigmfAnnotation["signal:modulation"] = annotation.modulationType;
  }
  if (annotation.confidence !== null) {
    sigmfAnnotation["signal:confidence"] = annotation.confidence;
  }
  if (annotation.estimatedSNR !== null) {
    sigmfAnnotation["signal:snr"] = annotation.estimatedSNR;
  }
  if (annotation.estimatedCFO !== null) {
    sigmfAnnotation["signal:cfo"] = annotation.estimatedCFO;
  }
  if (annotation.estimatedBaud !== null) {
    sigmfAnnotation["signal:baud"] = annotation.estimatedBaud;
  }

  return sigmfAnnotation;
}

/**
 * Generate complete SigMF metadata file with annotations
 * @param global - Global metadata object
 * @param captures - Array of capture segments
 * @param annotations - Array of annotations
 * @returns JSON string of complete SigMF metadata
 */
export function generateSigMFMetadata(
  global: SigMFGlobal,
  captures: SigMFCapture[],
  annotations: SigMFAnnotation[]
): string {
  const metadata: SigMFMetadata = {
    global,
    captures,
    annotations
  };

  return JSON.stringify(metadata, null, 2);
}
