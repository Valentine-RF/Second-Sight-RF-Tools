/**
 * RF Fingerprint Database Schema
 * 
 * Stores device fingerprints for identification and matching
 */

import { mysqlTable, int, varchar, text, float, datetime, json, index } from 'drizzle-orm/mysql-core';

export const rfFingerprints = mysqlTable('rf_fingerprints', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id').notNull(),
  
  // Device identification
  deviceId: varchar('device_id', { length: 255 }).notNull(),
  deviceType: varchar('device_type', { length: 100 }).notNull(),
  deviceModel: varchar('device_model', { length: 255 }),
  manufacturer: varchar('manufacturer', { length: 255 }),
  
  // Transient features (AFIT RF-DNA: 180 features)
  amplitudeFeatures: json('amplitude_features').$type<number[]>().notNull(), // 60 features
  phaseFeatures: json('phase_features').$type<number[]>().notNull(), // 60 features
  frequencyFeatures: json('frequency_features').$type<number[]>().notNull(), // 60 features
  
  // Spectral features
  spectralRegrowth: float('spectral_regrowth'),
  adjacentChannelPower: float('adjacent_channel_power'),
  powerSpectralDensity: json('power_spectral_density').$type<number[]>(),
  
  // Constellation-based features (CB-DNA)
  errorVectorMagnitude: float('error_vector_magnitude'),
  phaseError: json('phase_error').$type<number[]>(),
  amplitudeImbalance: float('amplitude_imbalance'),
  quadratureError: float('quadrature_error'),
  
  // Bispectrum features
  radonTransform: json('radon_transform').$type<number[]>(),
  bicoherence: float('bicoherence'),
  
  // Capture metadata
  centerFreq: float('center_freq').notNull(),
  sampleRate: float('sample_rate').notNull(),
  temperature: float('temperature'),
  
  // Source capture reference
  captureId: int('capture_id'),
  annotationId: int('annotation_id'),
  
  // Timestamps
  createdAt: datetime('created_at').notNull(),
  updatedAt: datetime('updated_at'),
  
  // Validation status
  verified: int('verified').default(0), // 0 = unverified, 1 = verified
  confidence: float('confidence'), // Confidence score from extraction
  
  // Notes
  notes: text('notes'),
}, (table) => ({
  deviceIdIdx: index('device_id_idx').on(table.deviceId),
  deviceTypeIdx: index('device_type_idx').on(table.deviceType),
  userIdIdx: index('user_id_idx').on(table.userId),
}));

export const fingerprintMatches = mysqlTable('fingerprint_matches', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id').notNull(),
  
  // Query fingerprint
  queryFingerprintId: int('query_fingerprint_id'),
  queryCaptureId: int('query_capture_id'),
  
  // Matched reference fingerprint
  matchedFingerprintId: int('matched_fingerprint_id').notNull(),
  matchedDeviceId: varchar('matched_device_id', { length: 255 }).notNull(),
  matchedDeviceType: varchar('matched_device_type', { length: 100 }).notNull(),
  
  // Match quality
  confidence: float('confidence').notNull(), // 0-1
  distance: float('distance').notNull(), // Euclidean distance in feature space
  matchedFeatures: json('matched_features').$type<string[]>(), // ['amplitude', 'phase', 'frequency']
  
  // Timestamps
  matchedAt: datetime('matched_at').notNull(),
}, (table) => ({
  queryIdx: index('query_idx').on(table.queryFingerprintId),
  matchedIdx: index('matched_idx').on(table.matchedFingerprintId),
  confidenceIdx: index('confidence_idx').on(table.confidence),
}));
