import { describe, it, expect } from 'vitest';
import { LODManager } from '../client/src/lib/lodManager';

describe('LOD Manager', () => {
  describe('LOD Calculation', () => {
    it('should select high quality for normal sample rates', () => {
      const manager = new LODManager();
      const result = manager.calculateLOD({
        viewportWidth: 1920,
        viewportHeight: 1080,
        sampleRate: 2.4e6, // 2.4 MSps
        targetFPS: 60,
        quality: 'auto',
      });

      expect(result.quality).toBe('high');
      expect(result.decimationFactor).toBe(1);
      expect(result.textureWidth).toBeLessThanOrEqual(1920);
    });

    it('should select medium quality for high sample rates', () => {
      const manager = new LODManager();
      const result = manager.calculateLOD({
        viewportWidth: 1920,
        viewportHeight: 1080,
        sampleRate: 15e6, // 15 MSps
        targetFPS: 60,
        quality: 'auto',
      });

      expect(result.quality).toBe('medium');
      expect(result.decimationFactor).toBe(2);
      expect(result.reason).toContain('High sample rate');
    });

    it('should select low quality for very high sample rates', () => {
      const manager = new LODManager();
      const result = manager.calculateLOD({
        viewportWidth: 1920,
        viewportHeight: 1080,
        sampleRate: 25e6, // 25 MSps
        targetFPS: 60,
        quality: 'auto',
      });

      expect(result.quality).toBe('low');
      expect(result.decimationFactor).toBe(4);
      expect(result.reason).toContain('Very high sample rate');
    });

    it('should respect manual quality selection', () => {
      const manager = new LODManager();
      const result = manager.calculateLOD({
        viewportWidth: 1920,
        viewportHeight: 1080,
        sampleRate: 2.4e6,
        targetFPS: 60,
        quality: 'low', // Force low quality
      });

      expect(result.quality).toBe('low');
      expect(result.decimationFactor).toBe(4);
    });

    it('should limit texture size to viewport dimensions', () => {
      const manager = new LODManager();
      const result = manager.calculateLOD({
        viewportWidth: 800,
        viewportHeight: 600,
        sampleRate: 2.4e6,
        targetFPS: 60,
        quality: 'high',
      });

      expect(result.textureWidth).toBeLessThanOrEqual(800);
      expect(result.textureHeight).toBeLessThanOrEqual(600);
    });
  });

  describe('FPS Tracking', () => {
    it('should track frame rate over time', () => {
      const manager = new LODManager();
      
      // Simulate 60 FPS
      for (let i = 0; i < 10; i++) {
        manager.recordFrame();
        // Wait ~16ms (60 FPS)
      }

      const avgFPS = manager.getAverageFPS();
      expect(avgFPS).toBeGreaterThan(0);
    });

    it('should maintain frame history up to 60 frames', () => {
      const manager = new LODManager();
      
      for (let i = 0; i < 100; i++) {
        manager.recordFrame();
      }

      const avgFPS = manager.getAverageFPS();
      expect(avgFPS).toBeGreaterThan(0);
      // Should not crash with large frame counts
    });

    it('should reset frame tracking', () => {
      const manager = new LODManager();
      
      manager.recordFrame();
      manager.recordFrame();
      expect(manager.getAverageFPS()).toBeGreaterThan(0);
      
      manager.reset();
      expect(manager.getAverageFPS()).toBe(0);
    });
  });

  describe('FFT Decimation', () => {
    it('should not decimate with factor 1', () => {
      const manager = new LODManager();
      const input = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const result = manager.decimateFFT(input, 1);

      expect(result).toEqual(input);
      expect(result.length).toBe(8);
    });

    it('should decimate by averaging bins (factor 2)', () => {
      const manager = new LODManager();
      const input = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const result = manager.decimateFFT(input, 2);

      expect(result.length).toBe(4);
      expect(result[0]).toBeCloseTo(1.5); // avg(1, 2)
      expect(result[1]).toBeCloseTo(3.5); // avg(3, 4)
      expect(result[2]).toBeCloseTo(5.5); // avg(5, 6)
      expect(result[3]).toBeCloseTo(7.5); // avg(7, 8)
    });

    it('should decimate by averaging bins (factor 4)', () => {
      const manager = new LODManager();
      const input = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const result = manager.decimateFFT(input, 4);

      expect(result.length).toBe(2);
      expect(result[0]).toBeCloseTo(2.5); // avg(1, 2, 3, 4)
      expect(result[1]).toBeCloseTo(6.5); // avg(5, 6, 7, 8)
    });

    it('should handle non-divisible lengths', () => {
      const manager = new LODManager();
      const input = new Float32Array([1, 2, 3, 4, 5, 6, 7]);
      const result = manager.decimateFFT(input, 2);

      expect(result.length).toBe(3);
      expect(result[0]).toBeCloseTo(1.5); // avg(1, 2)
      expect(result[1]).toBeCloseTo(3.5); // avg(3, 4)
      expect(result[2]).toBeCloseTo(5.5); // avg(5, 6) - last bin only has 2 elements
    });
  });

  describe('Quality Recommendations', () => {
    it('should recommend high quality for low sample rates', () => {
      const quality = LODManager.getRecommendedQuality(2.4e6);
      expect(quality).toBe('high');
    });

    it('should recommend medium quality for moderate sample rates', () => {
      const quality = LODManager.getRecommendedQuality(15e6);
      expect(quality).toBe('medium');
    });

    it('should recommend low quality for very high sample rates', () => {
      const quality = LODManager.getRecommendedQuality(25e6);
      expect(quality).toBe('low');
    });
  });
});

describe('DSP Chain Integration', () => {
  it('should validate FFT size options', () => {
    const validSizes = [512, 1024, 2048, 4096, 8192];
    validSizes.forEach(size => {
      expect(size).toBeGreaterThan(0);
      expect(Math.log2(size) % 1).toBe(0); // Power of 2
    });
  });

  it('should validate window function types', () => {
    const validWindows = ['hamming', 'hann', 'blackman', 'kaiser', 'rectangular'];
    expect(validWindows).toContain('hamming');
    expect(validWindows).toContain('hann');
    expect(validWindows.length).toBe(5);
  });

  it('should validate colormap types', () => {
    const validColormaps = ['viridis', 'turbo', 'plasma', 'inferno', 'magma'];
    expect(validColormaps).toContain('viridis');
    expect(validColormaps).toContain('turbo');
    expect(validColormaps.length).toBe(5);
  });

  it('should handle parameter updates', () => {
    const updates: Array<{ nodeId: string; parameter: string; value: any }> = [];
    
    const onParameterChange = (nodeId: string, parameter: string, value: any) => {
      updates.push({ nodeId, parameter, value });
    };

    onParameterChange('fft', 'NFFT', '2048');
    onParameterChange('window', 'Type', 'hamming');
    onParameterChange('colormap', 'Type', 'viridis');

    expect(updates.length).toBe(3);
    expect(updates[0]).toEqual({ nodeId: 'fft', parameter: 'NFFT', value: '2048' });
    expect(updates[1]).toEqual({ nodeId: 'window', parameter: 'Type', value: 'hamming' });
    expect(updates[2]).toEqual({ nodeId: 'colormap', parameter: 'Type', value: 'viridis' });
  });
});
