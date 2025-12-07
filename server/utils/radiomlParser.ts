/**
 * RadioML Dataset Parser
 * 
 * Parses RadioML HDF5 datasets (2016.10a, 2018.01a) using h5wasm
 * Extracts IQ samples and modulation labels for training
 */

import { readFile } from 'fs/promises';

// h5wasm types (will be imported at runtime)
type H5File = any;
type H5Dataset = any;

/**
 * RadioML dataset metadata
 */
export interface RadioMLMetadata {
  format: 'radioml2016.10a' | 'radioml2018.01a';
  modulationTypes: string[];
  snrLevels: number[];
  samplesPerModulation: number;
  totalSamples: number;
  iqLength: number;
}

/**
 * Single training sample
 */
export interface RadioMLSample {
  iq: Float32Array; // Interleaved I/Q samples
  modulation: string;
  snr: number;
  index: number;
}

/**
 * Batch of training samples
 */
export interface RadioMLBatch {
  samples: RadioMLSample[];
  metadata: RadioMLMetadata;
}

/**
 * Parse RadioML 2016.10a dataset
 * Format: (modulation, snr) -> [2, iqLength, numSamples]
 */
async function parseRadioML2016(h5File: H5File): Promise<RadioMLBatch> {
  const samples: RadioMLSample[] = [];
  const modulationTypes = new Set<string>();
  const snrLevels = new Set<number>();
  
  let iqLength = 0;
  let sampleIndex = 0;

  // RadioML 2016.10a structure: keys are "(modulation, snr)"
  const keys = h5File.keys();
  
  for (const key of keys) {
    // Parse key format: "(BPSK, 10)"
    const match = key.match(/\(([^,]+),\s*(-?\d+)\)/);
    if (!match) continue;
    
    const modulation = match[1].trim();
    const snr = parseInt(match[2]);
    
    modulationTypes.add(modulation);
    snrLevels.add(snr);
    
    // Read dataset
    const dataset: H5Dataset = h5File.get(key);
    const shape = dataset.shape; // [2, iqLength, numSamples]
    const data = dataset.value; // Float32Array or similar
    
    if (iqLength === 0) {
      iqLength = shape[1];
    }
    
    const numSamples = shape[2];
    
    // Extract each sample
    for (let i = 0; i < numSamples; i++) {
      const iq = new Float32Array(iqLength * 2);
      
      // RadioML format: [2, iqLength, numSamples]
      // data[0, :, i] = I channel
      // data[1, :, i] = Q channel
      for (let j = 0; j < iqLength; j++) {
        iq[j * 2] = data[0 * iqLength * numSamples + j * numSamples + i]; // I
        iq[j * 2 + 1] = data[1 * iqLength * numSamples + j * numSamples + i]; // Q
      }
      
      samples.push({
        iq,
        modulation,
        snr,
        index: sampleIndex++,
      });
    }
  }
  
  return {
    samples,
    metadata: {
      format: 'radioml2016.10a',
      modulationTypes: Array.from(modulationTypes).sort(),
      snrLevels: Array.from(snrLevels).sort((a, b) => a - b),
      samplesPerModulation: samples.length / modulationTypes.size,
      totalSamples: samples.length,
      iqLength,
    },
  };
}

/**
 * Parse RadioML 2018.01a dataset
 * Format: /X -> [numSamples, 2, iqLength], /Y -> [numSamples, 24], /Z -> [numSamples]
 */
async function parseRadioML2018(h5File: H5File): Promise<RadioMLBatch> {
  const samples: RadioMLSample[] = [];
  
  // Read datasets
  const X = h5File.get('X'); // IQ data: [numSamples, 2, iqLength]
  const Y = h5File.get('Y'); // One-hot labels: [numSamples, numClasses]
  const Z = h5File.get('Z'); // SNR values: [numSamples]
  
  const xData = X.value;
  const yData = Y.value;
  const zData = Z.value;
  
  const numSamples = X.shape[0];
  const iqLength = X.shape[2];
  const numClasses = Y.shape[1];
  
  // RadioML 2018.01a modulation types (24 classes)
  const modulationTypes = [
    'OOK', '4ASK', '8ASK', 'BPSK', 'QPSK', '8PSK', '16PSK', '32PSK',
    '16APSK', '32APSK', '64APSK', '128APSK', '16QAM', '32QAM', '64QAM', '128QAM', '256QAM',
    'AM-SSB-WC', 'AM-SSB-SC', 'AM-DSB-WC', 'AM-DSB-SC', 'FM', 'GMSK', 'OQPSK'
  ];
  
  const snrLevels = new Set<number>();
  
  for (let i = 0; i < numSamples; i++) {
    // Extract IQ samples
    const iq = new Float32Array(iqLength * 2);
    for (let j = 0; j < iqLength; j++) {
      iq[j * 2] = xData[i * 2 * iqLength + 0 * iqLength + j]; // I channel
      iq[j * 2 + 1] = xData[i * 2 * iqLength + 1 * iqLength + j]; // Q channel
    }
    
    // Find modulation from one-hot encoding
    let modulationIndex = 0;
    for (let j = 0; j < numClasses; j++) {
      if (yData[i * numClasses + j] === 1) {
        modulationIndex = j;
        break;
      }
    }
    
    const snr = zData[i];
    snrLevels.add(snr);
    
    samples.push({
      iq,
      modulation: modulationTypes[modulationIndex],
      snr,
      index: i,
    });
  }
  
  return {
    samples,
    metadata: {
      format: 'radioml2018.01a',
      modulationTypes,
      snrLevels: Array.from(snrLevels).sort((a, b) => a - b),
      samplesPerModulation: numSamples / numClasses,
      totalSamples: numSamples,
      iqLength,
    },
  };
}

/**
 * Detect RadioML dataset format from HDF5 structure
 */
function detectRadioMLFormat(h5File: H5File): 'radioml2016.10a' | 'radioml2018.01a' | null {
  const keys = h5File.keys();
  
  // RadioML 2018.01a has X, Y, Z datasets
  if (keys.includes('X') && keys.includes('Y') && keys.includes('Z')) {
    return 'radioml2018.01a';
  }
  
  // RadioML 2016.10a has keys like "(BPSK, 10)"
  if (keys.some((k: string) => k.match(/\([^,]+,\s*-?\d+\)/))) {
    return 'radioml2016.10a';
  }
  
  return null;
}

/**
 * Parse RadioML HDF5 file
 * Automatically detects format (2016.10a or 2018.01a)
 */
export async function parseRadioMLDataset(filePath: string): Promise<RadioMLBatch> {
  // Dynamic import of h5wasm (ESM module)
  const h5wasm = await import('h5wasm');
  await h5wasm.ready;
  
  // Read file into buffer
  const buffer = await readFile(filePath);
  
  // Open HDF5 file
  const h5File = new h5wasm.File(buffer.buffer as any, 'r');
  
  try {
    // Detect format
    const format = detectRadioMLFormat(h5File);
    
    if (!format) {
      throw new Error('Unknown RadioML dataset format');
    }
    
    // Parse based on format
    if (format === 'radioml2016.10a') {
      return await parseRadioML2016(h5File);
    } else {
      return await parseRadioML2018(h5File);
    }
  } finally {
    h5File.close();
  }
}

/**
 * Extract a subset of samples for quick validation
 */
export async function parseRadioMLSample(
  filePath: string,
  maxSamples: number = 100
): Promise<RadioMLBatch> {
  const batch = await parseRadioMLDataset(filePath);
  
  return {
    samples: batch.samples.slice(0, maxSamples),
    metadata: {
      ...batch.metadata,
      totalSamples: Math.min(maxSamples, batch.metadata.totalSamples),
    },
  };
}

/**
 * Validate RadioML dataset integrity
 */
export function validateRadioMLBatch(batch: RadioMLBatch): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check metadata
  if (batch.metadata.totalSamples !== batch.samples.length) {
    errors.push(`Sample count mismatch: metadata says ${batch.metadata.totalSamples}, found ${batch.samples.length}`);
  }
  
  if (batch.metadata.modulationTypes.length === 0) {
    errors.push('No modulation types found');
  }
  
  if (batch.metadata.iqLength === 0) {
    errors.push('IQ length is zero');
  }
  
  // Check samples
  for (let i = 0; i < Math.min(10, batch.samples.length); i++) {
    const sample = batch.samples[i];
    
    if (sample.iq.length !== batch.metadata.iqLength * 2) {
      errors.push(`Sample ${i}: IQ length mismatch (expected ${batch.metadata.iqLength * 2}, got ${sample.iq.length})`);
    }
    
    if (!batch.metadata.modulationTypes.includes(sample.modulation)) {
      errors.push(`Sample ${i}: Unknown modulation type "${sample.modulation}"`);
    }
    
    if (!batch.metadata.snrLevels.includes(sample.snr)) {
      errors.push(`Sample ${i}: Unknown SNR level ${sample.snr}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
