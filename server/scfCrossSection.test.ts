import { describe, it, expect } from 'vitest';
import {
  extractAlphaSlice,
  extractTauSlice,
  extractMultipleAlphaSlices,
  extractMultipleTauSlices,
  findCrossSectionPeak,
  calculateCrossSectionStats,
  crossSectionToCSV,
  type SCFData,
} from './scfCrossSection';

describe('SCF Cross-Section Extraction', () => {
  // Create mock SCF data
  const mockSCFData: SCFData = {
    alpha: [-100, -50, 0, 50, 100], // Cyclic frequency (Hz)
    tau: [0, 1, 2, 3, 4], // Lag (samples)
    scf: [
      [0.1, 0.2, 0.3, 0.2, 0.1], // alpha = -100
      [0.2, 0.4, 0.6, 0.4, 0.2], // alpha = -50
      [0.3, 0.6, 0.9, 0.6, 0.3], // alpha = 0 (peak)
      [0.2, 0.4, 0.6, 0.4, 0.2], // alpha = 50
      [0.1, 0.2, 0.3, 0.2, 0.1], // alpha = 100
    ],
  };

  describe('Alpha Slice Extraction', () => {
    it('should extract alpha slice without interpolation', () => {
      const result = extractAlphaSlice(mockSCFData, 0, false);

      expect(result.sliceType).toBe('alpha');
      expect(result.slicePosition).toBe(0);
      expect(result.axis).toEqual([0, 1, 2, 3, 4]);
      expect(result.values).toEqual([0.3, 0.6, 0.9, 0.6, 0.3]);
    });

    it('should extract alpha slice with interpolation', () => {
      const result = extractAlphaSlice(mockSCFData, 25, true);

      expect(result.sliceType).toBe('alpha');
      expect(result.slicePosition).toBe(25);
      expect(result.axis).toEqual([0, 1, 2, 3, 4]);
      
      // Should interpolate between alpha=0 and alpha=50
      expect(result.values[0]).toBeCloseTo(0.25, 2);
      expect(result.values[2]).toBeCloseTo(0.75, 2);
    });

    it('should handle edge case at minimum alpha', () => {
      const result = extractAlphaSlice(mockSCFData, -100, true);

      expect(result.slicePosition).toBe(-100);
      expect(result.values).toEqual([0.1, 0.2, 0.3, 0.2, 0.1]);
    });

    it('should handle edge case at maximum alpha', () => {
      const result = extractAlphaSlice(mockSCFData, 100, true);

      expect(result.slicePosition).toBe(100);
      expect(result.values).toEqual([0.1, 0.2, 0.3, 0.2, 0.1]);
    });

    it('should clamp alpha values outside range', () => {
      const resultLow = extractAlphaSlice(mockSCFData, -200, true);
      const resultHigh = extractAlphaSlice(mockSCFData, 200, true);

      expect(resultLow.slicePosition).toBe(-100);
      expect(resultHigh.slicePosition).toBe(100);
    });
  });

  describe('Tau Slice Extraction', () => {
    it('should extract tau slice without interpolation', () => {
      const result = extractTauSlice(mockSCFData, 2, false);

      expect(result.sliceType).toBe('tau');
      expect(result.slicePosition).toBe(2);
      expect(result.axis).toEqual([-100, -50, 0, 50, 100]);
      expect(result.values).toEqual([0.3, 0.6, 0.9, 0.6, 0.3]);
    });

    it('should extract tau slice with interpolation', () => {
      const result = extractTauSlice(mockSCFData, 1.5, true);

      expect(result.sliceType).toBe('tau');
      expect(result.slicePosition).toBe(1.5);
      expect(result.axis).toEqual([-100, -50, 0, 50, 100]);
      
      // Should interpolate between tau=1 and tau=2
      expect(result.values[0]).toBeCloseTo(0.25, 2);
      expect(result.values[2]).toBeCloseTo(0.75, 2);
    });

    it('should handle edge case at minimum tau', () => {
      const result = extractTauSlice(mockSCFData, 0, true);

      expect(result.slicePosition).toBe(0);
      expect(result.values).toEqual([0.1, 0.2, 0.3, 0.2, 0.1]);
    });

    it('should handle edge case at maximum tau', () => {
      const result = extractTauSlice(mockSCFData, 4, true);

      expect(result.slicePosition).toBe(4);
      expect(result.values).toEqual([0.1, 0.2, 0.3, 0.2, 0.1]);
    });
  });

  describe('Multiple Slice Extraction', () => {
    it('should extract multiple alpha slices', () => {
      const results = extractMultipleAlphaSlices(mockSCFData, -50, 50, 3, false);

      expect(results.length).toBe(3);
      expect(results[0].slicePosition).toBe(-50);
      expect(results[1].slicePosition).toBe(0);
      expect(results[2].slicePosition).toBe(50);
    });

    it('should extract multiple tau slices', () => {
      const results = extractMultipleTauSlices(mockSCFData, 1, 3, 3, false);

      expect(results.length).toBe(3);
      expect(results[0].slicePosition).toBe(1);
      expect(results[1].slicePosition).toBe(2);
      expect(results[2].slicePosition).toBe(3);
    });

    it('should handle single slice request', () => {
      const results = extractMultipleAlphaSlices(mockSCFData, 0, 0, 1, false);

      expect(results.length).toBe(1);
      expect(results[0].slicePosition).toBe(0);
    });
  });

  describe('Peak Finding', () => {
    it('should find peak in cross-section', () => {
      const slice = extractAlphaSlice(mockSCFData, 0, false);
      const peak = findCrossSectionPeak(slice);

      expect(peak.magnitude).toBe(0.9);
      expect(peak.position).toBe(2);
      expect(peak.index).toBe(2);
    });

    it('should find peak at edge', () => {
      const slice = extractTauSlice(mockSCFData, 0, false);
      const peak = findCrossSectionPeak(slice);

      expect(peak.magnitude).toBe(0.3);
      expect(peak.position).toBe(0);
    });
  });

  describe('Cross-Section Statistics', () => {
    it('should calculate statistics correctly', () => {
      const slice = extractAlphaSlice(mockSCFData, 0, false);
      const stats = calculateCrossSectionStats(slice);

      expect(stats.max).toBe(0.9);
      expect(stats.min).toBe(0.3);
      expect(stats.mean).toBeCloseTo(0.54, 2);
      expect(stats.peakPosition).toBe(2);
      expect(stats.peakMagnitude).toBe(0.9);
    });

    it('should handle uniform data', () => {
      const uniformData: SCFData = {
        alpha: [0, 1, 2],
        tau: [0, 1, 2],
        scf: [
          [0.5, 0.5, 0.5],
          [0.5, 0.5, 0.5],
          [0.5, 0.5, 0.5],
        ],
      };

      const slice = extractAlphaSlice(uniformData, 1, false);
      const stats = calculateCrossSectionStats(slice);

      expect(stats.max).toBe(0.5);
      expect(stats.min).toBe(0.5);
      expect(stats.mean).toBe(0.5);
    });
  });

  describe('CSV Export', () => {
    it('should export alpha slice to CSV', () => {
      const slice = extractAlphaSlice(mockSCFData, 0, false);
      const csv = crossSectionToCSV(slice);

      expect(csv).toContain('Tau,SCF_Magnitude,Alpha=0');
      expect(csv).toContain('0,0.3');
      expect(csv).toContain('2,0.9');
      expect(csv).toContain('4,0.3');
    });

    it('should export tau slice to CSV', () => {
      const slice = extractTauSlice(mockSCFData, 2, false);
      const csv = crossSectionToCSV(slice);

      expect(csv).toContain('Alpha,SCF_Magnitude,Tau=2');
      expect(csv).toContain('-100,0.3');
      expect(csv).toContain('0,0.9');
      expect(csv).toContain('100,0.3');
    });

    it('should format numbers correctly in CSV', () => {
      const slice = extractAlphaSlice(mockSCFData, 25.5, true);
      const csv = crossSectionToCSV(slice);

      expect(csv).toContain('Alpha=25.5');
      expect(csv.split('\n').length).toBeGreaterThan(1);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for empty SCF data', () => {
      const emptyData: SCFData = {
        alpha: [],
        tau: [],
        scf: [],
      };

      expect(() => extractAlphaSlice(emptyData, 0, false)).toThrow('Empty SCF data');
      expect(() => extractTauSlice(emptyData, 0, false)).toThrow('Empty SCF data');
    });

    it('should handle single-point data', () => {
      const singlePointData: SCFData = {
        alpha: [0],
        tau: [0],
        scf: [[0.5]],
      };

      const alphaSlice = extractAlphaSlice(singlePointData, 0, false);
      const tauSlice = extractTauSlice(singlePointData, 0, false);

      expect(alphaSlice.values).toEqual([0.5]);
      expect(tauSlice.values).toEqual([0.5]);
    });
  });

  describe('Interpolation Accuracy', () => {
    it('should interpolate linearly between two points', () => {
      const slice = extractAlphaSlice(mockSCFData, -25, true);

      // At alpha=-25, halfway between alpha=-50 (0.2,0.4,0.6,0.4,0.2) and alpha=0 (0.3,0.6,0.9,0.6,0.3)
      expect(slice.values[0]).toBeCloseTo(0.25, 2);
      expect(slice.values[1]).toBeCloseTo(0.5, 2);
      expect(slice.values[2]).toBeCloseTo(0.75, 2);
      expect(slice.values[3]).toBeCloseTo(0.5, 2);
      expect(slice.values[4]).toBeCloseTo(0.25, 2);
    });

    it('should produce exact values at grid points', () => {
      const slice = extractAlphaSlice(mockSCFData, -50, true);

      expect(slice.values).toEqual([0.2, 0.4, 0.6, 0.4, 0.2]);
    });
  });
});
