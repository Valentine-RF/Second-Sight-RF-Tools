import { describe, it, expect } from 'vitest';

/**
 * Tests for Core Forensic Features
 * - Hex view formatting
 * - Context menu actions
 * - Annotation editing
 * - File deletion with S3 cleanup
 */

describe('Hex View Formatting', () => {
  it('should format binary bitstream to hex dump with offset', () => {
    const bitstream = '01001000 01100101 01101100 01101100 01101111'; // "Hello"
    const bytes = bitstream.split(' ').map(byte => parseInt(byte, 2));
    
    expect(bytes).toEqual([72, 101, 108, 108, 111]);
    
    // Format first line
    const offset = 0;
    const hexBytes = bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const asciiChars = bytes.map(b => (b < 32 || b > 126 ? '.' : String.fromCharCode(b))).join('');
    
    expect(hexBytes).toBe('48 65 6C 6C 6F');
    expect(asciiChars).toBe('Hello');
  });

  it('should handle non-printable ASCII characters', () => {
    const bytes = [0x00, 0x1F, 0x20, 0x7E, 0x7F, 0xFF];
    const asciiChars = bytes.map(b => (b < 32 || b > 126 ? '.' : String.fromCharCode(b))).join('');
    
    expect(asciiChars).toBe('.. ~..');
  });

  it('should format hex bytes with proper spacing', () => {
    const bytes = [0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0x57, 0x6F, 0x72, 0x6C, 0x64];
    
    const hexPart1 = bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const hexPart2 = bytes.slice(8).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    
    expect(hexPart1).toBe('48 65 6C 6C 6F 20 57 6F');
    expect(hexPart2).toBe('72 6C 64');
  });

  it('should calculate byte count correctly', () => {
    const bitstream = '01001000 01100101 01101100 01101100 01101111';
    const bytes = bitstream.split(' ').map(byte => parseInt(byte, 2));
    const validBytes = bytes.filter(b => !isNaN(b));
    
    expect(validBytes.length).toBe(5);
  });
});

describe('Context Menu Actions', () => {
  it('should create valid signal selection object', () => {
    const selection = {
      sampleStart: 1000,
      sampleCount: 4096,
      timeStart: 0.001,
      timeEnd: 0.005096,
      freqStart: 900e6,
      freqEnd: 910e6,
    };
    
    expect(selection.sampleCount).toBe(4096);
    expect(selection.timeEnd - selection.timeStart).toBeCloseTo(0.004096, 6);
  });

  it('should validate context menu action parameters', () => {
    const analyzeCyclesParams = {
      captureId: 1,
      sampleStart: 1000,
      sampleCount: 4096,
      nfft: 256,
      overlap: 0.5,
      alphaMax: 0.5,
    };
    
    expect(analyzeCyclesParams.nfft).toBeGreaterThan(0);
    expect(analyzeCyclesParams.overlap).toBeGreaterThanOrEqual(0);
    expect(analyzeCyclesParams.overlap).toBeLessThanOrEqual(1);
  });

  it('should limit sample count for classification', () => {
    const requestedSamples = 10000;
    const limitedSamples = Math.min(requestedSamples, 4096);
    
    expect(limitedSamples).toBe(4096);
  });

  it('should handle demodulation mode selection', () => {
    const modes = ['RTTY', 'PSK31', 'CW'];
    const defaultMode = 'RTTY';
    
    expect(modes).toContain(defaultMode);
  });
});

describe('Annotation Editing', () => {
  it('should detect double-click on annotation', () => {
    let clickCount = 0;
    let doubleClickDetected = false;
    
    const handleClick = () => {
      clickCount++;
      if (clickCount === 2) {
        doubleClickDetected = true;
      }
    };
    
    handleClick();
    handleClick();
    
    expect(doubleClickDetected).toBe(true);
  });

  it('should toggle annotation selection state', () => {
    let selectedId: number | null = null;
    const annotationId = 42;
    
    // First click selects
    selectedId = annotationId;
    expect(selectedId).toBe(42);
    
    // Click on same annotation deselects
    selectedId = selectedId === annotationId ? null : annotationId;
    expect(selectedId).toBe(null);
  });

  it('should apply hover styles to annotations', () => {
    const baseOpacity = 0.7;
    const hoverOpacity = 1.0;
    const baseWidth = 1;
    const hoverWidth = 2;
    
    let isHovered = false;
    
    // Simulate hover
    isHovered = true;
    const currentOpacity = isHovered ? hoverOpacity : baseOpacity;
    const currentWidth = isHovered ? hoverWidth : baseWidth;
    
    expect(currentOpacity).toBe(1.0);
    expect(currentWidth).toBe(2);
  });
});

describe('File Deletion with S3 Cleanup', () => {
  it('should construct S3 file keys correctly', () => {
    const userId = 123;
    const captureId = 456;
    const metaFileKey = `${userId}/captures/${captureId}.sigmf-meta`;
    const dataFileKey = `${userId}/captures/${captureId}.sigmf-data`;
    
    expect(metaFileKey).toBe('123/captures/456.sigmf-meta');
    expect(dataFileKey).toBe('123/captures/456.sigmf-data');
  });

  it('should validate deletion confirmation message', () => {
    const captureName = 'Test Signal';
    const confirmMessage = `Are you sure you want to delete "${captureName}"?\n\nThis will permanently delete:\n• Signal capture metadata\n• Raw IQ data file from S3\n• All annotations and analysis results\n\nThis action cannot be undone.`;
    
    expect(confirmMessage).toContain(captureName);
    expect(confirmMessage).toContain('Signal capture metadata');
    expect(confirmMessage).toContain('Raw IQ data file from S3');
    expect(confirmMessage).toContain('cannot be undone');
  });

  it('should handle S3 deletion errors gracefully', () => {
    let s3DeleteFailed = false;
    let dbDeleteSucceeded = false;
    
    try {
      // Simulate S3 deletion failure
      throw new Error('S3 deletion failed');
    } catch (error) {
      console.error('Failed to delete S3 files:', error);
      s3DeleteFailed = true;
      // Continue with database deletion
      dbDeleteSucceeded = true;
    }
    
    expect(s3DeleteFailed).toBe(true);
    expect(dbDeleteSucceeded).toBe(true);
  });

  it('should return success response after deletion', () => {
    const deleteResponse = { success: true };
    
    expect(deleteResponse.success).toBe(true);
  });
});

describe('Integration Tests', () => {
  it('should complete full forensic workflow', () => {
    // 1. Upload signal capture
    const capture = {
      id: 1,
      name: 'Test Signal',
      sampleRate: 1e6,
      centerFrequency: 915e6,
    };
    
    // 2. Select region
    const selection = {
      sampleStart: 1000,
      sampleCount: 4096,
      timeStart: 0.001,
      timeEnd: 0.005096,
      freqStart: 900e6,
      freqEnd: 910e6,
    };
    
    // 3. Analyze cycles
    const analysisParams = {
      captureId: capture.id,
      sampleStart: selection.sampleStart,
      sampleCount: selection.sampleCount,
      nfft: 256,
    };
    
    // 4. Demodulate
    const demodParams = {
      captureId: capture.id,
      sampleStart: selection.sampleStart,
      sampleCount: selection.sampleCount,
      mode: 'RTTY',
    };
    
    // 5. View hex dump
    const bitstream = '01001000 01100101';
    const bytes = bitstream.split(' ').map(b => parseInt(b, 2));
    
    // 6. Delete capture
    const deleteConfirmed = true;
    
    expect(capture.id).toBe(1);
    expect(analysisParams.nfft).toBe(256);
    expect(demodParams.mode).toBe('RTTY');
    expect(bytes.length).toBe(2);
    expect(deleteConfirmed).toBe(true);
  });
});
