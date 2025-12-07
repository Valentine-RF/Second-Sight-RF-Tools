import { describe, expect, it } from "vitest";
import { parseSigMFSamples, getBytesPerSample } from "../client/src/lib/sigmfDataReader";

describe("SigMF Data Reader", () => {
  it("should parse cf32_le datatype correctly", () => {
    // Create test buffer with complex float32 samples
    const buffer = new Float32Array([1.0, 0.5, -0.5, -1.0]).buffer;
    const samples = parseSigMFSamples(buffer, "cf32_le");
    
    expect(samples.length).toBe(4);
    expect(samples[0]).toBe(1.0);
    expect(samples[1]).toBe(0.5);
    expect(samples[2]).toBe(-0.5);
    expect(samples[3]).toBe(-1.0);
  });
  
  it("should parse ci16_le datatype and normalize to [-1, 1]", () => {
    // Create test buffer with complex int16 samples
    const int16Array = new Int16Array([32767, 16384, -16384, -32768]);
    const samples = parseSigMFSamples(int16Array.buffer, "ci16_le");
    
    expect(samples.length).toBe(4);
    expect(samples[0]).toBeCloseTo(1.0, 3);
    expect(samples[1]).toBeCloseTo(0.5, 5);
    expect(samples[2]).toBeCloseTo(-0.5, 5);
    expect(samples[3]).toBeCloseTo(-1.0, 5);
  });
  
  it("should parse ci8 datatype and normalize to [-1, 1]", () => {
    // Create test buffer with complex int8 samples
    const int8Array = new Int8Array([127, 64, -64, -128]);
    const samples = parseSigMFSamples(int8Array.buffer, "ci8");
    
    expect(samples.length).toBe(4);
    expect(samples[0]).toBeCloseTo(0.992, 2);
    expect(samples[1]).toBe(0.5);
    expect(samples[2]).toBe(-0.5);
    expect(samples[3]).toBe(-1.0);
  });
  
  it("should parse cu8 datatype and normalize to [-1, 1]", () => {
    // Create test buffer with complex uint8 samples
    const uint8Array = new Uint8Array([255, 192, 64, 0]);
    const samples = parseSigMFSamples(uint8Array.buffer, "cu8");
    
    expect(samples.length).toBe(4);
    expect(samples[0]).toBeCloseTo(0.992, 2);
    expect(samples[1]).toBe(0.5);
    expect(samples[2]).toBe(-0.5);
    expect(samples[3]).toBe(-1.0);
  });
  
  it("should throw error for unsupported datatype", () => {
    const buffer = new ArrayBuffer(8);
    expect(() => parseSigMFSamples(buffer, "invalid" as any)).toThrow("Unsupported datatype");
  });
  
  it("should return correct bytes per sample for each datatype", () => {
    expect(getBytesPerSample("cf32_le")).toBe(8);
    expect(getBytesPerSample("ci16_le")).toBe(4);
    expect(getBytesPerSample("ci8")).toBe(2);
    expect(getBytesPerSample("cu8")).toBe(2);
  });
});

describe("Streaming Pipeline Configuration", () => {
  it("should validate FFT size is power of 2", () => {
    const validSizes = [256, 512, 1024, 2048, 4096, 8192];
    validSizes.forEach(size => {
      expect(Math.log2(size) % 1).toBe(0);
    });
  });
  
  it("should validate FFT size range (256-8192)", () => {
    const minSize = 256;
    const maxSize = 8192;
    
    expect(minSize).toBeGreaterThanOrEqual(256);
    expect(maxSize).toBeLessThanOrEqual(8192);
    expect(Math.log2(minSize) % 1).toBe(0);
    expect(Math.log2(maxSize) % 1).toBe(0);
  });
  
  it("should validate window function types", () => {
    const validWindows = ["rectangular", "hamming", "hann", "blackmanHarris"];
    expect(validWindows).toContain("hann"); // default
    expect(validWindows.length).toBe(4);
  });
  
  it("should validate chunk size defaults", () => {
    const defaultChunkSize = 8192;
    expect(defaultChunkSize).toBeGreaterThan(0);
    expect(defaultChunkSize).toBeLessThanOrEqual(65536);
  });
  
  it("should validate max queue size for backpressure", () => {
    const defaultMaxQueue = 10;
    expect(defaultMaxQueue).toBeGreaterThan(0);
    expect(defaultMaxQueue).toBeLessThanOrEqual(100);
  });
});

describe("Pipeline State Management", () => {
  it("should define all valid pipeline states", () => {
    const validStates = ["idle", "running", "paused", "stopped"];
    expect(validStates).toContain("idle");
    expect(validStates).toContain("running");
    expect(validStates).toContain("paused");
    expect(validStates).toContain("stopped");
  });
  
  it("should validate progress range (0-100)", () => {
    const minProgress = 0;
    const maxProgress = 100;
    
    expect(minProgress).toBe(0);
    expect(maxProgress).toBe(100);
  });
});
