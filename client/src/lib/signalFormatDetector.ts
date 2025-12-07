/**
 * Intelligent Signal Format Detector
 * 
 * Automatically detects signal file format, sample rate, center frequency,
 * and datatype from:
 * 1. File headers (WAV, SigMF, etc.)
 * 2. Filename patterns (e.g., "capture_2.4MHz_915MHz_cf32.iq")
 * 3. File size analysis
 * 4. Statistical signal analysis
 * 
 * Goal: Enable drag-and-drop signal analysis without manual metadata entry
 */

export interface DetectedMetadata {
  format: 'sigmf' | 'wav' | 'iq' | 'raw' | 'unknown';
  datatype: 'cf32_le' | 'ci16_le' | 'ci8' | 'cu8' | 'cu16_le' | 'unknown';
  sampleRate: number | null;
  centerFrequency: number | null;
  hardware: string | null;
  confidence: number; // 0-100
  detectionMethod: string;
  suggestedName: string;
}

export class SignalFormatDetector {
  /**
   * Main detection entry point
   */
  static async detect(file: File): Promise<DetectedMetadata> {
    console.log(`[SignalFormatDetector] Analyzing file: ${file.name} (${file.size} bytes)`);
    
    // Step 1: Check for SigMF format
    if (file.name.endsWith('.sigmf-meta') || file.name.endsWith('.sigmf-data')) {
      return this.detectSigMF(file);
    }
    
    // Step 2: Check for WAV format
    if (file.name.endsWith('.wav')) {
      return await this.detectWAV(file);
    }
    
    // Step 3: Parse filename for metadata
    const filenameMetadata = this.parseFilename(file.name);
    
    // Step 4: Analyze file header
    const headerMetadata = await this.analyzeFileHeader(file);
    
    // Step 5: Merge results with confidence scoring
    return this.mergeMetadata(file, filenameMetadata, headerMetadata);
  }
  
  /**
   * Detect SigMF format
   */
  private static detectSigMF(file: File): DetectedMetadata {
    return {
      format: 'sigmf',
      datatype: 'unknown',
      sampleRate: null,
      centerFrequency: null,
      hardware: null,
      confidence: 100,
      detectionMethod: 'File extension (.sigmf-meta or .sigmf-data)',
      suggestedName: file.name.replace(/\.(sigmf-meta|sigmf-data)$/, ''),
    };
  }
  
  /**
   * Detect WAV format by reading header
   */
  private static async detectWAV(file: File): Promise<DetectedMetadata> {
    try {
      const header = await this.readFileChunk(file, 0, 44); // WAV header is 44 bytes
      const view = new DataView(header);
      
      // Check RIFF header
      const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      if (riff !== 'RIFF') {
        throw new Error('Invalid WAV file: missing RIFF header');
      }
      
      // Check WAVE format
      const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
      if (wave !== 'WAVE') {
        throw new Error('Invalid WAV file: missing WAVE format');
      }
      
      // Extract sample rate (bytes 24-27)
      const sampleRate = view.getUint32(24, true);
      
      // Extract bits per sample (bytes 34-35)
      const bitsPerSample = view.getUint16(34, true);
      
      // Extract number of channels (bytes 22-23)
      const numChannels = view.getUint16(22, true);
      
      // Determine datatype based on bits per sample
      let datatype: DetectedMetadata['datatype'] = 'unknown';
      if (bitsPerSample === 16 && numChannels === 2) {
        datatype = 'ci16_le'; // Complex Int16
      } else if (bitsPerSample === 8 && numChannels === 2) {
        datatype = 'ci8'; // Complex Int8
      } else if (bitsPerSample === 32 && numChannels === 2) {
        datatype = 'cf32_le'; // Complex Float32
      }
      
      return {
        format: 'wav',
        datatype,
        sampleRate,
        centerFrequency: null,
        hardware: null,
        confidence: 95,
        detectionMethod: 'WAV header analysis',
        suggestedName: file.name.replace(/\.wav$/, ''),
      };
    } catch (error) {
      console.error('[SignalFormatDetector] WAV detection failed:', error);
      return {
        format: 'unknown',
        datatype: 'unknown',
        sampleRate: null,
        centerFrequency: null,
        hardware: null,
        confidence: 0,
        detectionMethod: 'WAV detection failed',
        suggestedName: file.name,
      };
    }
  }
  
  /**
   * Parse filename for metadata patterns
   * 
   * Common patterns:
   * - "capture_2.4MHz_915MHz_cf32.iq" → 2.4 MSps, 915 MHz, cf32
   * - "gqrx_20231215_123456_915000000_2400000_fc.raw" → 915 MHz, 2.4 MSps
   * - "hackrf_2024-01-15_10-30-45_433.92MHz.iq" → 433.92 MHz
   * - "rtlsdr_fm_broadcast_100MHz_2.4Msps.bin" → 100 MHz, 2.4 MSps
   */
  private static parseFilename(filename: string): Partial<DetectedMetadata> {
    const result: Partial<DetectedMetadata> = {
      sampleRate: null,
      centerFrequency: null,
      hardware: null,
      datatype: 'unknown',
    };
    
    // Extract sample rate (various formats)
    const sampleRatePatterns = [
      /(\d+\.?\d*)\s*MSps/i,
      /(\d+\.?\d*)\s*MHz.*sps/i,
      /srate[_-](\d+)/i,
      /_(\d{6,})_fc/i, // GQRX format (6+ digits before _fc)
    ];
    
    for (const pattern of sampleRatePatterns) {
      const match = filename.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        if (value < 1000) {
          result.sampleRate = value * 1e6; // Convert MSps to Hz
        } else {
          result.sampleRate = value; // Already in Hz
        }
        break;
      }
    }
    
    // Extract center frequency
    const freqPatterns = [
      /(\d+\.?\d*)\s*MHz(?!.*sps)/i, // MHz but not followed by "sps"
      /(\d+\.?\d*)\s*GHz/i,
      /(\d{8,})/g, // 8+ digit number (likely frequency in Hz)
      /fc[_-](\d+)/i,
    ];
    
    for (const pattern of freqPatterns) {
      const matches = Array.from(filename.matchAll(pattern));
      for (const match of matches) {
        const value = parseFloat(match[1]);
        if (value < 10000) {
          // Likely in MHz or GHz
          if (match[0].toLowerCase().includes('ghz')) {
            result.centerFrequency = value * 1e9;
          } else {
            result.centerFrequency = value * 1e6;
          }
        } else {
          // Likely in Hz
          result.centerFrequency = value;
        }
        break;
      }
      if (result.centerFrequency) break;
    }
    
    // Extract datatype
    const datatypePatterns = [
      { pattern: /cf32|fc32|complex.*float.*32/i, type: 'cf32_le' as const },
      { pattern: /ci16|sc16|complex.*int.*16/i, type: 'ci16_le' as const },
      { pattern: /ci8|sc8|complex.*int.*8/i, type: 'ci8' as const },
      { pattern: /cu8|complex.*uint.*8/i, type: 'cu8' as const },
      { pattern: /cu16|complex.*uint.*16/i, type: 'cu16_le' as const },
    ];
    
    for (const { pattern, type } of datatypePatterns) {
      if (pattern.test(filename)) {
        result.datatype = type;
        break;
      }
    }
    
    // Extract hardware/SDR
    const hardwarePatterns = [
      { pattern: /hackrf/i, name: 'HackRF One' },
      { pattern: /rtl[-_]?sdr|rtl2832/i, name: 'RTL-SDR' },
      { pattern: /usrp/i, name: 'USRP' },
      { pattern: /bladerf/i, name: 'bladeRF' },
      { pattern: /limesdr/i, name: 'LimeSDR' },
      { pattern: /airspy/i, name: 'Airspy' },
      { pattern: /pluto/i, name: 'PlutoSDR' },
      { pattern: /gqrx/i, name: 'GQRX' },
    ];
    
    for (const { pattern, name } of hardwarePatterns) {
      if (pattern.test(filename)) {
        result.hardware = name;
        break;
      }
    }
    
    return result;
  }
  
  /**
   * Analyze file header for magic bytes and metadata
   */
  private static async analyzeFileHeader(file: File): Promise<Partial<DetectedMetadata>> {
    try {
      const header = await this.readFileChunk(file, 0, 1024);
      const view = new DataView(header);
      
      // Check for common file signatures
      const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      
      if (magic === 'RIFF') {
        return { format: 'wav' };
      }
      
      // Check for SigMF JSON header (starts with '{')
      if (view.getUint8(0) === 0x7B) {
        try {
          const text = new TextDecoder().decode(header);
          const json = JSON.parse(text);
          if (json.global && json.captures) {
            return {
              format: 'sigmf',
              sampleRate: json.global?.['core:sample_rate'] || null,
              datatype: this.sigmfDatatypeToInternal(json.global?.['core:datatype']),
            };
          }
        } catch {
          // Not valid JSON
        }
      }
      
      // If no header detected, assume raw IQ
      return {
        format: 'raw',
      };
    } catch (error) {
      console.error('[SignalFormatDetector] Header analysis failed:', error);
      return {};
    }
  }
  
  /**
   * Merge metadata from multiple sources with confidence scoring
   */
  private static mergeMetadata(
    file: File,
    filenameMetadata: Partial<DetectedMetadata>,
    headerMetadata: Partial<DetectedMetadata>
  ): DetectedMetadata {
    // Prioritize header metadata over filename
    const format = headerMetadata.format || filenameMetadata.format || 'unknown';
    const datatype = headerMetadata.datatype || filenameMetadata.datatype || 'cf32_le'; // Default to cf32
    const sampleRate = headerMetadata.sampleRate || filenameMetadata.sampleRate || null;
    const centerFrequency = filenameMetadata.centerFrequency || null; // Usually only in filename
    const hardware = filenameMetadata.hardware || null;
    
    // Calculate confidence
    let confidence = 0;
    let detectionMethod = '';
    
    if (headerMetadata.format) {
      confidence += 50;
      detectionMethod += 'File header, ';
    }
    if (filenameMetadata.sampleRate) {
      confidence += 20;
      detectionMethod += 'Filename sample rate, ';
    }
    if (filenameMetadata.centerFrequency) {
      confidence += 15;
      detectionMethod += 'Filename frequency, ';
    }
    if (filenameMetadata.datatype && filenameMetadata.datatype !== 'unknown') {
      confidence += 10;
      detectionMethod += 'Filename datatype, ';
    }
    if (filenameMetadata.hardware) {
      confidence += 5;
      detectionMethod += 'Filename hardware, ';
    }
    
    // If no metadata found, use heuristics
    if (confidence === 0) {
      confidence = 30;
      detectionMethod = 'Heuristic guess based on file size';
      
      // Guess sample rate from file size
      if (!sampleRate) {
        const guessedSampleRate = this.guessSampleRateFromFileSize(file.size, datatype);
        return {
          format,
          datatype,
          sampleRate: guessedSampleRate,
          centerFrequency,
          hardware,
          confidence,
          detectionMethod,
          suggestedName: file.name.replace(/\.(iq|dat|bin|raw)$/, ''),
        };
      }
    }
    
    detectionMethod = detectionMethod.replace(/, $/, '');
    
    return {
      format,
      datatype,
      sampleRate,
      centerFrequency,
      hardware,
      confidence,
      detectionMethod,
      suggestedName: file.name.replace(/\.(iq|dat|bin|raw|wav)$/, ''),
    };
  }
  
  /**
   * Guess sample rate from file size
   */
  private static guessSampleRateFromFileSize(fileSize: number, datatype: string): number {
    // Calculate bytes per sample
    const bytesPerSample = this.getBytesPerSample(datatype);
    const totalSamples = fileSize / bytesPerSample;
    
    // Common sample rates (in Hz)
    const commonRates = [
      250000,   // 250 kSps
      1000000,  // 1 MSps
      2000000,  // 2 MSps
      2400000,  // 2.4 MSps (common for SDRs)
      10000000, // 10 MSps
      20000000, // 20 MSps
    ];
    
    // Assume 1-10 second capture
    for (const rate of commonRates) {
      const duration = totalSamples / rate;
      if (duration >= 0.5 && duration <= 60) {
        return rate;
      }
    }
    
    // Default to 2.4 MSps if no match
    return 2400000;
  }
  
  /**
   * Get bytes per sample for datatype
   */
  private static getBytesPerSample(datatype: string): number {
    switch (datatype) {
      case 'cf32_le': return 8;  // 2 × float32
      case 'ci16_le': return 4;  // 2 × int16
      case 'cu16_le': return 4;  // 2 × uint16
      case 'ci8': return 2;      // 2 × int8
      case 'cu8': return 2;      // 2 × uint8
      default: return 8;         // Default to cf32
    }
  }
  
  /**
   * Convert SigMF datatype to internal format
   */
  private static sigmfDatatypeToInternal(sigmfType: string | undefined): DetectedMetadata['datatype'] {
    if (!sigmfType) return 'unknown';
    
    const mapping: Record<string, DetectedMetadata['datatype']> = {
      'cf32_le': 'cf32_le',
      'ci16_le': 'ci16_le',
      'ci8': 'ci8',
      'cu8': 'cu8',
      'cu16_le': 'cu16_le',
    };
    
    return mapping[sigmfType] || 'unknown';
  }
  
  /**
   * Read a chunk of file as ArrayBuffer
   */
  private static async readFileChunk(file: File, start: number, length: number): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const blob = file.slice(start, start + length);
      
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as ArrayBuffer'));
        }
      };
      
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }
  
  /**
   * Format frequency for display
   */
  static formatFrequency(hz: number | null): string {
    if (hz === null) return 'Unknown';
    
    if (hz >= 1e9) {
      return `${(hz / 1e9).toFixed(2)} GHz`;
    } else if (hz >= 1e6) {
      return `${(hz / 1e6).toFixed(2)} MHz`;
    } else if (hz >= 1e3) {
      return `${(hz / 1e3).toFixed(2)} kHz`;
    } else {
      return `${hz.toFixed(0)} Hz`;
    }
  }
  
  /**
   * Format sample rate for display
   */
  static formatSampleRate(hz: number | null): string {
    if (hz === null) return 'Unknown';
    
    if (hz >= 1e6) {
      return `${(hz / 1e6).toFixed(2)} MSps`;
    } else if (hz >= 1e3) {
      return `${(hz / 1e3).toFixed(2)} kSps`;
    } else {
      return `${hz.toFixed(0)} Sps`;
    }
  }
}
