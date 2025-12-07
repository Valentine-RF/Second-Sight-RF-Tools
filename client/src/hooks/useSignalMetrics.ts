import { useEffect, useRef } from 'react';
import { useSignalStore } from '@/store/signalStore';
import { SignalMetricsExtractor } from '@/lib/signalMetricsExtractor';

/**
 * Hook to automatically calculate and store signal metrics
 * 
 * Call updateMetricsFromPSD() when FFT/PSD data is available
 */
export function useSignalMetrics() {
  const currentCapture = useSignalStore((state) => state.currentCapture);
  const setSignalMetrics = useSignalStore((state) => state.setSignalMetrics);
  const signalMetrics = useSignalStore((state) => state.signalMetrics);
  
  const lastCaptureId = useRef<number | null>(null);
  
  useEffect(() => {
    // Reset metrics when capture changes
    if (currentCapture?.id !== lastCaptureId.current) {
      setSignalMetrics(null);
      lastCaptureId.current = currentCapture?.id ?? null;
    }
  }, [currentCapture, setSignalMetrics]);
  
  /**
   * Update metrics from PSD data (call this from FFTPSDPlot or Spectrogram)
   */
  const updateMetricsFromPSD = (psdData: Float32Array | number[], sampleRate: number) => {
    try {
      const metrics = SignalMetricsExtractor.extractMetrics(psdData, sampleRate, {
        noiseFloorPercentile: 10,
        signalThresholdDb: 10,
        bandwidthThreshold: -20,
      });
      
      setSignalMetrics(metrics);
    } catch (error) {
      console.error('Failed to calculate signal metrics:', error);
    }
  };
  
  /**
   * Update metrics from frequency/power arrays (call this from plot components)
   */
  const updateMetricsFromPlot = (frequencies: number[], powerDb: number[], sampleRate: number) => {
    try {
      const metrics = SignalMetricsExtractor.extractMetricsFromPSDPlot(frequencies, powerDb, sampleRate);
      setSignalMetrics(metrics);
    } catch (error) {
      console.error('Failed to calculate signal metrics:', error);
    }
  };
  
  return {
    metrics: signalMetrics,
    updateMetricsFromPSD,
    updateMetricsFromPlot,
  };
}
