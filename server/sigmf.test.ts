import { describe, expect, it } from "vitest";
import {
  parseSigMFMetadata,
  calculateSHA512,
  verifySHA512,
  getSampleSize,
  validateDataFileSize,
  annotationToSigMF,
  generateSigMFMetadata,
} from "./sigmf";

describe("SigMF Parser", () => {
  describe("parseSigMFMetadata", () => {
    it("parses valid SigMF metadata", () => {
      const validMetadata = JSON.stringify({
        global: {
          "core:datatype": "cf32_le",
          "core:sample_rate": 2400000,
          "core:version": "1.0.0",
          "core:hw": "HackRF One",
          "core:author": "Test User",
        },
        captures: [],
        annotations: [],
      });

      const result = parseSigMFMetadata(validMetadata);

      expect(result.global["core:datatype"]).toBe("cf32_le");
      expect(result.global["core:sample_rate"]).toBe(2400000);
      expect(result.global["core:hw"]).toBe("HackRF One");
      expect(result.captures).toEqual([]);
      expect(result.annotations).toEqual([]);
    });

    it("validates required fields", () => {
      const invalidMetadata = JSON.stringify({
        global: {
          "core:datatype": "cf32_le",
          // Missing core:sample_rate
        },
      });

      expect(() => parseSigMFMetadata(invalidMetadata)).toThrow("SigMF validation failed");
    });

    it("rejects invalid JSON", () => {
      const invalidJson = "{ not valid json }";

      expect(() => parseSigMFMetadata(invalidJson)).toThrow("Failed to parse SigMF metadata");
    });

    it("parses metadata with annotations", () => {
      const metadataWithAnnotations = JSON.stringify({
        global: {
          "core:datatype": "ci16_le",
          "core:sample_rate": 1000000,
        },
        annotations: [
          {
            "core:sample_start": 0,
            "core:sample_count": 1000,
            "core:freq_lower_edge": 2400000000,
            "core:freq_upper_edge": 2410000000,
            "core:label": "QPSK Signal",
            "signal:modulation": "QPSK",
            "signal:snr": 12.5,
          },
        ],
      });

      const result = parseSigMFMetadata(metadataWithAnnotations);

      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]?.["core:label"]).toBe("QPSK Signal");
      expect(result.annotations[0]?.["signal:modulation"]).toBe("QPSK");
      expect(result.annotations[0]?.["signal:snr"]).toBe(12.5);
    });
  });

  describe("SHA512 Integrity", () => {
    it("calculates SHA512 hash correctly", () => {
      const testData = Buffer.from("Hello, World!");
      const hash = calculateSHA512(testData);

      expect(hash).toBe(
        "374d794a95cdcfd8b35993185fef9ba368f160d8daf432d08ba9f1ed1e5abe6cc69291e0fa2fe0006a52570ef18c19def4e617c33ce52ef0a6e5fbe318cb0387"
      );
    });

    it("verifies matching hashes", () => {
      const testData = Buffer.from("Test data");
      const hash = calculateSHA512(testData);

      expect(verifySHA512(testData, hash)).toBe(true);
    });

    it("rejects non-matching hashes", () => {
      const testData = Buffer.from("Test data");
      const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000";

      expect(verifySHA512(testData, wrongHash)).toBe(false);
    });

    it("handles case-insensitive hash comparison", () => {
      const testData = Buffer.from("Test");
      const hash = calculateSHA512(testData);
      const upperHash = hash.toUpperCase();

      expect(verifySHA512(testData, upperHash)).toBe(true);
    });
  });

  describe("getSampleSize", () => {
    it("returns correct size for cf32_le", () => {
      expect(getSampleSize("cf32_le")).toBe(8);
    });

    it("returns correct size for ci16_le", () => {
      expect(getSampleSize("ci16_le")).toBe(4);
    });

    it("returns correct size for ci8", () => {
      expect(getSampleSize("ci8")).toBe(2);
    });

    it("returns correct size for rf32_le", () => {
      expect(getSampleSize("rf32_le")).toBe(4);
    });

    it("throws error for unknown datatype", () => {
      expect(() => getSampleSize("unknown_type")).toThrow("Unknown SigMF datatype");
    });
  });

  describe("validateDataFileSize", () => {
    it("validates correct file size", () => {
      const result = validateDataFileSize(8000, "cf32_le");

      expect(result.valid).toBe(true);
      expect(result.sampleCount).toBe(1000);
    });

    it("rejects file size not multiple of sample size", () => {
      const result = validateDataFileSize(8001, "cf32_le");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not a multiple of sample size");
    });

    it("validates expected sample count", () => {
      const result = validateDataFileSize(8000, "cf32_le", 1000);

      expect(result.valid).toBe(true);
      expect(result.sampleCount).toBe(1000);
    });

    it("rejects incorrect sample count", () => {
      const result = validateDataFileSize(8000, "cf32_le", 500);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Expected 500 samples but file contains 1000");
    });
  });

  describe("annotationToSigMF", () => {
    it("converts database annotation to SigMF format", () => {
      const dbAnnotation = {
        sampleStart: 1000,
        sampleCount: 500,
        freqLowerEdge: 2400000000,
        freqUpperEdge: 2410000000,
        label: "Test Signal",
        modulationType: "QPSK",
        confidence: 0.95,
        estimatedSNR: 15.2,
        estimatedCFO: -1500,
        estimatedBaud: 2400000,
      };

      const result = annotationToSigMF(dbAnnotation);

      expect(result["core:sample_start"]).toBe(1000);
      expect(result["core:sample_count"]).toBe(500);
      expect(result["core:freq_lower_edge"]).toBe(2400000000);
      expect(result["core:freq_upper_edge"]).toBe(2410000000);
      expect(result["core:label"]).toBe("Test Signal");
      expect(result["signal:modulation"]).toBe("QPSK");
      expect(result["signal:confidence"]).toBe(0.95);
      expect(result["signal:snr"]).toBe(15.2);
      expect(result["signal:cfo"]).toBe(-1500);
      expect(result["signal:baud"]).toBe(2400000);
    });

    it("omits null fields", () => {
      const dbAnnotation = {
        sampleStart: 1000,
        sampleCount: 500,
        freqLowerEdge: null,
        freqUpperEdge: null,
        label: null,
        modulationType: null,
        confidence: null,
        estimatedSNR: null,
        estimatedCFO: null,
        estimatedBaud: null,
      };

      const result = annotationToSigMF(dbAnnotation);

      expect(result["core:sample_start"]).toBe(1000);
      expect(result["core:sample_count"]).toBe(500);
      expect(result["core:freq_lower_edge"]).toBeUndefined();
      expect(result["signal:modulation"]).toBeUndefined();
    });
  });

  describe("generateSigMFMetadata", () => {
    it("generates complete SigMF metadata JSON", () => {
      const global = {
        "core:datatype": "cf32_le",
        "core:sample_rate": 2400000,
        "core:hw": "Test Hardware",
        "core:author": "Test User",
      };

      const captures = [
        {
          "core:sample_start": 0,
          "core:frequency": 2450000000,
        },
      ];

      const annotations = [
        {
          "core:sample_start": 1000,
          "core:sample_count": 500,
          "core:label": "Test",
        },
      ];

      const result = generateSigMFMetadata(global, captures, annotations);
      const parsed = JSON.parse(result);

      expect(parsed.global["core:datatype"]).toBe("cf32_le");
      expect(parsed.global["core:sample_rate"]).toBe(2400000);
      expect(parsed.captures).toHaveLength(1);
      expect(parsed.annotations).toHaveLength(1);
      expect(parsed.annotations[0]["core:label"]).toBe("Test");
    });

    it("generates valid JSON that can be parsed back", () => {
      const global = {
        "core:datatype": "ci16_le",
        "core:sample_rate": 1000000,
      };

      const result = generateSigMFMetadata(global, [], []);

      // Should not throw
      expect(() => parseSigMFMetadata(result)).not.toThrow();
    });
  });
});
