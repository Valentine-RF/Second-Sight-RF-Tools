/**
 * Apache Arrow Zero-Copy Data Transport
 * High-performance serialization for IQ samples and FFT data
 */

import * as arrow from 'apache-arrow';

/**
 * Serialize IQ samples to Apache Arrow format for zero-copy transport
 */
export function serializeIQSamples(samples: Float32Array): Uint8Array {
  // Create Arrow schema for complex IQ samples
  const schema = new arrow.Schema([
    new arrow.Field('i', new arrow.Float32(), false),
    new arrow.Field('q', new arrow.Float32(), false),
  ]);

  // Split complex samples into I and Q components
  const iValues = new Float32Array(samples.length / 2);
  const qValues = new Float32Array(samples.length / 2);
  
  for (let i = 0; i < samples.length / 2; i++) {
    iValues[i] = samples[i * 2];
    qValues[i] = samples[i * 2 + 1];
  }

  // Create Arrow table
  const table = new arrow.Table({
    i: arrow.vectorFromArray(iValues),
    q: arrow.vectorFromArray(qValues),
  });

  // Serialize to IPC format (zero-copy)
  return arrow.tableToIPC(table, 'stream');
}

/**
 * Deserialize IQ samples from Apache Arrow format
 */
export function deserializeIQSamples(buffer: Uint8Array): Float32Array {
  // Parse Arrow table from IPC format
  const table = arrow.tableFromIPC(buffer);
  
  // Extract I and Q columns
  const iColumn = table.getChild('i')!;
  const qColumn = table.getChild('q')!;
  
  const length = table.numRows;
  const samples = new Float32Array(length * 2);
  
  // Interleave I and Q values
  for (let i = 0; i < length; i++) {
    samples[i * 2] = iColumn.get(i) as number;
    samples[i * 2 + 1] = qColumn.get(i) as number;
  }
  
  return samples;
}

/**
 * Serialize FFT data to Apache Arrow format
 */
export function serializeFFTData(fftMagnitude: Float32Array, frequencies: Float32Array): Uint8Array {
  const schema = new arrow.Schema([
    new arrow.Field('frequency', new arrow.Float32(), false),
    new arrow.Field('magnitude_db', new arrow.Float32(), false),
  ]);

  const table = new arrow.Table({
    frequency: arrow.vectorFromArray(frequencies),
    magnitude_db: arrow.vectorFromArray(fftMagnitude),
  });

  return arrow.tableToIPC(table, 'stream');
}

/**
 * Deserialize FFT data from Apache Arrow format
 */
export function deserializeFFTData(buffer: Uint8Array): { frequencies: Float32Array; magnitudes: Float32Array } {
  const table = arrow.tableFromIPC(buffer);
  
  const freqColumn = table.getChild('frequency')!;
  const magColumn = table.getChild('magnitude_db')!;
  
  const length = table.numRows;
  const frequencies = new Float32Array(length);
  const magnitudes = new Float32Array(length);
  
  for (let i = 0; i < length; i++) {
    frequencies[i] = freqColumn.get(i) as number;
    magnitudes[i] = magColumn.get(i) as number;
  }
  
  return { frequencies, magnitudes };
}

/**
 * Create Arrow streaming endpoint for large datasets
 * Returns a stream that can be consumed incrementally
 */
export function* streamIQSamplesArrow(samples: Float32Array, chunkSize: number = 8192): Generator<Uint8Array> {
  const totalSamples = samples.length / 2; // Complex samples
  
  for (let offset = 0; offset < totalSamples; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, totalSamples);
    const chunkLength = (end - offset) * 2;
    
    const chunk = samples.subarray(offset * 2, offset * 2 + chunkLength);
    yield serializeIQSamples(chunk);
  }
}

/**
 * Benchmark Arrow vs JSON serialization
 */
export function benchmarkSerialization(samples: Float32Array): {
  arrow: { size: number; time: number };
  json: { size: number; time: number };
  speedup: number;
} {
  // Arrow serialization
  const arrowStart = performance.now();
  const arrowBuffer = serializeIQSamples(samples);
  const arrowTime = performance.now() - arrowStart;
  
  // JSON serialization
  const jsonStart = performance.now();
  const jsonString = JSON.stringify(Array.from(samples));
  const jsonBuffer = new TextEncoder().encode(jsonString);
  const jsonTime = performance.now() - jsonStart;
  
  return {
    arrow: { size: arrowBuffer.length, time: arrowTime },
    json: { size: jsonBuffer.length, time: jsonTime },
    speedup: jsonTime / arrowTime,
  };
}
