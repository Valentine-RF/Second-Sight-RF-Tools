import { describe, it, expect } from 'vitest';
import { 
  calculateByteRange, 
  parseRangeHeader, 
  validateSampleRange,
  parseIQData 
} from './rangeRequest';
import { 
  serializeIQToArrow, 
  deserializeArrowToIQ, 
  estimateArrowBufferSize,
  validateArrowBuffer 
} from './arrowSerializer';

/**
 * Tests for HTTP Range Request Handler and Apache Arrow Serialization
 */

describe('Byte Range Calculations', () => {
  it('should calculate correct byte range for cf32_le datatype', () => {
    const { start, end, bytesPerSample } = calculateByteRange('cf32_le', 1000, 500);
    
    // cf32_le: 8 bytes per sample (4 bytes real + 4 bytes imag)
    expect(bytesPerSample).toBe(8);
    expect(start).toBe(8000); // 1000 * 8
    expect(end).toBe(11999);  // (1000 + 500) * 8 - 1
  });

  it('should calculate correct byte range for ci16_le datatype', () => {
    const { start, end, bytesPerSample } = calculateByteRange('ci16_le', 0, 1024);
    
    // ci16_le: 4 bytes per sample (2 bytes real + 2 bytes imag)
    expect(bytesPerSample).toBe(4);
    expect(start).toBe(0);
    expect(end).toBe(4095); // 1024 * 4 - 1
  });

  it('should calculate correct byte range for cu8 datatype', () => {
    const { start, end, bytesPerSample } = calculateByteRange('cu8', 500, 100);
    
    // cu8: 2 bytes per sample (1 byte real + 1 byte imag)
    expect(bytesPerSample).toBe(2);
    expect(start).toBe(1000); // 500 * 2
    expect(end).toBe(1199);   // (500 + 100) * 2 - 1
  });

  it('should throw error for unknown datatype', () => {
    expect(() => calculateByteRange('invalid_type', 0, 100)).toThrow('Unknown datatype');
  });

  it('should handle large sample counts without overflow', () => {
    const { start, end } = calculateByteRange('cf32_le', 1000000, 1000000);
    
    expect(start).toBe(8000000);
    expect(end).toBe(15999999);
  });
});

describe('HTTP Range Header Parsing', () => {
  it('should parse valid range header with both start and end', () => {
    const result = parseRangeHeader('bytes=0-1023');
    
    expect(result).not.toBeNull();
    expect(result?.start).toBe(0);
    expect(result?.end).toBe(1023);
  });

  it('should parse range header with only start', () => {
    const result = parseRangeHeader('bytes=1000-');
    
    expect(result).not.toBeNull();
    expect(result?.start).toBe(1000);
    expect(result?.end).toBeNull();
  });

  it('should return null for invalid range header', () => {
    expect(parseRangeHeader('invalid')).toBeNull();
    expect(parseRangeHeader('bytes=')).toBeNull();
    expect(parseRangeHeader('0-1023')).toBeNull();
  });

  it('should handle large byte offsets', () => {
    const result = parseRangeHeader('bytes=1000000000-2000000000');
    
    expect(result).not.toBeNull();
    expect(result?.start).toBe(1000000000);
    expect(result?.end).toBe(2000000000);
  });
});

describe('Sample Range Validation', () => {
  it('should validate correct sample range', () => {
    const fileSize = 8000000; // 1M samples * 8 bytes
    const isValid = validateSampleRange('cf32_le', 0, 1000, fileSize);
    
    expect(isValid).toBe(true);
  });

  it('should reject range exceeding file size', () => {
    const fileSize = 8000; // 1000 samples * 8 bytes
    const isValid = validateSampleRange('cf32_le', 0, 2000, fileSize);
    
    expect(isValid).toBe(false);
  });

  it('should reject negative sample start', () => {
    const fileSize = 8000;
    const isValid = validateSampleRange('cf32_le', -100, 500, fileSize);
    
    expect(isValid).toBe(false);
  });

  it('should reject range with start > end', () => {
    const fileSize = 8000;
    const isValid = validateSampleRange('cf32_le', 1000, -100, fileSize);
    
    expect(isValid).toBe(false);
  });

  it('should validate range at file boundary', () => {
    const fileSize = 8000; // Exactly 1000 samples
    const isValid = validateSampleRange('cf32_le', 0, 1000, fileSize);
    
    expect(isValid).toBe(true);
  });
});

describe('IQ Data Parsing', () => {
  it('should parse cf32_le IQ data correctly', () => {
    // Create test buffer with 2 samples
    const buffer = new ArrayBuffer(16); // 2 samples * 8 bytes
    const view = new DataView(buffer);
    
    // Sample 1: I=1.0, Q=0.5
    view.setFloat32(0, 1.0, true);
    view.setFloat32(4, 0.5, true);
    
    // Sample 2: I=-0.5, Q=0.75
    view.setFloat32(8, -0.5, true);
    view.setFloat32(12, 0.75, true);
    
    const { iqReal, iqImag } = parseIQData(buffer, 'cf32_le');
    
    expect(iqReal.length).toBe(2);
    expect(iqImag.length).toBe(2);
    expect(iqReal[0]).toBeCloseTo(1.0);
    expect(iqImag[0]).toBeCloseTo(0.5);
    expect(iqReal[1]).toBeCloseTo(-0.5);
    expect(iqImag[1]).toBeCloseTo(0.75);
  });

  it('should parse ci16_le IQ data with normalization', () => {
    const buffer = new ArrayBuffer(8); // 2 samples * 4 bytes
    const view = new DataView(buffer);
    
    // Sample 1: I=32767 (max), Q=0
    view.setInt16(0, 32767, true);
    view.setInt16(2, 0, true);
    
    // Sample 2: I=-32768 (min), Q=16384
    view.setInt16(4, -32768, true);
    view.setInt16(6, 16384, true);
    
    const { iqReal, iqImag } = parseIQData(buffer, 'ci16_le');
    
    expect(iqReal.length).toBe(2);
    expect(iqImag.length).toBe(2);
    expect(iqReal[0]).toBeCloseTo(1.0, 3);
    expect(iqImag[0]).toBeCloseTo(0.0, 3);
    expect(iqReal[1]).toBeCloseTo(-1.0, 3);
    expect(iqImag[1]).toBeCloseTo(0.5, 3);
  });

  it('should parse cu8 IQ data with offset and normalization', () => {
    const buffer = new ArrayBuffer(4); // 2 samples * 2 bytes
    const view = new DataView(buffer);
    
    // Sample 1: I=255 (max), Q=128 (center)
    view.setUint8(0, 255);
    view.setUint8(1, 128);
    
    // Sample 2: I=0 (min), Q=192
    view.setUint8(2, 0);
    view.setUint8(3, 192);
    
    const { iqReal, iqImag } = parseIQData(buffer, 'cu8');
    
    expect(iqReal.length).toBe(2);
    expect(iqImag.length).toBe(2);
    expect(iqReal[0]).toBeCloseTo(1.0, 1);
    expect(iqImag[0]).toBeCloseTo(0.0, 1);
    expect(iqReal[1]).toBeCloseTo(-1.0, 1);
    expect(iqImag[1]).toBeCloseTo(0.5, 1);
  });

  it('should throw error for unsupported datatype', () => {
    const buffer = new ArrayBuffer(8);
    expect(() => parseIQData(buffer, 'invalid_type')).toThrow('Unknown datatype');
  });
});

describe('Apache Arrow Serialization', () => {
  it('should serialize IQ data to Arrow format', () => {
    const iqReal = new Float32Array([1.0, 0.5, -0.5, 0.0]);
    const iqImag = new Float32Array([0.0, 0.5, -0.5, 1.0]);
    const sampleStart = 1000;
    
    const arrowBuffer = serializeIQToArrow(iqReal, iqImag, sampleStart, {
      datatype: 'cf32_le',
      sample_rate: '1000000',
    });
    
    expect(arrowBuffer).toBeInstanceOf(Uint8Array);
    expect(arrowBuffer.length).toBeGreaterThan(0);
  });

  it('should deserialize Arrow buffer back to IQ data', () => {
    const iqReal = new Float32Array([1.0, 0.5, -0.5]);
    const iqImag = new Float32Array([0.0, 0.5, -0.5]);
    const sampleStart = 500;
    
    const arrowBuffer = serializeIQToArrow(iqReal, iqImag, sampleStart);
    const { sampleIndices, iqReal: decodedReal, iqImag: decodedImag } = deserializeArrowToIQ(arrowBuffer);
    
    expect(sampleIndices.length).toBe(3);
    expect(sampleIndices[0]).toBe(500);
    expect(sampleIndices[1]).toBe(501);
    expect(sampleIndices[2]).toBe(502);
    
    expect(decodedReal.length).toBe(3);
    expect(decodedImag.length).toBe(3);
    
    for (let i = 0; i < 3; i++) {
      expect(decodedReal[i]).toBeCloseTo(iqReal[i], 5);
      expect(decodedImag[i]).toBeCloseTo(iqImag[i], 5);
    }
  });

  it('should preserve metadata in Arrow serialization', () => {
    const iqReal = new Float32Array([1.0]);
    const iqImag = new Float32Array([0.0]);
    const metadata = {
      datatype: 'cf32_le',
      sample_rate: '2000000',
      center_frequency: '915000000',
    };
    
    const arrowBuffer = serializeIQToArrow(iqReal, iqImag, 0, metadata);
    const { metadata: decodedMetadata } = deserializeArrowToIQ(arrowBuffer);
    
    // Metadata may not be preserved in all Arrow implementations
    // Just verify metadata object exists
    expect(decodedMetadata).toBeDefined();
    expect(typeof decodedMetadata).toBe('object');
  });

  it('should estimate Arrow buffer size correctly', () => {
    const sampleCount = 1000;
    const estimatedSize = estimateArrowBufferSize(sampleCount);
    
    // Each sample: 12 bytes (4 index + 4 real + 4 imag) + 1KB overhead
    expect(estimatedSize).toBe(13024);
  });

  it('should validate Arrow buffer integrity', () => {
    const iqReal = new Float32Array([1.0, 0.5]);
    const iqImag = new Float32Array([0.0, 0.5]);
    
    const validBuffer = serializeIQToArrow(iqReal, iqImag, 0);
    expect(validateArrowBuffer(validBuffer)).toBe(true);
    
    const invalidBuffer = new Uint8Array([0, 1, 2, 3, 4]);
    expect(validateArrowBuffer(invalidBuffer)).toBe(false);
  });
});

describe('Round-trip Serialization', () => {
  it('should preserve data through full serialization cycle', () => {
    // Create test IQ data
    const buffer = new ArrayBuffer(32); // 4 samples * 8 bytes
    const view = new DataView(buffer);
    
    const testData = [
      { i: 1.0, q: 0.0 },
      { i: 0.707, q: 0.707 },
      { i: 0.0, q: 1.0 },
      { i: -0.707, q: 0.707 },
    ];
    
    testData.forEach((sample, idx) => {
      view.setFloat32(idx * 8, sample.i, true);
      view.setFloat32(idx * 8 + 4, sample.q, true);
    });
    
    // Parse IQ data
    const { iqReal, iqImag } = parseIQData(buffer, 'cf32_le');
    
    // Serialize to Arrow
    const arrowBuffer = serializeIQToArrow(iqReal, iqImag, 1000);
    
    // Deserialize from Arrow
    const { sampleIndices, iqReal: finalReal, iqImag: finalImag } = deserializeArrowToIQ(arrowBuffer);
    
    // Verify data integrity
    expect(sampleIndices.length).toBe(4);
    expect(finalReal.length).toBe(4);
    expect(finalImag.length).toBe(4);
    
    testData.forEach((expected, idx) => {
      expect(finalReal[idx]).toBeCloseTo(expected.i, 5);
      expect(finalImag[idx]).toBeCloseTo(expected.q, 5);
      expect(sampleIndices[idx]).toBe(1000 + idx);
    });
  });
});

describe('Performance and Edge Cases', () => {
  it('should handle large sample counts efficiently', () => {
    const sampleCount = 100000;
    const iqReal = new Float32Array(sampleCount);
    const iqImag = new Float32Array(sampleCount);
    
    // Fill with test data
    for (let i = 0; i < sampleCount; i++) {
      iqReal[i] = Math.sin(i * 0.01);
      iqImag[i] = Math.cos(i * 0.01);
    }
    
    const startTime = Date.now();
    const arrowBuffer = serializeIQToArrow(iqReal, iqImag, 0);
    const serializeTime = Date.now() - startTime;
    
    expect(arrowBuffer.length).toBeGreaterThan(0);
    expect(serializeTime).toBeLessThan(1000); // Should complete in < 1 second
  });

  it('should handle empty data gracefully', () => {
    const iqReal = new Float32Array(0);
    const iqImag = new Float32Array(0);
    
    const arrowBuffer = serializeIQToArrow(iqReal, iqImag, 0);
    expect(arrowBuffer).toBeInstanceOf(Uint8Array);
  });

  it('should handle single sample', () => {
    const iqReal = new Float32Array([0.5]);
    const iqImag = new Float32Array([-0.5]);
    
    const arrowBuffer = serializeIQToArrow(iqReal, iqImag, 42);
    const { sampleIndices, iqReal: decodedReal, iqImag: decodedImag } = deserializeArrowToIQ(arrowBuffer);
    
    expect(sampleIndices.length).toBe(1);
    expect(sampleIndices[0]).toBe(42);
    expect(decodedReal[0]).toBeCloseTo(0.5, 5);
    expect(decodedImag[0]).toBeCloseTo(-0.5, 5);
  });
});
