/**
 * Apache Arrow Serialization for IQ Sample Data
 * Provides zero-copy serialization for efficient data transfer
 */

import * as arrow from 'apache-arrow';

/**
 * Serialize IQ sample data to Apache Arrow format
 * @param iqReal Real component array
 * @param iqImag Imaginary component array
 * @param sampleStart Starting sample index
 * @param metadata Additional metadata
 * @returns Arrow RecordBatch as Uint8Array
 */
export function serializeIQToArrow(
  iqReal: Float32Array,
  iqImag: Float32Array,
  sampleStart: number,
  metadata?: Record<string, string>
): Uint8Array {
  const sampleCount = iqReal.length;
  
  // Create sample indices
  const indices = new Int32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    indices[i] = sampleStart + i;
  }
  
  // Define Arrow schema
  const schema = new arrow.Schema([
    new arrow.Field('sample_index', new arrow.Int32(), false),
    new arrow.Field('i', new arrow.Float32(), false),
    new arrow.Field('q', new arrow.Float32(), false),
  ], metadata ? new Map(Object.entries(metadata)) : undefined);
  
  // Create Arrow table directly from arrays
  const table = arrow.tableFromArrays({
    sample_index: indices,
    i: iqReal,
    q: iqImag,
  });
  
  // Serialize to IPC format (zero-copy)
  const writer = arrow.RecordBatchStreamWriter.writeAll(table);
  
  return writer.toUint8Array(true);
}

/**
 * Deserialize Arrow buffer to IQ sample data
 * @param buffer Arrow IPC buffer
 * @returns Parsed IQ data with metadata
 */
export function deserializeArrowToIQ(buffer: Uint8Array): {
  sampleIndices: Int32Array;
  iqReal: Float32Array;
  iqImag: Float32Array;
  metadata: Record<string, string>;
} {
  const table = arrow.tableFromIPC(buffer);
  
  // Extract columns
  const indexColumn = table.getChild('sample_index');
  const realColumn = table.getChild('i');
  const imagColumn = table.getChild('q');
  
  if (!indexColumn || !realColumn || !imagColumn) {
    throw new Error('Invalid Arrow schema: missing required columns');
  }
  
  // Convert to typed arrays
  const sampleIndices = indexColumn.toArray() as Int32Array;
  const iqReal = realColumn.toArray() as Float32Array;
  const iqImag = imagColumn.toArray() as Float32Array;
  
  // Extract metadata
  const metadata: Record<string, string> = {};
  const schemaMetadata = table.schema.metadata;
  if (schemaMetadata) {
    schemaMetadata.forEach((value: string, key: string) => {
      metadata[key] = value;
    });
  }
  
  return { sampleIndices, iqReal, iqImag, metadata };
}

/**
 * Create Arrow schema for IQ data with custom metadata
 */
export function createIQSchema(metadata?: Record<string, string>): arrow.Schema {
  const fields = [
    new arrow.Field('sample_index', new arrow.Int32(), false),
    new arrow.Field('i', new arrow.Float32(), false),
    new arrow.Field('q', new arrow.Float32(), false),
  ];
  
  return new arrow.Schema(fields, metadata ? new Map(Object.entries(metadata)) : undefined);
}

/**
 * Get Arrow buffer size estimate
 * @param sampleCount Number of samples
 * @returns Estimated buffer size in bytes
 */
export function estimateArrowBufferSize(sampleCount: number): number {
  // Each sample: 4 bytes (index) + 4 bytes (real) + 4 bytes (imag) = 12 bytes
  // Plus Arrow IPC overhead (schema, dictionaries, metadata) ~1KB
  return (sampleCount * 12) + 1024;
}

/**
 * Validate Arrow buffer integrity
 * @param buffer Arrow IPC buffer
 * @returns true if valid, false otherwise
 */
export function validateArrowBuffer(buffer: Uint8Array): boolean {
  try {
    const table = arrow.tableFromIPC(buffer);
    
    // Check required columns exist
    if (!table.getChild('sample_index') || !table.getChild('i') || !table.getChild('q')) {
      return false;
    }
    
    // Check all columns have same length
    const lengths = [
      table.getChild('sample_index')!.length,
      table.getChild('i')!.length,
      table.getChild('q')!.length,
    ];
    
    if (new Set(lengths).size !== 1) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}
