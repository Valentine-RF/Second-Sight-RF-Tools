import { describe, expect, it, beforeAll } from "vitest";
import {
  createSignalCapture,
  getUserSignalCaptures,
  getSignalCaptureById,
  updateSignalCaptureStatus,
  createAnnotation,
  getCaptureAnnotations,
  updateAnnotation,
  createProcessingJob,
  getProcessingJobById,
  updateProcessingJob,
  createChatMessage,
  getChatHistory,
} from "./db";

describe("Database Operations", () => {
  const testUserId = 1;
  let testCaptureId: number;
  let testAnnotationId: number;
  let testJobId: number;

  describe("Signal Captures", () => {
    it("creates a signal capture", async () => {
      const capture = await createSignalCapture({
        userId: testUserId,
        name: "Test Capture",
        description: "Test description",
        metaFileKey: "test/meta.sigmf-meta",
        metaFileUrl: "https://example.com/meta.sigmf-meta",
        dataFileKey: "test/data.sigmf-data",
        dataFileUrl: "https://example.com/data.sigmf-data",
        datatype: "cf32_le",
        sampleRate: 2400000,
        hardware: "HackRF One",
        author: "Test User",
        sha512: "abc123",
        dataFileSize: 8000000,
        status: "uploaded",
      });

      expect(capture.id).toBeDefined();
      expect(capture.name).toBe("Test Capture");
      expect(capture.datatype).toBe("cf32_le");
      expect(capture.sampleRate).toBe(2400000);

      testCaptureId = capture.id;
    });

    it("retrieves signal captures for a user", async () => {
      const captures = await getUserSignalCaptures(testUserId);

      expect(captures.length).toBeGreaterThan(0);
      expect(captures[0]?.userId).toBe(testUserId);
    });

    it("retrieves a signal capture by ID", async () => {
      const capture = await getSignalCaptureById(testCaptureId);

      expect(capture).toBeDefined();
      expect(capture?.id).toBe(testCaptureId);
      expect(capture?.name).toBe("Test Capture");
    });

    it("updates signal capture status", async () => {
      await updateSignalCaptureStatus(testCaptureId, "ready");

      const capture = await getSignalCaptureById(testCaptureId);
      expect(capture?.status).toBe("ready");
    });
  });

  describe("Annotations", () => {
    it("creates an annotation", async () => {
      const annotation = await createAnnotation({
        captureId: testCaptureId,
        sampleStart: 1000,
        sampleCount: 500,
        freqLowerEdge: 2400000000,
        freqUpperEdge: 2410000000,
        label: "Test Annotation",
        modulationType: "QPSK",
        confidence: 0.95,
        estimatedSNR: 15.2,
        estimatedCFO: -1500,
        estimatedBaud: 2400000,
        color: "#00ffff",
      });

      expect(annotation.id).toBeDefined();
      expect(annotation.captureId).toBe(testCaptureId);
      expect(annotation.label).toBe("Test Annotation");
      expect(annotation.modulationType).toBe("QPSK");

      testAnnotationId = annotation.id;
    });

    it("retrieves annotations for a capture", async () => {
      const annotations = await getCaptureAnnotations(testCaptureId);

      expect(annotations.length).toBeGreaterThan(0);
      expect(annotations[0]?.captureId).toBe(testCaptureId);
    });

    it("updates an annotation", async () => {
      await updateAnnotation(testAnnotationId, {
        label: "Updated Label",
        confidence: 0.98,
      });

      const annotations = await getCaptureAnnotations(testCaptureId);
      const updated = annotations.find((a) => a.id === testAnnotationId);

      expect(updated?.label).toBe("Updated Label");
      expect(updated?.confidence).toBe(0.98);
    });
  });

  describe("Processing Jobs", () => {
    it("creates a processing job", async () => {
      const job = await createProcessingJob({
        captureId: testCaptureId,
        annotationId: testAnnotationId,
        jobType: "classification",
        parameters: JSON.stringify({ sampleStart: 1000, sampleCount: 500 }),
        results: null,
        errorMessage: null,
        completedAt: null,
      });

      expect(job.id).toBeDefined();
      expect(job.captureId).toBe(testCaptureId);
      expect(job.jobType).toBe("classification");
      expect(job.status).toBe("pending");

      testJobId = job.id;
    });

    it("retrieves a processing job by ID", async () => {
      const job = await getProcessingJobById(testJobId);

      expect(job).toBeDefined();
      expect(job?.id).toBe(testJobId);
      expect(job?.jobType).toBe("classification");
    });

    it("updates processing job status and results", async () => {
      const results = JSON.stringify({
        modulation: "QPSK",
        confidence: 0.95,
      });

      await updateProcessingJob(testJobId, {
        status: "completed",
        results,
        completedAt: new Date(),
      });

      const job = await getProcessingJobById(testJobId);

      expect(job?.status).toBe("completed");
      expect(job?.results).toBe(results);
      expect(job?.completedAt).toBeDefined();
    });
  });

  describe("Chat Messages", () => {
    it("creates a chat message", async () => {
      const message = await createChatMessage({
        userId: testUserId,
        captureId: testCaptureId,
        role: "user",
        content: "What modulation is this?",
      });

      expect(message.id).toBeDefined();
      expect(message.userId).toBe(testUserId);
      expect(message.role).toBe("user");
      expect(message.content).toBe("What modulation is this?");
    });

    it("creates an assistant response", async () => {
      const message = await createChatMessage({
        userId: testUserId,
        captureId: testCaptureId,
        role: "assistant",
        content: "Based on the analysis, this appears to be QPSK modulation.",
      });

      expect(message.role).toBe("assistant");
    });

    it("retrieves chat history for a user", async () => {
      const history = await getChatHistory(testUserId, undefined, 10);

      expect(history.length).toBeGreaterThan(0);
      expect(history[0]?.userId).toBe(testUserId);
    });

    it("retrieves chat history for a specific capture", async () => {
      const history = await getChatHistory(testUserId, testCaptureId, 10);

      expect(history.length).toBeGreaterThan(0);
      expect(history.every((msg) => msg.captureId === testCaptureId)).toBe(true);
    });

    it("limits chat history results", async () => {
      const history = await getChatHistory(testUserId, undefined, 1);

      expect(history.length).toBeLessThanOrEqual(1);
    });
  });
});
