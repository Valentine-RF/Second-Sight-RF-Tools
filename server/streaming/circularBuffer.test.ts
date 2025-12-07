import { describe, it, expect, beforeEach } from 'vitest';
import { CircularIQBuffer, createDecimatedBuffer } from './circularBuffer';

describe('CircularIQBuffer', () => {
  let buffer: CircularIQBuffer;

  beforeEach(() => {
    // Create buffer for 1 second at 1 MS/s (2M samples = 8 MB)
    buffer = new CircularIQBuffer(1_000_000, 1);
  });

  it('should initialize with correct capacity', () => {
    expect(buffer.getCapacity()).toBe(2_000_000); // 1M samples/s * 1s * 2 (I+Q)
    expect(buffer.getMemoryUsage()).toBe(8_000_000); // 2M samples * 4 bytes
  });

  it('should write samples without overflow', () => {
    const samples = new Float32Array([1, 2, 3, 4, 5, 6]); // 3 IQ pairs
    const written = buffer.write(samples);
    
    expect(written).toBe(6);
    expect(buffer.getTotalSamplesWritten()).toBe(6);
    expect(buffer.hasOverflowed()).toBe(false);
  });

  it('should handle wrap-around writes', () => {
    const capacity = buffer.getCapacity();
    
    // Fill buffer to near capacity
    const samples1 = new Float32Array(capacity - 10);
    samples1.fill(1);
    buffer.write(samples1);
    
    // Write more to cause wrap-around
    const samples2 = new Float32Array(20);
    samples2.fill(2);
    buffer.write(samples2);
    
    expect(buffer.getWriteIndex()).toBe(10); // Wrapped around
    expect(buffer.getTotalSamplesWritten()).toBe(capacity + 10);
  });

  it('should read samples correctly', () => {
    const samples = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
    buffer.write(samples);
    
    const read = buffer.read(0, 4);
    expect(read).toEqual(new Float32Array([1, 2, 3, 4]));
  });

  it('should read recent samples correctly', () => {
    const samples = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
    buffer.write(samples);
    
    const recent = buffer.readRecent(4);
    expect(recent).toEqual(new Float32Array([5, 6, 7, 8]));
  });

  it('should handle wrap-around reads', () => {
    const capacity = buffer.getCapacity();
    
    // Fill buffer
    const samples1 = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) {
      samples1[i] = i % 256;
    }
    buffer.write(samples1);
    
    // Overwrite first 10 samples
    const samples2 = new Float32Array(10);
    samples2.fill(99);
    buffer.write(samples2);
    
    // Read across wrap boundary
    const read = buffer.readRecent(20);
    expect(read).not.toBeNull();
    expect(read![10]).toBe(99); // Should include wrapped data
  });

  it('should detect overflow when samples exceed capacity', () => {
    const capacity = buffer.getCapacity();
    const samples = new Float32Array(capacity + 1000);
    
    buffer.write(samples);
    
    expect(buffer.hasOverflowed()).toBe(true);
    expect(buffer.getStats().overflowCount).toBe(1);
  });

  it('should return correct stats', () => {
    const samples = new Float32Array(1000);
    buffer.write(samples);
    
    const stats = buffer.getStats();
    expect(stats.capacity).toBe(2_000_000);
    expect(stats.used).toBe(1000);
    expect(stats.utilizationPercent).toBeCloseTo(0.05, 2);
    expect(stats.sampleRate).toBe(1_000_000);
    expect(stats.retentionSeconds).toBe(1);
  });

  it('should clear buffer correctly', () => {
    const samples = new Float32Array([1, 2, 3, 4]);
    buffer.write(samples);
    
    buffer.clear();
    
    expect(buffer.getTotalSamplesWritten()).toBe(0);
    expect(buffer.getWriteIndex()).toBe(0);
    expect(buffer.hasOverflowed()).toBe(false);
  });

  it('should handle invalid read ranges', () => {
    expect(buffer.read(-1, 10)).toBeNull();
    expect(buffer.read(0, -5)).toBeNull();
    expect(buffer.read(0, buffer.getCapacity() + 1)).toBeNull();
  });

  it('should create decimated buffer with reduced capacity', () => {
    const decimated = createDecimatedBuffer(1_000_000, 1, 10);
    
    expect(decimated.getCapacity()).toBe(200_000); // 1M / 10 * 1s * 2
    expect(decimated.getMemoryUsage()).toBe(800_000); // 200K * 4 bytes
  });

  it('should maintain data integrity with continuous writes', () => {
    // Simulate streaming: write 1000 samples at a time
    for (let i = 0; i < 100; i++) {
      const samples = new Float32Array(1000);
      samples.fill(i);
      buffer.write(samples);
    }
    
    expect(buffer.getTotalSamplesWritten()).toBe(100_000);
    
    // Read recent samples and verify
    const recent = buffer.readRecent(1000);
    expect(recent).not.toBeNull();
    expect(recent![0]).toBe(99); // Last batch had value 99
  });

  it('should handle zero-length writes', () => {
    const samples = new Float32Array(0);
    const written = buffer.write(samples);
    
    expect(written).toBe(0);
    expect(buffer.getTotalSamplesWritten()).toBe(0);
  });

  it('should calculate memory usage for different retention times', () => {
    const buffer30s = new CircularIQBuffer(2_400_000, 30); // RTL-SDR max rate, 30s
    const buffer60s = new CircularIQBuffer(240_000, 60); // Decimated 10x, 60s
    
    // 2.4 MS/s * 30s * 2 * 4 bytes = 576 MB
    expect(buffer30s.getMemoryUsage()).toBe(2_400_000 * 30 * 2 * 4);
    
    // 240 kS/s * 60s * 2 * 4 bytes = 115.2 MB
    expect(buffer60s.getMemoryUsage()).toBe(240_000 * 60 * 2 * 4);
  });
});
