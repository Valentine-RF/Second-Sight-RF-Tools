#!/usr/bin/env tsx
/**
 * Inject test QPSK signal data directly into local storage
 * Bypasses upload form to test spectrogram rendering
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { writeLocalFile } from '../server/localStorage';
import { createSignalCapture } from '../server/db';
import { nanoid } from 'nanoid';

async function main() {
  console.log('🚀 Test Data Injection Script');
  console.log('================================\n');

  // Step 1: Generate test data if it doesn't exist
  const testDataPath = '/home/ubuntu/test-qpsk.sigmf-data';
  
  try {
    await fs.access(testDataPath);
    console.log('✓ Test data file found:', testDataPath);
  } catch {
    console.log('⚙️  Generating test QPSK signal...');
    execSync('python3 /home/ubuntu/generate-test-iq.py', { stdio: 'inherit' });
    console.log('✓ Test data generated\n');
  }

  // Step 2: Read test data
  console.log('📖 Reading test data file...');
  const dataBuffer = await fs.readFile(testDataPath);
  console.log(`✓ Read ${dataBuffer.length} bytes (${(dataBuffer.length / 1024).toFixed(1)} KB)\n`);

  // Step 3: Generate SigMF metadata
  const metadata = {
    global: {
      'core:datatype': 'cf32_le',
      'core:sample_rate': 2400000,
      'core:version': '1.0.0',
      'core:hw': 'Synthetic Generator (Python)',
      'core:author': 'Test Script',
      'core:description': 'Synthetic QPSK signal for testing spectrogram rendering',
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
  console.log('✓ Generated SigMF metadata\n');

  // Step 4: Write to local storage
  const fileId = nanoid();
  const userId = 1; // Test user ID
  const localMetaPath = `signals/${userId}/${fileId}.sigmf-meta`;
  const localDataPath = `signals/${userId}/${fileId}.sigmf-data`;

  console.log('💾 Writing to local storage...');
  console.log(`   Meta: ${localMetaPath}`);
  console.log(`   Data: ${localDataPath}`);

  await writeLocalFile(localMetaPath, metadataJson);
  await writeLocalFile(localDataPath, dataBuffer);
  console.log('✓ Files written to local storage\n');

  // Step 5: Create database record
  console.log('🗄️  Creating database record...');
  
  const capture = await createSignalCapture({
    userId,
    name: 'Test QPSK Signal',
    description: 'Synthetic QPSK for testing spectrogram (500 kHz carrier, 100 kHz symbols, SNR 15 dB)',
    
    // Local storage (primary)
    localMetaPath,
    localDataPath,
    
    // S3 storage (optional - not used)
    metaFileKey: null,
    metaFileUrl: null,
    dataFileKey: null,
    dataFileUrl: null,
    s3SyncStatus: 'none',
    
    // Signal metadata
    datatype: 'cf32_le',
    sampleRate: 2400000,
    hardware: 'Synthetic Generator',
    author: 'Test Script',
    
    // File info
    sha512: null,
    dataFileSize: dataBuffer.length,
    
    // Status
    status: 'ready',
  });

  console.log(`✓ Capture created: ID=${capture.id}\n`);

  // Step 6: Success message
  console.log('✅ Test data injection complete!');
  console.log('================================\n');
  console.log('Next steps:');
  console.log('1. Open http://localhost:3000/files');
  console.log('2. Find "Test QPSK Signal" in the list');
  console.log('3. Click "Analyze" button');
  console.log('4. Verify spectrogram shows signal pattern\n');
  console.log(`Capture ID: ${capture.id}`);
  console.log(`Local path: ${localDataPath}`);
  console.log(`File size: ${(dataBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`Sample rate: 2.4 MHz`);
  console.log(`Samples: ${dataBuffer.length / 8} complex samples`);
}

main()
  .then(() => {
    console.log('\n✓ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
