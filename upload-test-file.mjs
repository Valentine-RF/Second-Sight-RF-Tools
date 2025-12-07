#!/usr/bin/env node
/**
 * Script to programmatically upload test SigMF files to Second Sight
 * This bypasses the browser file picker for testing purposes
 */

import { readFileSync } from 'fs';
import { storagePut } from './server/storage.js';
import { createSignalCapture } from './server/db.js';
import { parseSigMFMetadata } from './server/sigmf.js';
import { nanoid } from 'nanoid';

async function uploadTestFile() {
  try {
    console.log('📡 Starting test file upload...\n');

    // Read metadata file
    const metadataPath = '/home/ubuntu/upload/cfx_5mhz_short.sigmf-meta';
    const metadataContent = readFileSync(metadataPath, 'utf-8');
    console.log('✅ Read metadata file');

    // Parse and validate metadata
    const metadata = parseSigMFMetadata(metadataContent);
    console.log('✅ Validated SigMF metadata');
    console.log(`   Sample Rate: ${metadata.global['core:sample_rate']} Hz`);
    console.log(`   Datatype: ${metadata.global['core:datatype']}`);
    console.log(`   Hardware: ${metadata.global['core:hw']}`);

    // Read data file
    const dataPath = '/home/ubuntu/upload/cfx_5mhz_short.sigmf-data';
    const dataContent = readFileSync(dataPath);
    console.log(`✅ Read data file (${(dataContent.length / 1024 / 1024).toFixed(2)} MB)\n`);

    // Generate unique file keys
    const userId = 'test-user'; // For testing, use a test user ID
    const fileId = nanoid();
    const metaFileKey = `${userId}/signals/${fileId}.sigmf-meta`;
    const dataFileKey = `${userId}/signals/${fileId}.sigmf-data`;

    console.log('☁️  Uploading to S3...');

    // Upload metadata to S3
    const metaResult = await storagePut(
      metaFileKey,
      metadataContent,
      'application/json'
    );
    console.log(`✅ Metadata uploaded: ${metaResult.url}`);

    // Upload data to S3
    const dataResult = await storagePut(
      dataFileKey,
      dataContent,
      'application/octet-stream'
    );
    console.log(`✅ Data file uploaded: ${dataResult.url}\n`);

    // Create database record
    console.log('💾 Creating database record...');
    const capture = await createSignalCapture({
      userId: userId,
      name: '5MHz_Test_Capture',
      description: 'Test capture for validating real-time IQ data pipeline',
      metaFileKey,
      metaFileUrl: metaResult.url,
      dataFileKey,
      dataFileUrl: dataResult.url,
      datatype: metadata.global['core:datatype'],
      sampleRate: metadata.global['core:sample_rate'],
      hardware: metadata.global['core:hw'] || null,
      author: metadata.global['core:author'] || null,
      sha512: metadata.global['core:sha512'] || null,
      dataFileSize: dataContent.length,
      status: 'ready',
    });

    console.log('✅ Database record created');
    console.log(`   Capture ID: ${capture.id}`);
    console.log(`   Name: ${capture.name}`);
    console.log(`   Status: ${capture.status}\n`);

    console.log('🎉 Upload complete! You can now view this capture in the File Manager.');
    console.log(`   Direct link: https://3000-igrg4j35vhrna4nlj6plf-6a218242.manusvm.computer/cockpit/${capture.id}`);

  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

uploadTestFile();
