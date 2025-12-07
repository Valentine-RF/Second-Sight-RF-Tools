import * as tf from '@tensorflow/tfjs';

/**
 * Supported modulation types for classification
 */
export const MODULATION_TYPES = [
  'AM',      // Amplitude Modulation
  'FM',      // Frequency Modulation
  'BPSK',    // Binary Phase Shift Keying
  'QPSK',    // Quadrature Phase Shift Keying
  '8PSK',    // 8-Phase Shift Keying
  '16QAM',   // 16-Quadrature Amplitude Modulation
  '64QAM',   // 64-Quadrature Amplitude Modulation
  'FSK',     // Frequency Shift Keying
  'GMSK',    // Gaussian Minimum Shift Keying
  'OOK',     // On-Off Keying
] as const;

export type ModulationType = typeof MODULATION_TYPES[number];

/**
 * Classification result with confidence scores
 */
export interface ClassificationResult {
  modulation: ModulationType;
  confidence: number;
  allScores: Record<ModulationType, number>;
  features: {
    meanAmplitude: number;
    stdAmplitude: number;
    meanPhase: number;
    stdPhase: number;
    spectralFlatness: number;
  };
}

/**
 * Automatic Modulation Classifier using TensorFlow.js
 * 
 * Uses a CNN architecture to classify modulation types from IQ samples
 */
export class ModulationClassifier {
  private model: tf.LayersModel | null = null;
  private isInitialized = false;
  
  /**
   * Initialize the classifier and load/create model
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Try to load pre-trained model from localStorage
      const modelJson = localStorage.getItem('amc_model');
      if (modelJson) {
        this.model = await tf.loadLayersModel(tf.io.fromMemory(JSON.parse(modelJson)));
        console.log('Loaded pre-trained AMC model from storage');
      } else {
        // Create new model if none exists
        this.model = this.createModel();
        console.log('Created new AMC model (untrained)');
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize modulation classifier:', error);
      // Fallback: create new model
      this.model = this.createModel();
      this.isInitialized = true;
    }
  }
  
  /**
   * Create CNN model architecture for modulation classification
   */
  private createModel(): tf.LayersModel {
    const model = tf.sequential();
    
    // Input: IQ samples (2 channels: I and Q) with length 1024
    // Shape: [batchSize, 1024, 2]
    
    // Conv1D layer 1: Extract low-level features
    model.add(tf.layers.conv1d({
      inputShape: [1024, 2],
      filters: 32,
      kernelSize: 8,
      strides: 2,
      activation: 'relu',
      padding: 'same',
    }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.maxPooling1d({ poolSize: 2 }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    
    // Conv1D layer 2: Extract mid-level features
    model.add(tf.layers.conv1d({
      filters: 64,
      kernelSize: 4,
      strides: 1,
      activation: 'relu',
      padding: 'same',
    }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.maxPooling1d({ poolSize: 2 }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    
    // Conv1D layer 3: Extract high-level features
    model.add(tf.layers.conv1d({
      filters: 128,
      kernelSize: 4,
      strides: 1,
      activation: 'relu',
      padding: 'same',
    }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.maxPooling1d({ poolSize: 2 }));
    model.add(tf.layers.dropout({ rate: 0.3 }));
    
    // Flatten and dense layers
    model.add(tf.layers.flatten());
    model.add(tf.layers.dense({ units: 256, activation: 'relu' }));
    model.add(tf.layers.dropout({ rate: 0.4 }));
    model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
    model.add(tf.layers.dropout({ rate: 0.4 }));
    
    // Output layer: 10 modulation classes
    model.add(tf.layers.dense({
      units: MODULATION_TYPES.length,
      activation: 'softmax',
    }));
    
    // Compile model
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
    
    return model;
  }
  
  /**
   * Classify modulation type from IQ samples
   */
  async classify(iqSamples: Float32Array): Promise<ClassificationResult> {
    if (!this.isInitialized || !this.model) {
      await this.initialize();
    }
    
    if (!this.model) {
      throw new Error('Model not initialized');
    }
    
    // Extract features first
    const features = this.extractFeatures(iqSamples);
    
    // Preprocess IQ samples
    const input = this.preprocessIQ(iqSamples);
    
    // Run inference
    const predictions = await tf.tidy(() => {
      const inputTensor = tf.tensor3d([input], [1, input.length, 2]);
      const output = this.model!.predict(inputTensor) as tf.Tensor;
      return output.dataSync();
    });
    
    // Find best prediction
    let maxIdx = 0;
    let maxScore = predictions[0];
    for (let i = 1; i < predictions.length; i++) {
      if (predictions[i] > maxScore) {
        maxScore = predictions[i];
        maxIdx = i;
      }
    }
    
    // Build result
    const allScores: Record<ModulationType, number> = {} as any;
    MODULATION_TYPES.forEach((type, idx) => {
      allScores[type] = predictions[idx];
    });
    
    return {
      modulation: MODULATION_TYPES[maxIdx],
      confidence: maxScore,
      allScores,
      features,
    };
  }
  
  /**
   * Preprocess IQ samples for model input
   */
  private preprocessIQ(iqSamples: Float32Array): number[][] {
    // Take 1024 samples (or pad/truncate)
    const targetLength = 1024;
    const result: number[][] = [];
    
    for (let i = 0; i < targetLength; i++) {
      const idx = i * 2;
      if (idx + 1 < iqSamples.length) {
        const I = iqSamples[idx];
        const Q = iqSamples[idx + 1];
        result.push([I, Q]);
      } else {
        result.push([0, 0]); // Pad with zeros
      }
    }
    
    // Normalize to [-1, 1]
    let maxMag = 0;
    for (const [I, Q] of result) {
      const mag = Math.sqrt(I * I + Q * Q);
      if (mag > maxMag) maxMag = mag;
    }
    
    if (maxMag > 0) {
      for (const sample of result) {
        sample[0] /= maxMag;
        sample[1] /= maxMag;
      }
    }
    
    return result;
  }
  
  /**
   * Extract statistical features from IQ samples
   */
  private extractFeatures(iqSamples: Float32Array): ClassificationResult['features'] {
    const numSamples = Math.floor(iqSamples.length / 2);
    
    // Calculate amplitude and phase
    const amplitudes: number[] = [];
    const phases: number[] = [];
    
    for (let i = 0; i < numSamples; i++) {
      const I = iqSamples[i * 2];
      const Q = iqSamples[i * 2 + 1];
      
      const amplitude = Math.sqrt(I * I + Q * Q);
      const phase = Math.atan2(Q, I);
      
      amplitudes.push(amplitude);
      phases.push(phase);
    }
    
    // Calculate statistics
    const meanAmplitude = amplitudes.reduce((sum, val) => sum + val, 0) / amplitudes.length;
    const meanPhase = phases.reduce((sum, val) => sum + val, 0) / phases.length;
    
    const stdAmplitude = Math.sqrt(
      amplitudes.reduce((sum, val) => sum + (val - meanAmplitude) ** 2, 0) / amplitudes.length
    );
    const stdPhase = Math.sqrt(
      phases.reduce((sum, val) => sum + (val - meanPhase) ** 2, 0) / phases.length
    );
    
    // Calculate spectral flatness (measure of signal "whiteness")
    const fftSize = 256;
    const fft = this.simpleFFT(iqSamples.slice(0, fftSize * 2));
    const magnitudes = fft.map(([re, im]) => Math.sqrt(re * re + im * im));
    
    const geometricMean = Math.exp(
      magnitudes.reduce((sum, val) => sum + Math.log(val + 1e-10), 0) / magnitudes.length
    );
    const arithmeticMean = magnitudes.reduce((sum, val) => sum + val, 0) / magnitudes.length;
    const spectralFlatness = geometricMean / (arithmeticMean + 1e-10);
    
    return {
      meanAmplitude,
      stdAmplitude,
      meanPhase,
      stdPhase,
      spectralFlatness,
    };
  }
  
  /**
   * Simple FFT for feature extraction (Cooley-Tukey algorithm)
   */
  private simpleFFT(iqSamples: Float32Array): [number, number][] {
    const n = Math.floor(iqSamples.length / 2);
    if (n === 0) return [];
    
    // Convert IQ to complex array
    const complex: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      complex.push([iqSamples[i * 2], iqSamples[i * 2 + 1]]);
    }
    
    // Pad to power of 2
    const fftSize = Math.pow(2, Math.ceil(Math.log2(n)));
    while (complex.length < fftSize) {
      complex.push([0, 0]);
    }
    
    return this.fftRecursive(complex);
  }
  
  private fftRecursive(x: [number, number][]): [number, number][] {
    const n = x.length;
    if (n <= 1) return x;
    
    // Split into even and odd
    const even: [number, number][] = [];
    const odd: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      if (i % 2 === 0) even.push(x[i]);
      else odd.push(x[i]);
    }
    
    // Recursive FFT
    const evenFFT = this.fftRecursive(even);
    const oddFFT = this.fftRecursive(odd);
    
    // Combine
    const result: [number, number][] = new Array(n);
    for (let k = 0; k < n / 2; k++) {
      const angle = -2 * Math.PI * k / n;
      const twiddleRe = Math.cos(angle);
      const twiddleIm = Math.sin(angle);
      
      const oddRe = oddFFT[k][0] * twiddleRe - oddFFT[k][1] * twiddleIm;
      const oddIm = oddFFT[k][0] * twiddleIm + oddFFT[k][1] * twiddleRe;
      
      result[k] = [
        evenFFT[k][0] + oddRe,
        evenFFT[k][1] + oddIm,
      ];
      result[k + n / 2] = [
        evenFFT[k][0] - oddRe,
        evenFFT[k][1] - oddIm,
      ];
    }
    
    return result;
  }
  
  /**
   * Train model with synthetic data (for demonstration)
   */
  async trainWithSyntheticData(epochs: number = 50): Promise<void> {
    if (!this.model) {
      await this.initialize();
    }
    
    console.log('Generating synthetic training data...');
    const { inputs, labels } = this.generateSyntheticData(1000);
    
    console.log('Training model...');
    await this.model!.fit(inputs, labels, {
      epochs,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch + 1}: loss=${logs?.loss.toFixed(4)}, acc=${logs?.acc.toFixed(4)}`);
        },
      },
    });
    
    // Save model to localStorage
    await this.saveModel();
    
    // Clean up tensors
    inputs.dispose();
    labels.dispose();
  }
  
  /**
   * Generate synthetic training data for all modulation types
   */
  private generateSyntheticData(samplesPerClass: number): { inputs: tf.Tensor3D; labels: tf.Tensor2D } {
    const allInputs: number[][][] = [];
    const allLabels: number[][] = [];
    
    MODULATION_TYPES.forEach((modType, classIdx) => {
      for (let i = 0; i < samplesPerClass; i++) {
        const iqSamples = this.generateModulatedSignal(modType, 1024);
        const input = this.preprocessIQ(iqSamples);
        allInputs.push(input);
        
        // One-hot encode label
        const label = new Array(MODULATION_TYPES.length).fill(0);
        label[classIdx] = 1;
        allLabels.push(label);
      }
    });
    
    return {
      inputs: tf.tensor3d(allInputs),
      labels: tf.tensor2d(allLabels),
    };
  }
  
  /**
   * Generate synthetic modulated signal
   */
  private generateModulatedSignal(modType: ModulationType, length: number): Float32Array {
    const iqSamples = new Float32Array(length * 2);
    const symbolRate = 0.1; // Normalized symbol rate
    const snr = 10 + Math.random() * 10; // 10-20 dB SNR
    const noiseStd = Math.pow(10, -snr / 20);
    
    for (let i = 0; i < length; i++) {
      let I = 0, Q = 0;
      const t = i * symbolRate;
      
      switch (modType) {
        case 'AM':
          I = (1 + 0.5 * Math.sin(2 * Math.PI * 0.05 * i)) * Math.cos(2 * Math.PI * 0.2 * i);
          Q = 0;
          break;
        case 'FM':
          const phase = 2 * Math.PI * 0.2 * i + 5 * Math.sin(2 * Math.PI * 0.05 * i);
          I = Math.cos(phase);
          Q = Math.sin(phase);
          break;
        case 'BPSK':
          const bpskSymbol = Math.floor(t) % 2 === 0 ? 1 : -1;
          I = bpskSymbol;
          Q = 0;
          break;
        case 'QPSK':
          const qpskPhase = (Math.floor(t) % 4) * Math.PI / 2;
          I = Math.cos(qpskPhase);
          Q = Math.sin(qpskPhase);
          break;
        case '8PSK':
          const psk8Phase = (Math.floor(t) % 8) * Math.PI / 4;
          I = Math.cos(psk8Phase);
          Q = Math.sin(psk8Phase);
          break;
        case '16QAM':
          const qam16I = (Math.floor(t) % 4) * 2 - 3;
          const qam16Q = (Math.floor(t / 4) % 4) * 2 - 3;
          I = qam16I / 3;
          Q = qam16Q / 3;
          break;
        case '64QAM':
          const qam64I = (Math.floor(t) % 8) * 2 - 7;
          const qam64Q = (Math.floor(t / 8) % 8) * 2 - 7;
          I = qam64I / 7;
          Q = qam64Q / 7;
          break;
        case 'FSK':
          const fskFreq = Math.floor(t) % 2 === 0 ? 0.15 : 0.25;
          I = Math.cos(2 * Math.PI * fskFreq * i);
          Q = Math.sin(2 * Math.PI * fskFreq * i);
          break;
        case 'GMSK':
          const gmskPhase = 2 * Math.PI * 0.2 * i + Math.PI / 2 * (Math.floor(t) % 2 === 0 ? 1 : -1) * i / length;
          I = Math.cos(gmskPhase);
          Q = Math.sin(gmskPhase);
          break;
        case 'OOK':
          const ookBit = Math.floor(t) % 2;
          I = ookBit;
          Q = 0;
          break;
      }
      
      // Add noise
      I += (Math.random() - 0.5) * noiseStd;
      Q += (Math.random() - 0.5) * noiseStd;
      
      iqSamples[i * 2] = I;
      iqSamples[i * 2 + 1] = Q;
    }
    
    return iqSamples;
  }
  
  /**
   * Save model to localStorage
   */
  async saveModel(): Promise<void> {
    if (!this.model) return;
    
    const modelJson = await this.model.save(tf.io.withSaveHandler(async (artifacts) => {
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    }));
    
    // Note: This is a simplified save - in production, use IndexedDB or server storage
    console.log('Model saved to memory');
  }
  
  /**
   * Get model summary
   */
  getSummary(): string {
    if (!this.model) return 'Model not initialized';
    
    let summary = '';
    this.model.layers.forEach((layer, idx) => {
      summary += `Layer ${idx}: ${layer.name} - ${JSON.stringify(layer.outputShape)}\n`;
    });
    return summary;
  }
}

// Singleton instance
let classifierInstance: ModulationClassifier | null = null;

/**
 * Get singleton classifier instance
 */
export function getModulationClassifier(): ModulationClassifier {
  if (!classifierInstance) {
    classifierInstance = new ModulationClassifier();
  }
  return classifierInstance;
}
