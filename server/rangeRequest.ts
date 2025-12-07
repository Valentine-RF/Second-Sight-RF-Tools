/**
 * HTTP Range Request Handler for Streaming Large Signal Files
 * Implements byte-range requests to S3 for efficient partial file access
 */

/**
 * Calculate byte range for a given sample range
 * @param datatype SigMF datatype (e.g., 'cf32_le', 'ci16_le', 'cu8')
 * @param sampleStart Starting sample index
 * @param sampleCount Number of samples to fetch
 * @returns Byte range object with start and end positions
 */
export function calculateByteRange(
  datatype: string,
  sampleStart: number,
  sampleCount: number
): { start: number; end: number; bytesPerSample: number } {
  // Map SigMF datatypes to bytes per sample
  const bytesPerSampleMap: Record<string, number> = {
    'cf32_le': 8,  // Complex Float32: 4 bytes (real) + 4 bytes (imag)
    'cf32_be': 8,
    'ci32_le': 8,  // Complex Int32: 4 bytes (real) + 4 bytes (imag)
    'ci32_be': 8,
    'ci16_le': 4,  // Complex Int16: 2 bytes (real) + 2 bytes (imag)
    'ci16_be': 4,
    'cu16_le': 4,  // Complex Uint16: 2 bytes (real) + 2 bytes (imag)
    'cu16_be': 4,
    'ci8': 2,      // Complex Int8: 1 byte (real) + 1 byte (imag)
    'cu8': 2,      // Complex Uint8: 1 byte (real) + 1 byte (imag)
  };

  const bytesPerSample = bytesPerSampleMap[datatype];
  if (!bytesPerSample) {
    throw new Error(`Unknown datatype: ${datatype}`);
  }

  const start = sampleStart * bytesPerSample;
  const end = start + (sampleCount * bytesPerSample) - 1; // HTTP Range is inclusive

  return { start, end, bytesPerSample };
}

/**
 * Parse HTTP Range header
 * @param rangeHeader Range header value (e.g., "bytes=0-1023")
 * @returns Parsed range object or null if invalid
 */
export function parseRangeHeader(rangeHeader: string): { start: number; end: number | null } | null {
  const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : null;

  return { start, end };
}

/**
 * Fetch data range from S3 using HTTP Range request
 * @param url S3 URL of the data file
 * @param start Byte offset start
 * @param end Byte offset end (inclusive)
 * @returns ArrayBuffer containing the requested range
 */
export async function fetchDataRange(
  url: string,
  start: number,
  end: number
): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    headers: {
      'Range': `bytes=${start}-${end}`,
    },
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Range request failed: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

/**
 * Validate sample range against file size
 * @param datatype SigMF datatype
 * @param sampleStart Starting sample index
 * @param sampleCount Number of samples
 * @param fileSize Total file size in bytes
 * @returns true if valid, false otherwise
 */
export function validateSampleRange(
  datatype: string,
  sampleStart: number,
  sampleCount: number,
  fileSize: number
): boolean {
  try {
    const { start, end } = calculateByteRange(datatype, sampleStart, sampleCount);
    
    // Check if range is within file bounds
    if (start < 0 || end >= fileSize) {
      return false;
    }
    
    // Check for overflow
    if (start > end) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse binary IQ data based on datatype
 * @param buffer ArrayBuffer containing raw IQ data
 * @param datatype SigMF datatype
 * @returns Object with separate real and imaginary arrays
 */
export function parseIQData(
  buffer: ArrayBuffer,
  datatype: string
): { iqReal: Float32Array; iqImag: Float32Array } {
  const view = new DataView(buffer);
  const sampleCount = buffer.byteLength / getBytesPerSample(datatype);
  
  const iqReal = new Float32Array(sampleCount);
  const iqImag = new Float32Array(sampleCount);
  
  let offset = 0;
  
  for (let i = 0; i < sampleCount; i++) {
    switch (datatype) {
      case 'cf32_le':
        iqReal[i] = view.getFloat32(offset, true);
        iqImag[i] = view.getFloat32(offset + 4, true);
        offset += 8;
        break;
        
      case 'cf32_be':
        iqReal[i] = view.getFloat32(offset, false);
        iqImag[i] = view.getFloat32(offset + 4, false);
        offset += 8;
        break;
        
      case 'ci16_le':
        iqReal[i] = view.getInt16(offset, true) / 32768.0;
        iqImag[i] = view.getInt16(offset + 2, true) / 32768.0;
        offset += 4;
        break;
        
      case 'ci16_be':
        iqReal[i] = view.getInt16(offset, false) / 32768.0;
        iqImag[i] = view.getInt16(offset + 2, false) / 32768.0;
        offset += 4;
        break;
        
      case 'cu16_le':
        iqReal[i] = (view.getUint16(offset, true) - 32768) / 32768.0;
        iqImag[i] = (view.getUint16(offset + 2, true) - 32768) / 32768.0;
        offset += 4;
        break;
        
      case 'cu16_be':
        iqReal[i] = (view.getUint16(offset, false) - 32768) / 32768.0;
        iqImag[i] = (view.getUint16(offset + 2, false) - 32768) / 32768.0;
        offset += 4;
        break;
        
      case 'ci8':
        iqReal[i] = view.getInt8(offset) / 128.0;
        iqImag[i] = view.getInt8(offset + 1) / 128.0;
        offset += 2;
        break;
        
      case 'cu8':
        iqReal[i] = (view.getUint8(offset) - 128) / 128.0;
        iqImag[i] = (view.getUint8(offset + 1) - 128) / 128.0;
        offset += 2;
        break;
        
      default:
        throw new Error(`Unsupported datatype: ${datatype}`);
    }
  }
  
  return { iqReal, iqImag };
}

/**
 * Get bytes per sample for a given datatype
 */
function getBytesPerSample(datatype: string): number {
  const map: Record<string, number> = {
    'cf32_le': 8, 'cf32_be': 8,
    'ci32_le': 8, 'ci32_be': 8,
    'ci16_le': 4, 'ci16_be': 4,
    'cu16_le': 4, 'cu16_be': 4,
    'ci8': 2, 'cu8': 2,
  };
  
  const bytes = map[datatype];
  if (!bytes) {
    throw new Error(`Unknown datatype: ${datatype}`);
  }
  
  return bytes;
}
