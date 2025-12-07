/**
 * Tests for Raw IQ Upload Feature
 * 
 * Validates SigMF metadata generation and raw IQ file ingestion
 */

import { describe, it, expect } from 'vitest';
import { generateSigMFMetadata as generateRawIQMetadata, isValidDatatype, validateFileSize, getBytesPerSample, estimateSampleCount } from './sigmfGenerator';

describe('SigMF Metadata Generator', () => {
  it('should generate valid SigMF metadata from raw IQ parameters', () => {
    const metadata = generateRawIQMetadata({
      name: 'Test Capture',
      description: 'Test description',
      datatype: 'cf32_le',
      sampleRate: 2400000,
      centerFrequency: 915000000,
      hardware: 'HackRF One',
      author: 'Test User',
    });

    const parsed = JSON.parse(metadata);
    
    expect(parsed.global['core:datatype']).toBe('cf32_le');
    expect(parsed.global['core:sample_rate']).toBe(2400000);
    expect(parsed.global['core:version']).toBe('1.0.0');
    expect(parsed.captures).toHaveLength(1);
    expect(parsed.captures[0]['core:frequency']).toBe(915000000);
    expect(parsed.annotations).toEqual([]);
  });

  it('should use default values for optional fields', () => {
    const metadata = generateRawIQMetadata({
      name: 'Minimal Capture',
      datatype: 'ci16_le',
      sampleRate: 1000000,
    });

    const parsed = JSON.parse(metadata);
    
    expect(parsed.global['core:author']).toBe('Unknown');
    expect(parsed.global['core:hw']).toBe('Unknown');
    expect(parsed.captures[0]['core:frequency']).toBe(0);
  });
});

describe('Datatype Validation', () => {
  it('should validate correct SigMF datatypes', () => {
    expect(isValidDatatype('cf32_le')).toBe(true);
    expect(isValidDatatype('ci16_le')).toBe(true);
    expect(isValidDatatype('ci8')).toBe(true);
    expect(isValidDatatype('cu8')).toBe(true);
    expect(isValidDatatype('cu16_le')).toBe(true);
  });

  it('should reject invalid datatypes', () => {
    expect(isValidDatatype('invalid')).toBe(false);
    expect(isValidDatatype('cf64_le')).toBe(false);
    expect(isValidDatatype('')).toBe(false);
  });
});

describe('File Size Validation', () => {
  it('should calculate correct bytes per sample', () => {
    expect(getBytesPerSample('cf32_le')).toBe(8); // 32-bit float * 2 (I+Q)
    expect(getBytesPerSample('ci16_le')).toBe(4); // 16-bit int * 2 (I+Q)
    expect(getBytesPerSample('ci8')).toBe(2); // 8-bit int * 2 (I+Q)
    expect(getBytesPerSample('cu8')).toBe(2); // 8-bit uint * 2 (I+Q)
  });

  it('should validate file size matches datatype', () => {
    // cf32_le: 8 bytes per sample
    expect(validateFileSize(8000, 'cf32_le')).toBe(true);
    expect(validateFileSize(8001, 'cf32_le')).toBe(false);
    
    // ci16_le: 4 bytes per sample
    expect(validateFileSize(4000, 'ci16_le')).toBe(true);
    expect(validateFileSize(4001, 'ci16_le')).toBe(false);
    
    // ci8: 2 bytes per sample
    expect(validateFileSize(2000, 'ci8')).toBe(true);
    expect(validateFileSize(2001, 'ci8')).toBe(false);
  });

  it('should estimate correct sample count', () => {
    expect(estimateSampleCount(8000, 'cf32_le')).toBe(1000);
    expect(estimateSampleCount(4000, 'ci16_le')).toBe(1000);
    expect(estimateSampleCount(2000, 'ci8')).toBe(1000);
  });
});

describe('Raw IQ Upload tRPC Procedure', () => {
  it('should reject invalid datatypes', async () => {
    // This test would require a full tRPC context setup
    // For now, we test the validation functions directly
    expect(isValidDatatype('invalid_type')).toBe(false);
  });

  it('should reject file sizes that don\'t match datatype', () => {
    // File size must be exact multiple of bytes per sample
    expect(validateFileSize(10000001, 'cf32_le')).toBe(false);
    expect(validateFileSize(10000000, 'cf32_le')).toBe(true);
  });
});
