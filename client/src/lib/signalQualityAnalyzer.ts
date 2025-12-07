import type { SignalPreview } from './signalPreviewGenerator';

export type AlertSeverity = 'info' | 'warning' | 'error';

export interface QualityAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  recommendation: string;
  metric?: string;
  value?: number;
}

export class SignalQualityAnalyzer {
  private static readonly SNR_LOW_THRESHOLD = 10; // dB
  private static readonly SNR_CRITICAL_THRESHOLD = 5; // dB
  private static readonly CLIPPING_THRESHOLD = -3; // dB from max
  private static readonly DC_OFFSET_THRESHOLD = 0.1; // 10% of dynamic range
  private static readonly SPECTRAL_FLATNESS_THRESHOLD = 0.8; // High flatness = noise

  static analyze(preview: SignalPreview): QualityAlert[] {
    const alerts: QualityAlert[] = [];

    alerts.push(...this.checkSNR(preview));
    alerts.push(...this.checkClipping(preview));
    alerts.push(...this.checkDynamicRange(preview));
    alerts.push(...this.checkPowerLevels(preview));

    return alerts.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  private static checkSNR(preview: SignalPreview): QualityAlert[] {
    const alerts: QualityAlert[] = [];
    const snr = preview.metrics.snrEstimate;

    if (snr < this.SNR_CRITICAL_THRESHOLD) {
      alerts.push({
        id: 'snr-critical',
        severity: 'error',
        title: 'Critical: Very Low SNR',
        description: `Signal-to-noise ratio is ${snr.toFixed(1)} dB, below ${this.SNR_CRITICAL_THRESHOLD} dB threshold.`,
        recommendation: 'Check antenna connection, reduce RF gain, or move to a location with better signal reception. Consider using external LNA (Low Noise Amplifier).',
        metric: 'SNR',
        value: snr,
      });
    } else if (snr < this.SNR_LOW_THRESHOLD) {
      alerts.push({
        id: 'snr-low',
        severity: 'warning',
        title: 'Warning: Low SNR',
        description: `Signal-to-noise ratio is ${snr.toFixed(1)} dB, below ${this.SNR_LOW_THRESHOLD} dB threshold.`,
        recommendation: 'Adjust RF gain, check antenna orientation, or use narrower bandwidth to improve SNR. Consider adding filtering.',
        metric: 'SNR',
        value: snr,
      });
    } else if (snr > 40) {
      alerts.push({
        id: 'snr-excellent',
        severity: 'info',
        title: 'Excellent Signal Quality',
        description: `Signal-to-noise ratio is ${snr.toFixed(1)} dB, indicating clean signal reception.`,
        recommendation: 'Signal quality is excellent. No action needed.',
        metric: 'SNR',
        value: snr,
      });
    }

    return alerts;
  }

  private static checkClipping(preview: SignalPreview): QualityAlert[] {
    const alerts: QualityAlert[] = [];
    const peakPower = preview.metrics.peakPower;
    const avgPower = preview.metrics.avgPower;

    const estimatedMax = 0; // 0 dB is typical maximum
    const distanceFromMax = estimatedMax - peakPower;

    if (distanceFromMax < Math.abs(this.CLIPPING_THRESHOLD)) {
      alerts.push({
        id: 'clipping-detected',
        severity: 'error',
        title: 'Signal Clipping Detected',
        description: `Peak power is ${peakPower.toFixed(1)} dB, very close to maximum (${estimatedMax} dB). Signal may be clipped.`,
        recommendation: 'Reduce RF gain by 10-20 dB to prevent clipping. Clipped signals lose information and cannot be recovered.',
        metric: 'Peak Power',
        value: peakPower,
      });
    } else if (distanceFromMax < 6) {
      alerts.push({
        id: 'near-clipping',
        severity: 'warning',
        title: 'Warning: Near Clipping',
        description: `Peak power is ${peakPower.toFixed(1)} dB, approaching maximum. Risk of occasional clipping.`,
        recommendation: 'Consider reducing RF gain by 3-6 dB to provide headroom for signal peaks.',
        metric: 'Peak Power',
        value: peakPower,
      });
    }

    return alerts;
  }

  private static checkDynamicRange(preview: SignalPreview): QualityAlert[] {
    const alerts: QualityAlert[] = [];
    const dynamicRange = preview.metrics.dynamicRange;

    if (dynamicRange < 20) {
      alerts.push({
        id: 'low-dynamic-range',
        severity: 'warning',
        title: 'Low Dynamic Range',
        description: `Dynamic range is ${dynamicRange.toFixed(1)} dB, indicating limited signal variation.`,
        recommendation: 'Signal may be noise-dominated or constant. Verify signal source is active and transmitting. Check for AGC (Automatic Gain Control) issues.',
        metric: 'Dynamic Range',
        value: dynamicRange,
      });
    } else if (dynamicRange > 60) {
      alerts.push({
        id: 'high-dynamic-range',
        severity: 'info',
        title: 'High Dynamic Range',
        description: `Dynamic range is ${dynamicRange.toFixed(1)} dB, indicating strong signal variation.`,
        recommendation: 'Good dynamic range suggests clean signal with distinct features. Ideal for analysis.',
        metric: 'Dynamic Range',
        value: dynamicRange,
      });
    }

    return alerts;
  }

  private static checkPowerLevels(preview: SignalPreview): QualityAlert[] {
    const alerts: QualityAlert[] = [];
    const avgPower = preview.metrics.avgPower;
    const peakPower = preview.metrics.peakPower;

    if (avgPower < -60) {
      alerts.push({
        id: 'very-low-power',
        severity: 'warning',
        title: 'Very Low Signal Power',
        description: `Average power is ${avgPower.toFixed(1)} dB, indicating weak signal.`,
        recommendation: 'Increase RF gain, check antenna connection, or verify signal source is transmitting. May need external amplifier.',
        metric: 'Avg Power',
        value: avgPower,
      });
    }

    const crestFactor = peakPower - avgPower;
    if (crestFactor < 3) {
      alerts.push({
        id: 'low-crest-factor',
        severity: 'info',
        title: 'Low Crest Factor',
        description: `Crest factor is ${crestFactor.toFixed(1)} dB, suggesting constant-amplitude signal or noise.`,
        recommendation: 'Low crest factor may indicate CW (continuous wave), noise, or heavily filtered signal. Verify signal type matches expectation.',
        metric: 'Crest Factor',
        value: crestFactor,
      });
    } else if (crestFactor > 15) {
      alerts.push({
        id: 'high-crest-factor',
        severity: 'info',
        title: 'High Crest Factor',
        description: `Crest factor is ${crestFactor.toFixed(1)} dB, suggesting bursty or pulsed signal.`,
        recommendation: 'High crest factor typical of pulsed radar, TDMA, or intermittent transmissions. Ensure adequate sample rate to capture peaks.',
        metric: 'Crest Factor',
        value: crestFactor,
      });
    }

    return alerts;
  }

  static getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
    }
  }

  static getSeverityIcon(severity: AlertSeverity): string {
    switch (severity) {
      case 'error': return '🔴';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
    }
  }
}
