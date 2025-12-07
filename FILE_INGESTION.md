# File Ingestion Workflow

This document describes the intelligent file ingestion system that enables **drag-and-drop signal analysis** with automatic format detection and metadata extraction.

---

## Overview

The Smart Upload system eliminates manual metadata entry by automatically detecting:

1. **File Format** - SigMF, WAV, Raw IQ, or unknown
2. **Sample Rate** - Extracted from filename patterns or file headers
3. **Center Frequency** - Parsed from filename (e.g., "915MHz", "2.4GHz")
4. **Datatype** - cf32_le, ci16_le, ci8, cu8, cu16_le
5. **Hardware/SDR** - HackRF, RTL-SDR, USRP, bladeRF, LimeSDR, etc.

**Goal:** Drop any signal file and start analyzing immediately—no forms, no manual entry.

---

## Supported File Formats

### 1. SigMF (Signal Metadata Format)

**Extensions:** `.sigmf-meta`, `.sigmf-data`

**Detection Method:** File extension

**Metadata Extraction:**
- Sample rate from `global.core:sample_rate`
- Datatype from `global.core:datatype`
- Center frequency from `captures[0].core:frequency`

**Confidence:** 100% (complete metadata in header)

**Example:**
```json
{
  "global": {
    "core:sample_rate": 2400000,
    "core:datatype": "cf32_le",
    "core:version": "1.0.0"
  },
  "captures": [
    {
      "core:sample_start": 0,
      "core:frequency": 915000000
    }
  ]
}
```

### 2. WAV (Waveform Audio File Format)

**Extensions:** `.wav`

**Detection Method:** RIFF/WAVE header

**Metadata Extraction:**
- Sample rate from header bytes 24-27
- Bits per sample from header bytes 34-35
- Number of channels from header bytes 22-23
- Datatype inferred from bits per sample:
  - 16-bit, 2 channels → `ci16_le`
  - 8-bit, 2 channels → `ci8`
  - 32-bit, 2 channels → `cf32_le`

**Confidence:** 95% (sample rate accurate, no frequency info)

**WAV Header Structure:**
```
Bytes 0-3:   "RIFF"
Bytes 8-11:  "WAVE"
Bytes 24-27: Sample rate (little-endian uint32)
Bytes 22-23: Number of channels (little-endian uint16)
Bytes 34-35: Bits per sample (little-endian uint16)
```

### 3. Raw IQ Files

**Extensions:** `.iq`, `.dat`, `.bin`, `.raw`

**Detection Method:** Filename parsing + file size analysis

**Metadata Extraction:**
- Sample rate from filename patterns (see below)
- Center frequency from filename patterns
- Datatype from filename patterns
- Hardware from filename patterns
- Sample rate guess from file size if not in filename

**Confidence:** 30-80% (depends on filename descriptiveness)

---

## Filename Pattern Recognition

The system recognizes common filename patterns used by SDR software and users.

### Sample Rate Patterns

| Pattern | Example | Extracted Value |
|---------|---------|----------------|
| `X.XMSps` | `capture_2.4MSps.iq` | 2.4 MHz → 2,400,000 Hz |
| `XMHz_sps` | `signal_10MHz_sps.dat` | 10 MHz → 10,000,000 Hz |
| `srate_X` | `test_srate_2400000.bin` | 2,400,000 Hz |
| `_XXXXXX_fc` | `gqrx_..._2400000_fc.raw` | 2,400,000 Hz (GQRX format) |

### Center Frequency Patterns

| Pattern | Example | Extracted Value |
|---------|---------|----------------|
| `XXXMHz` | `capture_915MHz.iq` | 915 MHz → 915,000,000 Hz |
| `X.XXMHz` | `signal_433.92MHz.dat` | 433.92 MHz → 433,920,000 Hz |
| `X.XGHz` | `test_2.4GHz.bin` | 2.4 GHz → 2,400,000,000 Hz |
| `XXXXXXXXX` | `capture_915000000.iq` | 915,000,000 Hz (9 digits) |
| `fc_XXXXXX` | `signal_fc_915000000.dat` | 915,000,000 Hz |

### Datatype Patterns

| Pattern | Example | Detected Type |
|---------|---------|--------------|
| `cf32`, `fc32` | `capture_cf32.iq` | `cf32_le` (Complex Float32) |
| `ci16`, `sc16` | `signal_ci16.dat` | `ci16_le` (Complex Int16) |
| `ci8`, `sc8` | `test_ci8.bin` | `ci8` (Complex Int8) |
| `cu8` | `capture_cu8.iq` | `cu8` (Complex Uint8) |
| `cu16` | `signal_cu16.dat` | `cu16_le` (Complex Uint16) |

### Hardware Patterns

| Pattern | Example | Detected Hardware |
|---------|---------|------------------|
| `hackrf` | `hackrf_capture.iq` | HackRF One |
| `rtlsdr`, `rtl-sdr` | `rtlsdr_signal.dat` | RTL-SDR |
| `usrp` | `usrp_test.bin` | USRP |
| `bladerf` | `bladerf_capture.iq` | bladeRF |
| `limesdr` | `limesdr_signal.dat` | LimeSDR |
| `airspy` | `airspy_test.bin` | Airspy |
| `pluto` | `pluto_capture.iq` | PlutoSDR |
| `gqrx` | `gqrx_20231215_...` | GQRX |

---

## Example Filenames

### High Confidence (80%+)

```
HackRF_FM_Broadcast_100MHz_2.4MSps_cf32.iq
→ Hardware: HackRF One
→ Frequency: 100 MHz
→ Sample Rate: 2.4 MSps
→ Datatype: cf32_le
→ Confidence: 100%
```

```
gqrx_20231215_123456_915000000_2400000_fc.raw
→ Hardware: GQRX
→ Frequency: 915 MHz
→ Sample Rate: 2.4 MSps
→ Datatype: cf32_le (default)
→ Confidence: 85%
```

```
rtlsdr_fm_broadcast_100MHz_2.4Msps.bin
→ Hardware: RTL-SDR
→ Frequency: 100 MHz
→ Sample Rate: 2.4 MSps
→ Datatype: cf32_le (default)
→ Confidence: 80%
```

### Medium Confidence (50-80%)

```
capture_915MHz_2.4MSps.iq
→ Frequency: 915 MHz
→ Sample Rate: 2.4 MSps
→ Datatype: cf32_le (default)
→ Confidence: 65%
```

```
signal_2.4MSps_ci16.dat
→ Sample Rate: 2.4 MSps
→ Datatype: ci16_le
→ Confidence: 60%
```

### Low Confidence (<50%)

```
capture.bin
→ No metadata in filename
→ Sample rate guessed from file size
→ Datatype: cf32_le (default)
→ Confidence: 30%
```

---

## File Size Heuristics

When no sample rate is found in the filename or header, the system estimates it from file size.

### Algorithm

1. Calculate total samples: `fileSize / bytesPerSample`
2. Assume capture duration: 0.5-60 seconds
3. Try common sample rates: 250 kSps, 1 MSps, 2.4 MSps, 10 MSps, 20 MSps
4. Select rate where duration falls in range

### Bytes Per Sample

| Datatype | Bytes Per Sample | Calculation |
|----------|-----------------|-------------|
| `cf32_le` | 8 | 2 × float32 (4 bytes each) |
| `ci16_le` | 4 | 2 × int16 (2 bytes each) |
| `cu16_le` | 4 | 2 × uint16 (2 bytes each) |
| `ci8` | 2 | 2 × int8 (1 byte each) |
| `cu8` | 2 | 2 × uint8 (1 byte each) |

### Example

**File:** `capture.bin` (19.2 MB, cf32_le)

```
Total samples = 19,200,000 bytes / 8 bytes = 2,400,000 samples

Try 2.4 MSps:
Duration = 2,400,000 samples / 2,400,000 Sps = 1 second ✓

Estimated sample rate: 2.4 MSps
```

---

## Confidence Scoring

The system calculates a confidence score (0-100%) based on detected metadata sources.

### Scoring Breakdown

| Source | Points | Description |
|--------|--------|-------------|
| File header detected | +50 | WAV/SigMF header found |
| Filename sample rate | +20 | Sample rate in filename |
| Filename frequency | +15 | Center frequency in filename |
| Filename datatype | +10 | Datatype in filename |
| Filename hardware | +5 | Hardware/SDR in filename |
| **Maximum** | **100** | All metadata detected |

### Confidence Levels

- **High (80-100%)** - Green indicator, auto-upload recommended
- **Medium (50-79%)** - Yellow indicator, verify fields before upload
- **Low (0-49%)** - Red indicator, manual entry required

---

## User Interface

### Smart Upload Component

The `SmartFileUpload` component provides:

1. **Drag-and-Drop Zone** - Drop any signal file to start analysis
2. **Auto-Detection Progress** - "Analyzing file..." with spinner
3. **Confidence Indicator** - Color-coded badge (green/yellow/red)
4. **Editable Fields** - All auto-detected values can be edited
5. **Required Field Warnings** - Yellow border if sample rate missing
6. **One-Click Upload** - "Upload and Analyze" button

### Upload Modes

The File Manager supports three upload modes:

1. **Smart Upload (Auto-Detect)** - Recommended, uses intelligent detection
2. **SigMF Upload** - Manual selection of .sigmf-meta and .sigmf-data files
3. **Raw IQ Upload** - Manual entry of all metadata fields

---

## Usage Examples

### Example 1: HackRF Capture

**File:** `hackrf_qpsk_915MHz_2.4MSps_cf32.iq` (48 MB)

**Auto-Detected:**
- ✅ Hardware: HackRF One
- ✅ Frequency: 915 MHz
- ✅ Sample Rate: 2.4 MSps
- ✅ Datatype: cf32_le
- ✅ Confidence: 100%

**User Action:** Click "Upload and Analyze" (no edits needed)

### Example 2: GQRX Recording

**File:** `gqrx_20231215_143022_433920000_2400000_fc.raw` (24 MB)

**Auto-Detected:**
- ✅ Hardware: GQRX
- ✅ Frequency: 433.92 MHz
- ✅ Sample Rate: 2.4 MSps
- ⚠️ Datatype: cf32_le (default, verify if different)
- ✅ Confidence: 85%

**User Action:** Verify datatype, then upload

### Example 3: Generic Capture

**File:** `capture.bin` (10 MB)

**Auto-Detected:**
- ❌ Hardware: Unknown
- ❌ Frequency: Unknown
- ⚠️ Sample Rate: 1.25 MSps (guessed from file size)
- ⚠️ Datatype: cf32_le (default)
- ❌ Confidence: 30%

**User Action:** Manually enter sample rate and frequency, then upload

---

## Implementation Details

### SignalFormatDetector Class

**File:** `client/src/lib/signalFormatDetector.ts`

**Key Methods:**
- `detect(file: File): Promise<DetectedMetadata>` - Main detection entry point
- `detectSigMF(file: File)` - SigMF format detection
- `detectWAV(file: File)` - WAV header parsing
- `parseFilename(filename: string)` - Filename pattern matching
- `analyzeFileHeader(file: File)` - Magic byte detection
- `mergeMetadata(...)` - Confidence scoring and merging

**Detection Flow:**
```
File → Check extension → Parse filename → Read header → Merge results → Return metadata
```

### SmartFileUpload Component

**File:** `client/src/components/SmartFileUpload.tsx`

**Features:**
- Drag-and-drop file selection
- Automatic format detection on file drop
- Editable metadata fields
- Confidence indicator with color coding
- Upload progress tracking
- Error handling with toast notifications

**Props:**
```typescript
interface SmartFileUploadProps {
  onUpload: (file: File, metadata: DetectedMetadata) => Promise<void>;
  isUploading?: boolean;
}
```

---

## Testing

### Unit Tests

**File:** `server/signalFormatDetector.test.ts`

**Test Coverage:**
- ✅ Sample rate detection (MSps, GQRX format)
- ✅ Center frequency detection (MHz, GHz, Hz)
- ✅ Datatype detection (cf32, ci16, ci8, cu8, cu16)
- ✅ Hardware detection (HackRF, RTL-SDR, USRP, etc.)
- ✅ File size analysis (bytes per sample, duration estimation)
- ✅ Confidence scoring (high/medium/low)
- ✅ Format utilities (frequency/sample rate formatting)
- ✅ Complex filename patterns (GQRX, descriptive)

**Run tests:**
```bash
pnpm test signalFormatDetector.test.ts
```

**Results:** 19/19 tests passing ✅

---

## Future Enhancements

### 1. Multi-File Batch Upload

Upload multiple signal files at once with parallel processing:
- Drag-and-drop folder of captures
- Auto-detect metadata for each file
- Batch progress indicator
- Parallel S3 uploads

### 2. Signal Preview During Upload

Show real-time spectrogram preview while uploading:
- Stream first 1 MB of file
- Compute FFT and render preview
- Validate signal quality before full upload
- Detect modulation type automatically

### 3. Advanced Format Support

Add support for more signal file formats:
- **GNU Radio Meta Files** (.meta + .bin)
- **MATLAB .mat Files** (with I/Q data)
- **HDF5 Signal Files** (hierarchical data format)
- **CSV/Text IQ Files** (comma-separated I/Q values)

### 4. Cloud Format Conversion

Convert between formats server-side:
- Upload any format, auto-convert to SigMF
- Preserve all metadata during conversion
- Generate compliant SigMF archives
- Support export to other formats (WAV, MATLAB, etc.)

### 5. Metadata Enrichment

Enhance auto-detected metadata with external sources:
- **FCC Database** - Lookup frequency allocations
- **RadioReference** - Identify known services
- **Signal Hound API** - Validate hardware specs
- **User Database** - Learn from previous uploads

---

## Troubleshooting

### Issue: Low Confidence Detection

**Symptoms:** Confidence < 50%, many fields unknown

**Solutions:**
1. Rename file with descriptive pattern (e.g., `hackrf_915MHz_2.4MSps.iq`)
2. Use SigMF format for guaranteed metadata
3. Manually enter missing fields before upload

### Issue: Incorrect Sample Rate

**Symptoms:** Auto-detected sample rate doesn't match actual

**Solutions:**
1. Check filename for typos (e.g., "2.4MSps" not "24MSps")
2. Verify file size matches expected duration
3. Manually correct sample rate in editable field

### Issue: Wrong Datatype Detected

**Symptoms:** Spectrogram looks noisy or incorrect

**Solutions:**
1. Check filename for datatype indicator
2. Verify bits per sample in WAV header
3. Manually select correct datatype from dropdown

---

## Best Practices

### For Users

1. **Use descriptive filenames** - Include sample rate, frequency, and hardware
2. **Prefer SigMF format** - Guarantees accurate metadata
3. **Verify auto-detected fields** - Always check before uploading
4. **Keep consistent naming** - Use same pattern for all captures

### For Developers

1. **Add new patterns incrementally** - Test each pattern thoroughly
2. **Prioritize header metadata** - More reliable than filename parsing
3. **Provide clear confidence feedback** - Help users understand detection quality
4. **Make all fields editable** - Never block user from correcting mistakes

---

## References

- [SigMF Specification](https://github.com/gnuradio/SigMF)
- [WAV File Format](http://soundfile.sapp.org/doc/WaveFormat/)
- [GQRX File Naming](https://gqrx.dk/)
- [GNU Radio File Formats](https://wiki.gnuradio.org/index.php/File_Formats)

---

## Contact

For questions or issues related to file ingestion, please open an issue on GitHub or contact the development team.
