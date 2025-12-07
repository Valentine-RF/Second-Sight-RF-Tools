/**
 * LOD (Level of Detail) Manager for Spectrogram Rendering
 * 
 * Dynamically adjusts texture resolution based on:
 * - Viewport size
 * - Sample rate
 * - Target frame rate (60 FPS)
 * - Available GPU memory
 */

export type LODQuality = 'high' | 'medium' | 'low' | 'auto';

export interface LODConfig {
  viewportWidth: number;
  viewportHeight: number;
  sampleRate: number;
  targetFPS: number;
  quality: LODQuality;
}

export interface LODResult {
  textureWidth: number;
  textureHeight: number;
  decimationFactor: number;
  quality: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Performance thresholds for LOD decisions
 */
const THRESHOLDS = {
  HIGH_SAMPLE_RATE: 10e6, // 10 MSps
  VERY_HIGH_SAMPLE_RATE: 20e6, // 20 MSps
  MAX_TEXTURE_SIZE: 4096,
  MIN_TEXTURE_SIZE: 512,
  TARGET_FPS: 60,
  LOW_FPS_THRESHOLD: 30,
};

/**
 * Quality presets for texture resolution
 */
const QUALITY_PRESETS = {
  high: {
    maxTextureSize: 4096,
    decimationFactor: 1,
    description: 'Full resolution, no decimation',
  },
  medium: {
    maxTextureSize: 2048,
    decimationFactor: 2,
    description: '50% resolution, 2x decimation',
  },
  low: {
    maxTextureSize: 1024,
    decimationFactor: 4,
    description: '25% resolution, 4x decimation',
  },
};

export class LODManager {
  private frameRateHistory: number[] = [];
  private lastFrameTime: number = performance.now();
  private frameCount: number = 0;

  /**
   * Calculate optimal LOD settings based on current conditions
   */
  calculateLOD(config: LODConfig): LODResult {
    const { viewportWidth, viewportHeight, sampleRate, quality } = config;

    // Auto quality: decide based on sample rate and viewport
    if (quality === 'auto') {
      return this.autoSelectLOD(config);
    }

    // Manual quality selection
    const preset = QUALITY_PRESETS[quality];
    const textureWidth = Math.min(viewportWidth, preset.maxTextureSize);
    const textureHeight = Math.min(viewportHeight, preset.maxTextureSize);

    return {
      textureWidth,
      textureHeight,
      decimationFactor: preset.decimationFactor,
      quality,
      reason: `Manual quality: ${preset.description}`,
    };
  }

  /**
   * Automatically select LOD based on performance metrics
   */
  private autoSelectLOD(config: LODConfig): LODResult {
    const { viewportWidth, viewportHeight, sampleRate } = config;
    const avgFPS = this.getAverageFPS();

    // High sample rate detection
    if (sampleRate > THRESHOLDS.VERY_HIGH_SAMPLE_RATE) {
      return {
        textureWidth: Math.min(viewportWidth, QUALITY_PRESETS.low.maxTextureSize),
        textureHeight: Math.min(viewportHeight, QUALITY_PRESETS.low.maxTextureSize),
        decimationFactor: 4,
        quality: 'low',
        reason: `Very high sample rate (${(sampleRate / 1e6).toFixed(1)} MSps) - using low quality`,
      };
    }

    if (sampleRate > THRESHOLDS.HIGH_SAMPLE_RATE) {
      return {
        textureWidth: Math.min(viewportWidth, QUALITY_PRESETS.medium.maxTextureSize),
        textureHeight: Math.min(viewportHeight, QUALITY_PRESETS.medium.maxTextureSize),
        decimationFactor: 2,
        quality: 'medium',
        reason: `High sample rate (${(sampleRate / 1e6).toFixed(1)} MSps) - using medium quality`,
      };
    }

    // Frame rate detection
    if (avgFPS > 0 && avgFPS < THRESHOLDS.LOW_FPS_THRESHOLD) {
      return {
        textureWidth: Math.min(viewportWidth, QUALITY_PRESETS.medium.maxTextureSize),
        textureHeight: Math.min(viewportHeight, QUALITY_PRESETS.medium.maxTextureSize),
        decimationFactor: 2,
        quality: 'medium',
        reason: `Low frame rate (${avgFPS.toFixed(1)} FPS) - reducing quality`,
      };
    }

    // Default: high quality
    return {
      textureWidth: Math.min(viewportWidth, QUALITY_PRESETS.high.maxTextureSize),
      textureHeight: Math.min(viewportHeight, QUALITY_PRESETS.high.maxTextureSize),
      decimationFactor: 1,
      quality: 'high',
      reason: 'Normal conditions - using high quality',
    };
  }

  /**
   * Record frame render time for FPS tracking
   */
  recordFrame(): void {
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    if (deltaTime > 0) {
      const fps = 1000 / deltaTime;
      this.frameRateHistory.push(fps);

      // Keep only last 60 frames (1 second at 60 FPS)
      if (this.frameRateHistory.length > 60) {
        this.frameRateHistory.shift();
      }
    }

    this.frameCount++;
  }

  /**
   * Get average FPS from recent frames
   */
  getAverageFPS(): number {
    if (this.frameRateHistory.length === 0) return 0;
    const sum = this.frameRateHistory.reduce((a, b) => a + b, 0);
    return sum / this.frameRateHistory.length;
  }

  /**
   * Get current FPS (instantaneous)
   */
  getCurrentFPS(): number {
    if (this.frameRateHistory.length === 0) return 0;
    return this.frameRateHistory[this.frameRateHistory.length - 1];
  }

  /**
   * Reset frame rate tracking
   */
  reset(): void {
    this.frameRateHistory = [];
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
  }

  /**
   * Decimate FFT data by averaging bins
   */
  decimateFFT(fftData: Float32Array, decimationFactor: number): Float32Array {
    if (decimationFactor === 1) return fftData;

    const outputLength = Math.floor(fftData.length / decimationFactor);
    const decimated = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      let sum = 0;
      const startIdx = i * decimationFactor;
      const endIdx = Math.min(startIdx + decimationFactor, fftData.length);

      for (let j = startIdx; j < endIdx; j++) {
        sum += fftData[j];
      }

      decimated[i] = sum / (endIdx - startIdx);
    }

    return decimated;
  }

  /**
   * Check if GPU supports required texture size
   */
  static checkTextureSupport(gl: WebGLRenderingContext, width: number, height: number): boolean {
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    return width <= maxSize && height <= maxSize;
  }

  /**
   * Get recommended quality for given sample rate
   */
  static getRecommendedQuality(sampleRate: number): LODQuality {
    if (sampleRate > THRESHOLDS.VERY_HIGH_SAMPLE_RATE) return 'low';
    if (sampleRate > THRESHOLDS.HIGH_SAMPLE_RATE) return 'medium';
    return 'high';
  }
}
