/**
 * Metadata Learning Database
 * 
 * Tracks user corrections to auto-detected metadata and improves
 * detection accuracy over time using local storage patterns.
 * 
 * Features:
 * - Record filename patterns → correct metadata mappings
 * - Track correction frequency for confidence boosting
 * - Pattern matching for similar filenames
 * - Privacy-first (all data stored locally)
 * - Export/import learning data
 */

export interface MetadataPattern {
  id: string;
  filenamePattern: string; // Regex pattern extracted from filename
  metadata: {
    sampleRate?: number;
    centerFrequency?: number;
    datatype?: string;
    hardware?: string;
  };
  confidence: number; // 0-100, increases with successful matches
  matchCount: number; // Number of times this pattern was used
  lastUsed: number; // Timestamp
  createdAt: number; // Timestamp
}

export interface CorrectionRecord {
  id: string;
  filename: string;
  autoDetected: {
    sampleRate?: number;
    centerFrequency?: number;
    datatype?: string;
    hardware?: string;
  };
  userCorrected: {
    sampleRate?: number;
    centerFrequency?: number;
    datatype?: string;
    hardware?: string;
  };
  timestamp: number;
}

export interface LearningStats {
  totalPatterns: number;
  totalCorrections: number;
  avgConfidence: number;
  mostUsedPatterns: MetadataPattern[];
  recentCorrections: CorrectionRecord[];
}

export class MetadataLearningDB {
  private static readonly STORAGE_KEY_PATTERNS = 'signal_metadata_patterns';
  private static readonly STORAGE_KEY_CORRECTIONS = 'signal_metadata_corrections';
  private static readonly MAX_PATTERNS = 1000;
  private static readonly MAX_CORRECTIONS = 500;
  private static readonly CONFIDENCE_BOOST_PER_MATCH = 5;
  private static readonly INITIAL_CONFIDENCE = 60;
  
  /**
   * Record a user correction
   */
  static recordCorrection(
    filename: string,
    autoDetected: CorrectionRecord['autoDetected'],
    userCorrected: CorrectionRecord['userCorrected']
  ): void {
    console.log('[MetadataLearningDB] Recording correction:', filename);
    
    const correction: CorrectionRecord = {
      id: this.generateId(),
      filename,
      autoDetected,
      userCorrected,
      timestamp: Date.now(),
    };
    
    // Save correction
    const corrections = this.getCorrections();
    corrections.unshift(correction);
    
    // Limit size
    if (corrections.length > this.MAX_CORRECTIONS) {
      corrections.splice(this.MAX_CORRECTIONS);
    }
    
    this.saveCorrections(corrections);
    
    // Extract pattern and update/create pattern entry
    this.learnFromCorrection(filename, userCorrected);
  }
  
  /**
   * Learn pattern from correction
   */
  private static learnFromCorrection(
    filename: string,
    metadata: CorrectionRecord['userCorrected']
  ): void {
    const pattern = this.extractPattern(filename);
    const patterns = this.getPatterns();
    
    // Check if pattern already exists
    const existingIndex = patterns.findIndex(p => p.filenamePattern === pattern);
    
    if (existingIndex >= 0) {
      // Update existing pattern
      const existing = patterns[existingIndex];
      existing.matchCount++;
      existing.confidence = Math.min(
        100,
        existing.confidence + this.CONFIDENCE_BOOST_PER_MATCH
      );
      existing.lastUsed = Date.now();
      
      // Merge metadata (prefer user-corrected values)
      existing.metadata = {
        ...existing.metadata,
        ...metadata,
      };
      
      patterns[existingIndex] = existing;
    } else {
      // Create new pattern
      const newPattern: MetadataPattern = {
        id: this.generateId(),
        filenamePattern: pattern,
        metadata,
        confidence: this.INITIAL_CONFIDENCE,
        matchCount: 1,
        lastUsed: Date.now(),
        createdAt: Date.now(),
      };
      
      patterns.unshift(newPattern);
    }
    
    // Limit size
    if (patterns.length > this.MAX_PATTERNS) {
      // Remove least used patterns
      patterns.sort((a, b) => b.matchCount - a.matchCount);
      patterns.splice(this.MAX_PATTERNS);
    }
    
    this.savePatterns(patterns);
  }
  
  /**
   * Extract pattern from filename
   * 
   * Converts specific values to wildcards:
   * - Numbers → \d+
   * - Dates → \d{8}
   * - Timestamps → \d{6}
   */
  private static extractPattern(filename: string): string {
    let pattern = filename;
    
    // Replace dates (YYYYMMDD)
    pattern = pattern.replace(/\d{8}/g, '\\d{8}');
    
    // Replace timestamps (HHMMSS)
    pattern = pattern.replace(/\d{6}/g, '\\d{6}');
    
    // Replace frequencies (8-10 digit numbers)
    pattern = pattern.replace(/\d{8,10}/g, '\\d{8,10}');
    
    // Replace sample rates (6-7 digit numbers)
    pattern = pattern.replace(/\d{6,7}/g, '\\d{6,7}');
    
    // Replace other numbers
    pattern = pattern.replace(/\d+/g, '\\d+');
    
    // Escape special regex characters
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    return pattern;
  }
  
  /**
   * Find matching pattern for filename
   */
  static findMatchingPattern(filename: string): MetadataPattern | null {
    const patterns = this.getPatterns();
    
    // Sort by confidence (highest first)
    patterns.sort((a, b) => b.confidence - a.confidence);
    
    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern.filenamePattern);
        if (regex.test(filename)) {
          console.log('[MetadataLearningDB] Found matching pattern:', pattern.filenamePattern);
          
          // Update usage stats
          pattern.matchCount++;
          pattern.lastUsed = Date.now();
          this.savePatterns(patterns);
          
          return pattern;
        }
      } catch (error) {
        console.error('[MetadataLearningDB] Invalid regex pattern:', pattern.filenamePattern);
      }
    }
    
    return null;
  }
  
  /**
   * Boost confidence for detected metadata using learned patterns
   */
  static boostConfidence(
    filename: string,
    detectedMetadata: {
      sampleRate?: number;
      centerFrequency?: number;
      datatype?: string;
      hardware?: string;
      confidence: number;
    }
  ): {
    metadata: typeof detectedMetadata;
    boosted: boolean;
    learnedPattern: MetadataPattern | null;
  } {
    const matchedPattern = this.findMatchingPattern(filename);
    
    if (!matchedPattern) {
      return {
        metadata: detectedMetadata,
        boosted: false,
        learnedPattern: null,
      };
    }
    
    // Merge learned metadata with detected metadata
    const mergedMetadata = {
      ...detectedMetadata,
      sampleRate: detectedMetadata.sampleRate || matchedPattern.metadata.sampleRate,
      centerFrequency: detectedMetadata.centerFrequency || matchedPattern.metadata.centerFrequency,
      datatype: detectedMetadata.datatype || matchedPattern.metadata.datatype,
      hardware: detectedMetadata.hardware || matchedPattern.metadata.hardware,
    };
    
    // Boost confidence based on pattern confidence
    const confidenceBoost = Math.floor(matchedPattern.confidence * 0.2); // Up to +20
    mergedMetadata.confidence = Math.min(100, detectedMetadata.confidence + confidenceBoost);
    
    console.log('[MetadataLearningDB] Confidence boosted:', {
      original: detectedMetadata.confidence,
      boosted: mergedMetadata.confidence,
      boost: confidenceBoost,
    });
    
    return {
      metadata: mergedMetadata,
      boosted: true,
      learnedPattern: matchedPattern,
    };
  }
  
  /**
   * Get learning statistics
   */
  static getStats(): LearningStats {
    const patterns = this.getPatterns();
    const corrections = this.getCorrections();
    
    const avgConfidence =
      patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
        : 0;
    
    const mostUsedPatterns = [...patterns]
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 10);
    
    const recentCorrections = corrections.slice(0, 10);
    
    return {
      totalPatterns: patterns.length,
      totalCorrections: corrections.length,
      avgConfidence,
      mostUsedPatterns,
      recentCorrections,
    };
  }
  
  /**
   * Clear all learning data
   */
  static clearAll(): void {
    localStorage.removeItem(this.STORAGE_KEY_PATTERNS);
    localStorage.removeItem(this.STORAGE_KEY_CORRECTIONS);
    console.log('[MetadataLearningDB] All learning data cleared');
  }
  
  /**
   * Export learning data as JSON
   */
  static exportData(): string {
    const data = {
      patterns: this.getPatterns(),
      corrections: this.getCorrections(),
      exportedAt: Date.now(),
    };
    return JSON.stringify(data, null, 2);
  }
  
  /**
   * Import learning data from JSON
   */
  static importData(jsonData: string): void {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.patterns && Array.isArray(data.patterns)) {
        this.savePatterns(data.patterns);
      }
      
      if (data.corrections && Array.isArray(data.corrections)) {
        this.saveCorrections(data.corrections);
      }
      
      console.log('[MetadataLearningDB] Data imported successfully');
    } catch (error) {
      console.error('[MetadataLearningDB] Failed to import data:', error);
      throw new Error('Invalid import data format');
    }
  }
  
  /**
   * Get all patterns from localStorage
   */
  private static getPatterns(): MetadataPattern[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_PATTERNS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[MetadataLearningDB] Failed to load patterns:', error);
      return [];
    }
  }
  
  /**
   * Save patterns to localStorage
   */
  private static savePatterns(patterns: MetadataPattern[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_PATTERNS, JSON.stringify(patterns));
    } catch (error) {
      console.error('[MetadataLearningDB] Failed to save patterns:', error);
    }
  }
  
  /**
   * Get all corrections from localStorage
   */
  private static getCorrections(): CorrectionRecord[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_CORRECTIONS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[MetadataLearningDB] Failed to load corrections:', error);
      return [];
    }
  }
  
  /**
   * Save corrections to localStorage
   */
  private static saveCorrections(corrections: CorrectionRecord[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_CORRECTIONS, JSON.stringify(corrections));
    } catch (error) {
      console.error('[MetadataLearningDB] Failed to save corrections:', error);
    }
  }
  
  /**
   * Generate unique ID
   */
  private static generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
