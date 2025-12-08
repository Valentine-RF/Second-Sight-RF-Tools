import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidDatatype, validateFileSize, generateSigMFMetadata } from './sigmfGenerator';

describe('Upload Validation', () => {
  describe('isValidDatatype', () => {
    it('should accept valid SigMF datatypes', () => {
      expect(isValidDatatype('cf32_le')).toBe(true);
      expect(isValidDatatype('ci16_le')).toBe(true);
      expect(isValidDatatype('cu8')).toBe(true);
      expect(isValidDatatype('ci8')).toBe(true);
    });

    it('should reject invalid datatypes', () => {
      expect(isValidDatatype('invalid')).toBe(false);
      expect(isValidDatatype('cf64_le')).toBe(false);
      expect(isValidDatatype('')).toBe(false);
    });
  });

  describe('validateFileSize', () => {
    it('should validate cf32_le file sizes (8 bytes per sample)', () => {
      expect(validateFileSize(8, 'cf32_le')).toBe(true);
      expect(validateFileSize(800, 'cf32_le')).toBe(true);
      expect(validateFileSize(8000, 'cf32_le')).toBe(true);
      expect(validateFileSize(7, 'cf32_le')).toBe(false);
      expect(validateFileSize(9, 'cf32_le')).toBe(false);
    });

    it('should validate ci16_le file sizes (4 bytes per sample)', () => {
      expect(validateFileSize(4, 'ci16_le')).toBe(true);
      expect(validateFileSize(400, 'ci16_le')).toBe(true);
      expect(validateFileSize(4000, 'ci16_le')).toBe(true);
      expect(validateFileSize(3, 'ci16_le')).toBe(false);
      expect(validateFileSize(5, 'ci16_le')).toBe(false);
    });

    it('should validate cu8 file sizes (2 bytes per sample)', () => {
      expect(validateFileSize(2, 'cu8')).toBe(true);
      expect(validateFileSize(200, 'cu8')).toBe(true);
      expect(validateFileSize(2000, 'cu8')).toBe(true);
      expect(validateFileSize(1, 'cu8')).toBe(false);
      expect(validateFileSize(3, 'cu8')).toBe(false);
    });
  });

  describe('generateSigMFMetadata', () => {
    it('should generate valid SigMF metadata JSON', () => {
      const metadata = generateSigMFMetadata({
        name: 'test_capture',
        datatype: 'cf32_le',
        sampleRate: 2000000,
        centerFrequency: 915000000,
        hardware: 'HackRF One',
        author: 'Test User',
      });

      const parsed = JSON.parse(metadata);
      
      expect(parsed.global['core:datatype']).toBe('cf32_le');
      expect(parsed.global['core:sample_rate']).toBe(2000000);
      expect(parsed.global['core:version']).toBe('1.0.0');
      expect(parsed.global['core:author']).toBe('Test User');
      expect(parsed.global['core:hw']).toBe('HackRF One');
      expect(parsed.captures).toHaveLength(1);
      expect(parsed.captures[0]['core:sample_start']).toBe(0);
      expect(parsed.captures[0]['core:frequency']).toBe(915000000);
    });

    it('should handle optional fields', () => {
      const metadata = generateSigMFMetadata({
        name: 'minimal_capture',
        datatype: 'ci16_le',
        sampleRate: 1000000,
      });

      const parsed = JSON.parse(metadata);
      
      expect(parsed.global['core:datatype']).toBe('ci16_le');
      expect(parsed.global['core:sample_rate']).toBe(1000000);
      expect(parsed.global['core:author']).toBe('Unknown');
      expect(parsed.global['core:hw']).toBe('Unknown');
      // When centerFrequency is not provided, it defaults to 0
      expect(parsed.captures[0]['core:frequency']).toBe(0);
    });

    it('should include proper SigMF structure', () => {
      const metadata = generateSigMFMetadata({
        name: 'structure_test',
        datatype: 'cu8',
        sampleRate: 250000,
      });

      const parsed = JSON.parse(metadata);
      
      expect(parsed).toHaveProperty('global');
      expect(parsed).toHaveProperty('captures');
      expect(parsed).toHaveProperty('annotations');
      expect(Array.isArray(parsed.captures)).toBe(true);
      expect(Array.isArray(parsed.annotations)).toBe(true);
    });
  });
});

describe('File Size Limits', () => {
  it('should accept files up to 10GB', () => {
    const tenGB = 10 * 1024 * 1024 * 1024;
    // cf32_le: 8 bytes per sample
    expect(validateFileSize(tenGB, 'cf32_le')).toBe(true);
  });

  it('should validate large file sizes correctly', () => {
    const oneGB = 1024 * 1024 * 1024;
    expect(validateFileSize(oneGB, 'cf32_le')).toBe(true);
    expect(validateFileSize(oneGB, 'ci16_le')).toBe(true);
    expect(validateFileSize(oneGB, 'cu8')).toBe(true);
  });
});
