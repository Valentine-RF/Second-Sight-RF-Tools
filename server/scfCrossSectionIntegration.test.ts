import { describe, it, expect } from 'vitest';
import { extractAlphaSlice, extractTauSlice, type SCFData } from './scfCrossSection';

describe('SCF Cross-Section Integration', () => {
  // Mock realistic SCF data from FAM analysis
  const mockSCFData: SCFData = {
    alpha: [-200, -150, -100, -50, 0, 50, 100, 150, 200], // Cyclic frequency (Hz)
    tau: [0, 10, 20, 30, 40, 50, 60, 70, 80], // Lag (samples)
    scf: [
      [0.05, 0.10, 0.15, 0.20, 0.15, 0.10, 0.08, 0.05, 0.03],
      [0.08, 0.15, 0.25, 0.35, 0.30, 0.20, 0.15, 0.10, 0.05],
      [0.12, 0.25, 0.40, 0.55, 0.50, 0.35, 0.25, 0.15, 0.08],
      [0.18, 0.35, 0.55, 0.75, 0.70, 0.50, 0.35, 0.20, 0.10],
      [0.25, 0.50, 0.75, 1.00, 0.90, 0.65, 0.45, 0.25, 0.12], // Peak at alpha=0
      [0.18, 0.35, 0.55, 0.75, 0.70, 0.50, 0.35, 0.20, 0.10],
      [0.12, 0.25, 0.40, 0.55, 0.50, 0.35, 0.25, 0.15, 0.08],
      [0.08, 0.15, 0.25, 0.35, 0.30, 0.20, 0.15, 0.10, 0.05],
      [0.05, 0.10, 0.15, 0.20, 0.15, 0.10, 0.08, 0.05, 0.03],
    ],
  };

  describe('Alpha Slice Integration', () => {
    it('should extract alpha slice at center frequency', () => {
      const slice = extractAlphaSlice(mockSCFData, 0, false);

      expect(slice.sliceType).toBe('alpha');
      expect(slice.slicePosition).toBe(0);
      expect(slice.axis).toEqual(mockSCFData.tau);
      expect(slice.values).toHaveLength(9);
      expect(Math.max(...slice.values)).toBe(1.00); // Peak value
    });

    it('should extract alpha slice with interpolation between grid points', () => {
      const slice = extractAlphaSlice(mockSCFData, 25, true);

      expect(slice.slicePosition).toBe(25);
      expect(slice.values).toHaveLength(9);
      
      // Values should be interpolated between alpha=0 and alpha=50
      expect(slice.values[3]).toBeGreaterThan(0.75); // Between 1.00 and 0.75
      expect(slice.values[3]).toBeLessThan(1.00);
    });

    it('should handle edge case at minimum alpha', () => {
      const slice = extractAlphaSlice(mockSCFData, -200, true);

      expect(slice.slicePosition).toBe(-200);
      expect(slice.values[0]).toBeCloseTo(0.05, 2);
    });

    it('should handle edge case at maximum alpha', () => {
      const slice = extractAlphaSlice(mockSCFData, 200, true);

      expect(slice.slicePosition).toBe(200);
      expect(slice.values[0]).toBeCloseTo(0.05, 2);
    });
  });

  describe('Tau Slice Integration', () => {
    it('should extract tau slice at peak lag', () => {
      const slice = extractTauSlice(mockSCFData, 30, false);

      expect(slice.sliceType).toBe('tau');
      expect(slice.slicePosition).toBe(30);
      expect(slice.axis).toEqual(mockSCFData.alpha);
      expect(slice.values).toHaveLength(9);
      expect(Math.max(...slice.values)).toBe(1.00); // Peak at alpha=0
    });

    it('should extract tau slice with interpolation', () => {
      const slice = extractTauSlice(mockSCFData, 35, true);

      expect(slice.slicePosition).toBe(35);
      expect(slice.values).toHaveLength(9);
      
      // Values should be interpolated between tau=30 and tau=40
      expect(slice.values[4]).toBeGreaterThan(0.90); // Between 1.00 and 0.90
      expect(slice.values[4]).toBeLessThan(1.00);
    });
  });

  describe('tRPC Procedure Simulation', () => {
    it('should simulate extractCrossSection procedure for alpha slice', () => {
      const input = {
        scfData: mockSCFData,
        sliceType: 'alpha' as const,
        sliceValue: 0,
        interpolate: true,
      };

      const result = extractAlphaSlice(input.scfData, input.sliceValue, input.interpolate);

      expect(result).toMatchObject({
        axis: expect.any(Array),
        values: expect.any(Array),
        slicePosition: 0,
        sliceType: 'alpha',
      });

      expect(result.axis).toHaveLength(9);
      expect(result.values).toHaveLength(9);
    });

    it('should simulate extractCrossSection procedure for tau slice', () => {
      const input = {
        scfData: mockSCFData,
        sliceType: 'tau' as const,
        sliceValue: 30,
        interpolate: true,
      };

      const result = extractTauSlice(input.scfData, input.sliceValue, input.interpolate);

      expect(result).toMatchObject({
        axis: expect.any(Array),
        values: expect.any(Array),
        slicePosition: 30,
        sliceType: 'tau',
      });

      expect(result.axis).toHaveLength(9);
      expect(result.values).toHaveLength(9);
    });
  });

  describe('UI State Management Simulation', () => {
    it('should handle slice type change', () => {
      // Initial alpha slice
      const alphaSlice = extractAlphaSlice(mockSCFData, 0, true);
      expect(alphaSlice.sliceType).toBe('alpha');

      // Switch to tau slice
      const tauSlice = extractTauSlice(mockSCFData, 30, true);
      expect(tauSlice.sliceType).toBe('tau');

      // Verify different axis lengths
      expect(alphaSlice.axis).toEqual(mockSCFData.tau);
      expect(tauSlice.axis).toEqual(mockSCFData.alpha);
    });

    it('should handle slider value changes', () => {
      const sliceValues = [-100, -50, 0, 50, 100];
      const slices = sliceValues.map(value => 
        extractAlphaSlice(mockSCFData, value, true)
      );

      expect(slices).toHaveLength(5);
      slices.forEach((slice, i) => {
        expect(slice.slicePosition).toBe(sliceValues[i]);
        expect(slice.values).toHaveLength(9);
      });
    });

    it('should handle animation sequence', () => {
      const startValue = -200;
      const endValue = 200;
      const steps = 10;
      const stepSize = (endValue - startValue) / (steps - 1);

      const animationFrames = Array.from({ length: steps }, (_, i) => {
        const value = startValue + i * stepSize;
        return extractAlphaSlice(mockSCFData, value, true);
      });

      expect(animationFrames).toHaveLength(steps);
      expect(animationFrames[0].slicePosition).toBeCloseTo(startValue, 0);
      expect(animationFrames[steps - 1].slicePosition).toBeCloseTo(endValue, 0);
    });
  });

  describe('CSV Export Simulation', () => {
    it('should generate CSV data for alpha slice', () => {
      const slice = extractAlphaSlice(mockSCFData, 0, false);
      
      const csvHeader = `Tau,SCF_Magnitude,Alpha=${slice.slicePosition}`;
      const csvRows = slice.axis.map((tau, i) => 
        `${tau},${slice.values[i]}`
      );
      const csv = [csvHeader, ...csvRows].join('\n');

      expect(csv).toContain('Tau,SCF_Magnitude,Alpha=0');
      expect(csv).toContain('30,1');
      expect(csv.split('\n')).toHaveLength(10); // Header + 9 rows
    });

    it('should generate CSV data for tau slice', () => {
      const slice = extractTauSlice(mockSCFData, 30, false);
      
      const csvHeader = `Alpha,SCF_Magnitude,Tau=${slice.slicePosition}`;
      const csvRows = slice.axis.map((alpha, i) => 
        `${alpha},${slice.values[i]}`
      );
      const csv = [csvHeader, ...csvRows].join('\n');

      expect(csv).toContain('Alpha,SCF_Magnitude,Tau=30');
      expect(csv).toContain('0,1');
      expect(csv.split('\n')).toHaveLength(10); // Header + 9 rows
    });
  });

  describe('Peak Detection Integration', () => {
    it('should correctly identify peak in alpha slice', () => {
      const slice = extractAlphaSlice(mockSCFData, 0, false);
      
      let maxValue = -Infinity;
      let maxIndex = 0;
      
      slice.values.forEach((value, i) => {
        if (value > maxValue) {
          maxValue = value;
          maxIndex = i;
        }
      });

      expect(maxValue).toBe(1.00);
      expect(slice.axis[maxIndex]).toBe(30); // Peak at tau=30
    });

    it('should correctly identify peak in tau slice', () => {
      const slice = extractTauSlice(mockSCFData, 30, false);
      
      let maxValue = -Infinity;
      let maxIndex = 0;
      
      slice.values.forEach((value, i) => {
        if (value > maxValue) {
          maxValue = value;
          maxIndex = i;
        }
      });

      expect(maxValue).toBe(1.00);
      expect(slice.axis[maxIndex]).toBe(0); // Peak at alpha=0
    });
  });

  describe('Error Handling', () => {
    it('should handle empty SCF data gracefully', () => {
      const emptyData: SCFData = {
        alpha: [],
        tau: [],
        scf: [],
      };

      expect(() => extractAlphaSlice(emptyData, 0, false)).toThrow('Empty SCF data');
      expect(() => extractTauSlice(emptyData, 0, false)).toThrow('Empty SCF data');
    });

    it('should handle out-of-range slice values', () => {
      const slice1 = extractAlphaSlice(mockSCFData, -1000, true);
      const slice2 = extractAlphaSlice(mockSCFData, 1000, true);

      expect(slice1.slicePosition).toBe(-200); // Clamped to min
      expect(slice2.slicePosition).toBe(200); // Clamped to max
    });
  });
});
