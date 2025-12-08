#!/usr/bin/env tsx
/**
 * Inject real IQ capture file into local storage
 */

import fs from 'fs/promises';
import { writeLocalFile } from '../server/localStorage';
import { createSignalCapture } from '../server/db';
import { nanoid } from 'nanoid';

async function main() {
  console.log('🚀 Real Capture Injection Script');
  console.log('==================================\n');

  const sourceFile = '/home/ubuntu/upload/cfx_5mhz_short.iq';
  
  // Read the IQ file
  console.log('📖 Reading IQ file:', sourceFile);
  const dataBuffer = await fs.readFile(sourceFile);
  console.log(`✓ Read ${dataBuffer.length} bytes (${(dataBuffer.length / 1024 / 1024).toFixed(2)} MB)\n`);

  // Calculate samples
  const bytesPerSample = 8; // cf32_le = 2 floats * 4 bytes each
  const numSamples = dataBuffer.length / bytesPerSample;
  const sampleRate = 5000000; // 5 MHz
  const durationMs = (numSamples / sampleRate) * 1000;

  console.log(`Samples: ${numSamples.toLocaleString()}`);
  console.log(`Sample rate: ${(sampleRate / 1e6).toFixed(1)} MHz`);
  console.log(`Duration: ${durationMs.toFixed(1)} ms\n`);

  // Generate SigMF metadata
  const metadata = {
    global: {
      'core:datatype': 'cf32_le',
      'core:sample_rate': sampleRate,
      'core:version': '1.0.0',
      'core:hw': 'Real SDR Capture',
      'core:author': 'User Upload',
      'core:description': 'Real 5 MHz IQ capture for testing',
    },
    captures: [
      {
        'core:sample_start': 0,
        'core:datetime': new Date().toISOString(),
      },
    ],
    annotations: [],
  };

  const metadataJson = JSON.stringify(metadata, null, 2);

  // Write to local storage
  const fileId = nanoid();
  const userId = 1;
  const localMetaPath = `signals/${userId}/${fileId}.sigmf-meta`;
  const localDataPath = `signals/${userId}/${fileId}.sigmf-data`;

  console.log('💾 Writing to local storage...');
  console.log(`   Meta: ${localMetaPath}`);
  console.log(`   Data: ${localDataPath}`);

  await writeLocalFile(localMetaPath, metadataJson);
  await writeLocalFile(localDataPath, dataBuffer);
  console.log('✓ Files written\n');

  // Create database record
  console.log('🗄️  Creating database record...');
  
  const capture = await createSignalCapture({
    userId,
    name: 'Real 5MHz Capture',
    description: 'Real SDR capture for spectrogram testing',
    
    localMetaPath,
    localDataPath,
    
    metaFileKey: null,
    metaFileUrl: null,
    dataFileKey: null,
    dataFileUrl: null,
    s3SyncStatus: 'none',
    
    datatype: 'cf32_le',
    sampleRate,
    hardware: 'Real SDR',
    author: 'User Upload',
    
    sha512: null,
    dataFileSize: dataBuffer.length,
    
    status: 'ready',
  });

  console.log(`✓ Capture created: ID=${capture.id}\n`);

  console.log('✅ Real capture injection complete!');
  console.log('===================================\n');
  console.log(`Capture ID: ${capture.id}`);
  console.log(`File size: ${(dataBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Samples: ${numSamples.toLocaleString()}`);
  console.log(`Duration: ${durationMs.toFixed(1)} ms`);
}

main()
  .then(() => {
    console.log('\n✓ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
