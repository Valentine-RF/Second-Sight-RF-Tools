/**
 * Circular buffer for storing incoming IQ samples from SDR streaming.
 * Implements a ring buffer with configurable retention time to store
 * the last N seconds of IQ data for spectrogram history.
 */

export interface CircularBufferStats {
  capacity: number;
  used: number;
  utilizationPercent: number;
  overflowCount: number;
  sampleRate: number;
  retentionSeconds: number;
}

export class CircularIQBuffer {
  private buffer: Float32Array;
  private writeIndex: number = 0;
  private capacity: number;
  private sampleRate: number;
  private retentionSeconds: number;
  private overflowCount: number = 0;
  private totalSamplesWritten: number = 0;

  /**
   * Create a circular buffer for IQ samples.
   * @param sampleRate Sample rate in samples/second
   * @param retentionSeconds Number of seconds of history to retain
   */
  constructor(sampleRate: number, retentionSeconds: number) {
    this.sampleRate = sampleRate;
    this.retentionSeconds = retentionSeconds;
    
    // Calculate capacity: samples/sec * seconds * 2 (I+Q components)
    this.capacity = Math.floor(sampleRate * retentionSeconds * 2);
    
    // Allocate buffer
    this.buffer = new Float32Array(this.capacity);
    
    console.log(`[CircularIQBuffer] Initialized: ${(this.capacity * 4 / 1024 / 1024).toFixed(2)} MB, ` +
                `${retentionSeconds}s retention @ ${(sampleRate / 1e6).toFixed(2)} MS/s`);
  }

  /**
   * Write IQ samples to the buffer. Automatically wraps around when full.
   * @param samples Float32Array of interleaved I/Q samples [I0, Q0, I1, Q1, ...]
   * @returns Number of samples written
   */
  write(samples: Float32Array): number {
    if (samples.length === 0) return 0;
    
    // Check if samples will cause overflow
    if (samples.length > this.capacity) {
      this.overflowCount++;
      console.warn(`[CircularIQBuffer] Overflow: ${samples.length} samples exceed capacity ${this.capacity}`);
      // Truncate to fit
      samples = samples.subarray(0, this.capacity);
    }

    const remaining = this.capacity - this.writeIndex;
    
    if (samples.length <= remaining) {
      // Fits without wrapping
      this.buffer.set(samples, this.writeIndex);
      this.writeIndex += samples.length;
    } else {
      // Need to wrap around
      this.buffer.set(samples.subarray(0, remaining), this.writeIndex);
      this.buffer.set(samples.subarray(remaining), 0);
      this.writeIndex = samples.length - remaining;
    }

    // Wrap write index if at capacity
    if (this.writeIndex >= this.capacity) {
      this.writeIndex = 0;
    }

    this.totalSamplesWritten += samples.length;
    return samples.length;
  }

  /**
   * Read IQ samples from the buffer.
   * @param start Start index (0 = start of buffer)
   * @param length Number of samples to read
   * @returns Float32Array of IQ samples, or null if invalid range
   */
  read(start: number, length: number): Float32Array | null {
    if (start < 0 || length <= 0 || start + length > this.capacity) {
      return null;
    }

    const result = new Float32Array(length);
    const remaining = this.capacity - start;

    if (length <= remaining) {
      // No wrap-around needed
      result.set(this.buffer.subarray(start, start + length), 0);
      return result;
    } else {
      // Need to handle wrap-around
      result.set(this.buffer.subarray(start, this.capacity), 0);
      result.set(this.buffer.subarray(0, length - remaining), remaining);
      return result;
    }
  }

  /**
   * Read the most recent N samples from the buffer.
   * @param length Number of recent samples to read
   * @returns Float32Array of most recent IQ samples
   */
  readRecent(length: number): Float32Array | null {
    if (length <= 0 || length > this.capacity) {
      return null;
    }

    // Calculate start position for most recent samples
    let start = this.writeIndex - length;
    if (start < 0) {
      start += this.capacity;
    }

    const result = new Float32Array(length);
    const remaining = this.capacity - start;

    if (length <= remaining) {
      result.set(this.buffer.subarray(start, start + length), 0);
    } else {
      result.set(this.buffer.subarray(start, this.capacity), 0);
      result.set(this.buffer.subarray(0, length - remaining), remaining);
    }

    return result;
  }

  /**
   * Get buffer statistics.
   */
  getStats(): CircularBufferStats {
    const used = Math.min(this.totalSamplesWritten, this.capacity);
    return {
      capacity: this.capacity,
      used,
      utilizationPercent: (used / this.capacity) * 100,
      overflowCount: this.overflowCount,
      sampleRate: this.sampleRate,
      retentionSeconds: this.retentionSeconds,
    };
  }

  /**
   * Clear the buffer and reset counters.
   */
  clear(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.overflowCount = 0;
    this.totalSamplesWritten = 0;
  }

  /**
   * Get current write position.
   */
  getWriteIndex(): number {
    return this.writeIndex;
  }

  /**
   * Get buffer capacity in samples.
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Get total samples written (may exceed capacity).
   */
  getTotalSamplesWritten(): number {
    return this.totalSamplesWritten;
  }

  /**
   * Check if buffer has overflowed.
   */
  hasOverflowed(): boolean {
    return this.overflowCount > 0;
  }

  /**
   * Get memory usage in bytes.
   */
  getMemoryUsage(): number {
    return this.buffer.byteLength;
  }
}

/**
 * Create a circular buffer with decimation to reduce memory usage.
 * @param sampleRate Original sample rate
 * @param retentionSeconds Retention time in seconds
 * @param decimationFactor Decimation factor (e.g., 10 = keep 1 out of every 10 samples)
 */
export function createDecimatedBuffer(
  sampleRate: number,
  retentionSeconds: number,
  decimationFactor: number
): CircularIQBuffer {
  const decimatedRate = sampleRate / decimationFactor;
  return new CircularIQBuffer(decimatedRate, retentionSeconds);
}
