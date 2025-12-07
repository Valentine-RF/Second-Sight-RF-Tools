/**
 * IQ Data Fetcher - Fetch signal samples from S3 using HTTP Range requests
 * 
 * Supports efficient partial file reading for large signal captures
 */

/**
 * Datatype byte sizes (per complex sample)
 */
const DATATYPE_SIZES: Record<string, number> = {
  'cf32_le': 8,  // 2 × float32 (I + Q)
  'ci16_le': 4,  // 2 × int16 (I + Q)
  'ci8': 2,      // 2 × int8 (I + Q)
  'cu8': 2,      // 2 × uint8 (I + Q)
  'cu16_le': 4,  // 2 × uint16 (I + Q)
};

export interface IQSamples {
  iqReal: Float32Array;
  iqImag: Float32Array;
  sampleCount: number;
}

/**
 * Calculate byte range for a sample range
 */
function calculateByteRange(
  datatype: string,
  sampleStart: number,
  sampleCount: number
): { start: number; end: number } {
  const bytesPerSample = DATATYPE_SIZES[datatype];
  if (!bytesPerSample) {
    throw new Error(`Unsupported datatype: ${datatype}`);
  }
  
  const start = sampleStart * bytesPerSample;
  const end = start + (sampleCount * bytesPerSample) - 1;
  
  return { start, end };
}

/**
 * Parse binary data based on datatype
 */
function parseBinaryData(
  buffer: Buffer,
  datatype: string,
  sampleCount: number
): IQSamples {
  const iqReal = new Float32Array(sampleCount);
  const iqImag = new Float32Array(sampleCount);
  
  if (datatype === 'cf32_le') {
    // Complex float32 (little-endian)
    for (let i = 0; i < sampleCount; i++) {
      iqReal[i] = buffer.readFloatLE(i * 8);
      iqImag[i] = buffer.readFloatLE(i * 8 + 4);
    }
  } else if (datatype === 'ci16_le') {
    // Complex int16 (little-endian)
    for (let i = 0; i < sampleCount; i++) {
      iqReal[i] = buffer.readInt16LE(i * 4) / 32768.0;  // Normalize to [-1, 1]
      iqImag[i] = buffer.readInt16LE(i * 4 + 2) / 32768.0;
    }
  } else if (datatype === 'ci8') {
    // Complex int8
    for (let i = 0; i < sampleCount; i++) {
      iqReal[i] = buffer.readInt8(i * 2) / 128.0;  // Normalize to [-1, 1]
      iqImag[i] = buffer.readInt8(i * 2 + 1) / 128.0;
    }
  } else if (datatype === 'cu8') {
    // Complex uint8
    for (let i = 0; i < sampleCount; i++) {
      iqReal[i] = (buffer.readUInt8(i * 2) - 127.5) / 127.5;  // Normalize to [-1, 1]
      iqImag[i] = (buffer.readUInt8(i * 2 + 1) - 127.5) / 127.5;
    }
  } else if (datatype === 'cu16_le') {
    // Complex uint16 (little-endian)
    for (let i = 0; i < sampleCount; i++) {
      iqReal[i] = (buffer.readUInt16LE(i * 4) - 32768) / 32768.0;  // Normalize to [-1, 1]
      iqImag[i] = (buffer.readUInt16LE(i * 4 + 2) - 32768) / 32768.0;
    }
  } else {
    throw new Error(`Unsupported datatype: ${datatype}`);
  }
  
  return { iqReal, iqImag, sampleCount };
}

/**
 * Fetch IQ samples from S3 using HTTP Range request
 */
export async function fetchIQSamples(
  dataFileUrl: string,
  datatype: string,
  sampleStart: number,
  sampleCount: number
): Promise<IQSamples> {
  // Calculate byte range
  const { start, end } = calculateByteRange(datatype, sampleStart, sampleCount);
  
  console.log(`[IQFetcher] Fetching ${sampleCount} samples (${datatype}) from ${dataFileUrl}`);
  console.log(`[IQFetcher] Byte range: ${start}-${end} (${end - start + 1} bytes)`);
  
  // Fetch with Range header
  const response = await fetch(dataFileUrl, {
    headers: {
      'Range': `bytes=${start}-${end}`,
    },
  });
  
  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to fetch IQ data: ${response.status} ${response.statusText}`);
  }
  
  // Read response as buffer
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log(`[IQFetcher] Received ${buffer.length} bytes`);
  
  // Parse binary data
  const samples = parseBinaryData(buffer, datatype, sampleCount);
  
  console.log(`[IQFetcher] Parsed ${samples.sampleCount} IQ samples`);
  
  return samples;
}

/**
 * Validate sample range against file size
 */
export function validateSampleRange(
  datatype: string,
  sampleStart: number,
  sampleCount: number,
  fileSizeBytes: number
): boolean {
  const bytesPerSample = DATATYPE_SIZES[datatype];
  if (!bytesPerSample) {
    return false;
  }
  
  const totalSamples = Math.floor(fileSizeBytes / bytesPerSample);
  const requestedEnd = sampleStart + sampleCount;
  
  return sampleStart >= 0 && requestedEnd <= totalSamples;
}
