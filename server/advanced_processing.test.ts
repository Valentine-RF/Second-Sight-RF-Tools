import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("Advanced Signal Processing", () => {
  describe("Higher-Order Statistics", () => {
    it("calculates 4th and 6th order cumulants", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.advancedProcessing.calculateCumulants({
        captureId: 1,
        orders: [4, 6],
      });

      expect(result).toHaveProperty("cum4");
      expect(result).toHaveProperty("cum6");
      expect(typeof result.cum4).toBe("number");
      expect(typeof result.cum6).toBe("number");
    });

    it("performs bispectrum analysis", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.advancedProcessing.bispectrumAnalysis({
        captureId: 1,
      });

      expect(result).toHaveProperty("phase_coupling");
      expect(result).toHaveProperty("nonlinearity_index");
      expect(result.phase_coupling).toBeGreaterThanOrEqual(0);
      expect(result.phase_coupling).toBeLessThanOrEqual(1);
      expect(result.description).toContain("Bispectrum");
    });
  });

  describe("Wavelet Analysis", () => {
    it("performs wavelet packet decomposition with db4", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.advancedProcessing.waveletDecomposition({
        captureId: 1,
        wavelet: "db4",
        level: 3,
      });

      expect(result).toHaveProperty("wavelet");
      expect(result).toHaveProperty("level");
      expect(result).toHaveProperty("nodes");
      expect(result.wavelet).toBe("db4");
      expect(result.level).toBe(3);
      expect(Array.isArray(result.nodes)).toBe(true);
    });

    it("supports different wavelet families", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const wavelets: Array<'db4' | 'db6' | 'db8' | 'morlet'> = ['db4', 'db6', 'db8', 'morlet'];
      
      for (const wavelet of wavelets) {
        const result = await caller.advancedProcessing.waveletDecomposition({
          captureId: 1,
          wavelet,
          level: 2,
        });

        expect(result.wavelet).toBe(wavelet);
      }
    });
  });

  describe("Time-Frequency Analysis", () => {
    it("computes synchrosqueezing transform", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.advancedProcessing.synchrosqueezingTransform({
        captureId: 1,
        sampleRate: 1e6,
      });

      expect(result).toHaveProperty("frequencies");
      expect(result).toHaveProperty("time");
      expect(result).toHaveProperty("modes");
      expect(Array.isArray(result.frequencies)).toBe(true);
      expect(Array.isArray(result.time)).toBe(true);
      expect(result.description).toContain("Synchrosqueezing");
    });
  });

  describe("RF-DNA Fingerprinting", () => {
    it("extracts AFIT RF-DNA features", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.rfDna.extractFeatures({
        captureId: 1,
        regions: 20,
      });

      expect(result).toHaveProperty("features");
      expect(result).toHaveProperty("feature_count");
      expect(result).toHaveProperty("domains");
      expect(Array.isArray(result.features)).toBe(true);
      expect(result.feature_count).toBeGreaterThan(0);
      expect(result.domains).toHaveProperty("amplitude");
      expect(result.domains).toHaveProperty("phase");
      expect(result.domains).toHaveProperty("frequency");
    });

    it("performs constellation-based DNA analysis", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.rfDna.constellationDna({
        captureId: 1,
        modulation: "QPSK",
      });

      expect(result).toHaveProperty("evm_rms");
      expect(result).toHaveProperty("evm_peak");
      expect(result).toHaveProperty("evm_mean");
      expect(result.modulation).toBe("QPSK");
      expect(result.evm_rms).toBeGreaterThanOrEqual(0);
    });

    it("supports different modulation types", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const modulations: Array<'QPSK' | 'QAM16' | 'QAM64'> = ['QPSK', 'QAM16', 'QAM64'];
      
      for (const modulation of modulations) {
        const result = await caller.rfDna.constellationDna({
          captureId: 1,
          modulation,
        });

        expect(result.modulation).toBe(modulation);
      }
    });
  });

  describe("Protocol Identification", () => {
    it("detects 802.11 preambles", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.rfDna.detectPreamble({
        captureId: 1,
        preambleType: "802.11",
      });

      expect(result).toHaveProperty("detected");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("preamble_type");
      expect(typeof result.detected).toBe("boolean");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.preamble_type).toBe("802.11");
    });

    it("supports multiple protocol types", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const protocols: Array<'802.11' | 'LTE' | '5G_NR'> = ['802.11', 'LTE', '5G_NR'];
      
      for (const preambleType of protocols) {
        const result = await caller.rfDna.detectPreamble({
          captureId: 1,
          preambleType,
        });

        expect(result.preamble_type).toBe(preambleType);
      }
    });
  });

  describe("Anomaly Detection", () => {
    it("detects anomalies using LSTM autoencoder", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.rfDna.detectAnomaly({
        captureId: 1,
        threshold: 0.5,
      });

      expect(result).toHaveProperty("is_anomaly");
      expect(result).toHaveProperty("anomaly_score");
      expect(result).toHaveProperty("threshold");
      expect(typeof result.is_anomaly).toBe("boolean");
      expect(result.anomaly_score).toBeGreaterThanOrEqual(0);
      expect(result.anomaly_score).toBeLessThanOrEqual(1);
      expect(result.threshold).toBe(0.5);
    });

    it("respects custom threshold values", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const thresholds = [0.3, 0.5, 0.7];
      
      for (const threshold of thresholds) {
        const result = await caller.rfDna.detectAnomaly({
          captureId: 1,
          threshold,
        });

        expect(result.threshold).toBe(threshold);
      }
    });
  });

  describe("Device Classification", () => {
    it("classifies devices from RF-DNA features", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Mock feature vector
      const features = Array.from({ length: 180 }, () => Math.random());

      const result = await caller.rfDna.classifyDevice({
        features,
        numDevices: 100,
      });

      expect(result).toHaveProperty("predictions");
      expect(result).toHaveProperty("top_device");
      expect(result).toHaveProperty("top_confidence");
      expect(Array.isArray(result.predictions)).toBe(true);
      expect(result.predictions.length).toBeGreaterThan(0);
      expect(result.top_confidence).toBeGreaterThanOrEqual(0);
      expect(result.top_confidence).toBeLessThanOrEqual(1);
    });
  });
});
