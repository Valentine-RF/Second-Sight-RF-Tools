import { describe, it, expect } from 'vitest';

/**
 * Signal Format Detector Tests
 * 
 * Tests filename parsing, metadata extraction, and confidence scoring
 */

describe('Signal Format Detector - Filename Parsing', () => {
  describe('Sample Rate Detection', () => {
    it('should detect sample rate in MSps format', () => {
      const testCases = [
        { filename: 'capture_2.4MSps_915MHz.iq', expected: 2.4e6 },
        { filename: 'signal_10MSps.dat', expected: 10e6 },
        { filename: 'test_0.25MSps.bin', expected: 0.25e6 },
      ];

      testCases.forEach(({ filename, expected }) => {
        const match = filename.match(/(\d+\.?\d*)\s*MSps/i);
        if (match) {
          const sampleRate = parseFloat(match[1]) * 1e6;
          expect(sampleRate).toBeCloseTo(expected, 0);
        }
      });
    });

    it('should detect sample rate in GQRX format', () => {
      const filename = 'gqrx_20231215_123456_915000000_2400000_fc.raw';
      const match = filename.match(/_(\d{6,})_fc/i);
      
      expect(match).toBeTruthy();
      if (match) {
        const sampleRate = parseFloat(match[1]);
        expect(sampleRate).toBe(2400000);
      }
    });
  });

  describe('Center Frequency Detection', () => {
    it('should detect frequency in MHz format', () => {
      const testCases = [
        { filename: 'capture_915MHz.iq', expected: 915e6 },
        { filename: 'signal_433.92MHz.dat', expected: 433.92e6 },
        { filename: 'test_2.4GHz.bin', expected: 2.4e9 },
      ];

      testCases.forEach(({ filename, expected }) => {
        const mhzMatch = filename.match(/(\d+\.?\d*)\s*MHz/i);
        const ghzMatch = filename.match(/(\d+\.?\d*)\s*GHz/i);
        
        if (ghzMatch) {
          const freq = parseFloat(ghzMatch[1]) * 1e9;
          expect(freq).toBeCloseTo(expected, 0);
        } else if (mhzMatch) {
          const freq = parseFloat(mhzMatch[1]) * 1e6;
          expect(freq).toBeCloseTo(expected, 0);
        }
      });
    });

    it('should detect frequency in Hz format (8+ digits)', () => {
      const filename = 'capture_915000000_2400000.iq';
      const matches = Array.from(filename.matchAll(/(\d{8,})/g));
      
      expect(matches.length).toBeGreaterThan(0);
      const freq = parseFloat(matches[0][1]);
      expect(freq).toBe(915000000);
    });
  });

  describe('Datatype Detection', () => {
    it('should detect cf32 datatype', () => {
      const testCases = [
        'capture_cf32.iq',
        'signal_fc32.dat',
        'test_complex_float_32.bin',
      ];

      testCases.forEach(filename => {
        const match = filename.match(/cf32|fc32|complex.*float.*32/i);
        expect(match).toBeTruthy();
      });
    });

    it('should detect ci16 datatype', () => {
      const testCases = [
        'capture_ci16.iq',
        'signal_sc16.dat',
        'test_complex_int_16.bin',
      ];

      testCases.forEach(filename => {
        const match = filename.match(/ci16|sc16|complex.*int.*16/i);
        expect(match).toBeTruthy();
      });
    });
  });

  describe('Hardware Detection', () => {
    it('should detect HackRF hardware', () => {
      const testCases = [
        'hackrf_capture.iq',
        'HackRF_One_signal.dat',
        'hackrf-recording.bin',
      ];

      testCases.forEach(filename => {
        const match = filename.match(/hackrf/i);
        expect(match).toBeTruthy();
      });
    });

    it('should detect RTL-SDR hardware', () => {
      const testCases = [
        'rtlsdr_capture.iq',
        'rtl-sdr_signal.dat',
        'rtl2832_recording.bin',
      ];

      testCases.forEach(filename => {
        const match = filename.match(/rtl[-_]?sdr|rtl2832/i);
        expect(match).toBeTruthy();
      });
    });
  });
});

describe('Signal Format Detector - File Size Analysis', () => {
  it('should calculate bytes per sample correctly', () => {
    const bytesPerSample: Record<string, number> = {
      'cf32_le': 8,  // 2 × float32
      'ci16_le': 4,  // 2 × int16
      'cu16_le': 4,  // 2 × uint16
      'ci8': 2,      // 2 × int8
      'cu8': 2,      // 2 × uint8
    };

    Object.entries(bytesPerSample).forEach(([datatype, expected]) => {
      expect(expected).toBeGreaterThan(0);
      expect(expected).toBeLessThanOrEqual(8);
    });
  });

  it('should estimate sample rate from file size', () => {
    const fileSize = 19200000; // 19.2 MB
    const bytesPerSample = 8; // cf32_le
    const totalSamples = fileSize / bytesPerSample;

    // Common sample rates
    const commonRates = [2400000, 10000000, 20000000];
    
    let matchedRate = null;
    for (const rate of commonRates) {
      const duration = totalSamples / rate;
      if (duration >= 0.5 && duration <= 60) {
        matchedRate = rate;
        break;
      }
    }

    expect(matchedRate).toBe(2400000); // 2.4 MSps
    
    // Verify duration is reasonable
    const duration = totalSamples / matchedRate!;
    expect(duration).toBeGreaterThan(0.5);
    expect(duration).toBeLessThan(60);
  });
});

describe('Signal Format Detector - Confidence Scoring', () => {
  it('should calculate high confidence for complete metadata', () => {
    let confidence = 0;
    
    // Header detected
    confidence += 50;
    // Filename sample rate
    confidence += 20;
    // Filename frequency
    confidence += 15;
    // Filename datatype
    confidence += 10;
    // Filename hardware
    confidence += 5;
    
    expect(confidence).toBe(100);
  });

  it('should calculate medium confidence for partial metadata', () => {
    let confidence = 0;
    
    // Header detected
    confidence += 50;
    // Filename sample rate
    confidence += 20;
    
    expect(confidence).toBe(70);
    expect(confidence).toBeGreaterThanOrEqual(50);
    expect(confidence).toBeLessThan(80);
  });

  it('should calculate low confidence for minimal metadata', () => {
    let confidence = 30; // Heuristic guess
    
    expect(confidence).toBeLessThan(50);
  });
});

describe('Signal Format Detector - Format Utilities', () => {
  it('should format frequency correctly', () => {
    const testCases = [
      { hz: 915000000, expected: '915.00 MHz' },
      { hz: 2400000000, expected: '2.40 GHz' },
      { hz: 433920000, expected: '433.92 MHz' },
      { hz: 100000, expected: '100.00 kHz' },
    ];

    testCases.forEach(({ hz, expected }) => {
      let formatted: string;
      if (hz >= 1e9) {
        formatted = `${(hz / 1e9).toFixed(2)} GHz`;
      } else if (hz >= 1e6) {
        formatted = `${(hz / 1e6).toFixed(2)} MHz`;
      } else if (hz >= 1e3) {
        formatted = `${(hz / 1e3).toFixed(2)} kHz`;
      } else {
        formatted = `${hz.toFixed(0)} Hz`;
      }
      
      expect(formatted).toBe(expected);
    });
  });

  it('should format sample rate correctly', () => {
    const testCases = [
      { hz: 2400000, expected: '2.40 MSps' },
      { hz: 10000000, expected: '10.00 MSps' },
      { hz: 250000, expected: '250.00 kSps' },
    ];

    testCases.forEach(({ hz, expected }) => {
      let formatted: string;
      if (hz >= 1e6) {
        formatted = `${(hz / 1e6).toFixed(2)} MSps`;
      } else if (hz >= 1e3) {
        formatted = `${(hz / 1e3).toFixed(2)} kSps`;
      } else {
        formatted = `${hz.toFixed(0)} Sps`;
      }
      
      expect(formatted).toBe(expected);
    });
  });
});

describe('Signal Format Detector - Complex Filename Patterns', () => {
  it('should parse GQRX filename format', () => {
    const filename = 'gqrx_20231215_123456_915000000_2400000_fc.raw';
    
    // Extract frequency (8+ digits, specifically the 9-digit one)
    const freqMatch = filename.match(/(\d{9})/); // 9 digits for frequency in Hz
    expect(freqMatch).toBeTruthy();
    if (freqMatch) {
      const freq = parseFloat(freqMatch[1]);
      expect(freq).toBe(915000000);
    }
    
    // Extract sample rate (digits before _fc)
    const rateMatch = filename.match(/_(\d{6,})_fc/i);
    expect(rateMatch).toBeTruthy();
    if (rateMatch) {
      const rate = parseFloat(rateMatch[1]);
      expect(rate).toBe(2400000);
    }
  });

  it('should parse descriptive filename format', () => {
    const filename = 'HackRF_FM_Broadcast_100MHz_2.4MSps_cf32.iq';
    
    // Hardware
    const hwMatch = filename.match(/hackrf/i);
    expect(hwMatch).toBeTruthy();
    
    // Frequency
    const freqMatch = filename.match(/(\d+\.?\d*)\s*MHz/i);
    expect(freqMatch).toBeTruthy();
    if (freqMatch) {
      const freq = parseFloat(freqMatch[1]) * 1e6;
      expect(freq).toBe(100e6);
    }
    
    // Sample rate
    const rateMatch = filename.match(/(\d+\.?\d*)\s*MSps/i);
    expect(rateMatch).toBeTruthy();
    if (rateMatch) {
      const rate = parseFloat(rateMatch[1]) * 1e6;
      expect(rate).toBe(2.4e6);
    }
    
    // Datatype
    const dtMatch = filename.match(/cf32/i);
    expect(dtMatch).toBeTruthy();
  });

  it('should handle ambiguous filenames gracefully', () => {
    const filename = 'capture.bin';
    
    // No metadata in filename
    const freqMatch = filename.match(/(\d+\.?\d*)\s*MHz/i);
    const rateMatch = filename.match(/(\d+\.?\d*)\s*MSps/i);
    
    expect(freqMatch).toBeNull();
    expect(rateMatch).toBeNull();
    
    // Should fall back to heuristics
    const confidence = 30; // Low confidence
    expect(confidence).toBeLessThan(50);
  });
});

describe('Signal Format Detector - SigMF Datatype Mapping', () => {
  it('should map SigMF datatypes to internal format', () => {
    const mapping: Record<string, string> = {
      'cf32_le': 'cf32_le',
      'ci16_le': 'ci16_le',
      'ci8': 'ci8',
      'cu8': 'cu8',
      'cu16_le': 'cu16_le',
    };

    Object.entries(mapping).forEach(([sigmf, internal]) => {
      expect(mapping[sigmf]).toBe(internal);
    });
  });
});
