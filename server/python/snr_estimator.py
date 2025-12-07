#!/usr/bin/env python3
"""
Blind SNR Estimation using M2M4 Method
Second and fourth moment-based estimator for MPSK/MQAM signals
"""

import sys
import json
import numpy as np


class M2M4SNREstimator:
    """
    M2M4 SNR Estimator for blind signal quality assessment
    
    Based on second moment (M2) and fourth moment (M4) of signal envelope
    Works well for MPSK and MQAM modulations
    """
    
    def __init__(self):
        pass
    
    def estimate_snr(self, iq_samples: np.ndarray, modulation_type: str = 'QPSK') -> dict:
        """
        Estimate SNR using M2M4 method
        
        Args:
            iq_samples: Complex IQ samples
            modulation_type: Modulation type hint ('QPSK', 'QAM', 'PSK', etc.)
        
        Returns:
            Dictionary with SNR estimates in dB and linear
        """
        # Remove DC offset
        iq_samples = iq_samples - np.mean(iq_samples)
        
        # Calculate envelope (magnitude)
        envelope = np.abs(iq_samples)
        
        # Second moment (M2) - average power
        M2 = np.mean(envelope ** 2)
        
        # Fourth moment (M4) - average of fourth power
        M4 = np.mean(envelope ** 4)
        
        # M2M4 ratio
        if M2 > 0:
            m2m4_ratio = M4 / (M2 ** 2)
        else:
            return {'snr_db': -np.inf, 'snr_linear': 0, 'method': 'M2M4', 'error': 'Zero power signal'}
        
        # SNR estimation based on modulation type
        if 'QPSK' in modulation_type.upper() or 'BPSK' in modulation_type.upper():
            # For QPSK/BPSK: SNR = (2 - m2m4_ratio) / (m2m4_ratio - 1)
            if m2m4_ratio > 1:
                snr_linear = (2 - m2m4_ratio) / (m2m4_ratio - 1)
            else:
                snr_linear = 0
        elif 'QAM' in modulation_type.upper():
            # For QAM: SNR = sqrt(2) * (1 - sqrt(m2m4_ratio - 1))
            if m2m4_ratio > 1:
                snr_linear = np.sqrt(2) * (1 - np.sqrt(m2m4_ratio - 1))
            else:
                snr_linear = 0
        else:
            # Generic PSK: use QPSK formula
            if m2m4_ratio > 1:
                snr_linear = (2 - m2m4_ratio) / (m2m4_ratio - 1)
            else:
                snr_linear = 0
        
        # Convert to dB
        if snr_linear > 0:
            snr_db = 10 * np.log10(snr_linear)
        else:
            snr_db = -np.inf
        
        # Additional statistics
        signal_power = M2
        noise_power_estimate = signal_power / (snr_linear + 1) if snr_linear > 0 else signal_power
        
        return {
            'snr_db': float(snr_db),
            'snr_linear': float(snr_linear),
            'signal_power_db': float(10 * np.log10(signal_power)) if signal_power > 0 else -np.inf,
            'noise_power_db': float(10 * np.log10(noise_power_estimate)) if noise_power_estimate > 0 else -np.inf,
            'm2': float(M2),
            'm4': float(M4),
            'm2m4_ratio': float(m2m4_ratio),
            'method': 'M2M4',
            'modulation_hint': modulation_type
        }


def estimate_cfo_power_method(iq_samples: np.ndarray, sample_rate: float, symbol_rate: float = None) -> dict:
    """
    Carrier Frequency Offset (CFO) estimation using power method
    
    Args:
        iq_samples: Complex IQ samples
        sample_rate: Sample rate in Hz
        symbol_rate: Symbol rate in Hz (optional, for normalization)
    
    Returns:
        Dictionary with CFO estimate in Hz and normalized
    """
    # Remove DC offset
    iq_samples = iq_samples - np.mean(iq_samples)
    
    # Method 1: Autocorrelation-based CFO estimation
    # Compute autocorrelation at lag 1
    autocorr = np.correlate(iq_samples[:-1], iq_samples[1:], mode='valid')
    
    # Phase of autocorrelation gives frequency offset
    phase = np.angle(np.sum(autocorr))
    
    # Convert phase to frequency (Hz)
    cfo_hz = phase * sample_rate / (2 * np.pi)
    
    # Method 2: Power spectral density peak
    # FFT of signal
    fft_result = np.fft.fft(iq_samples)
    psd = np.abs(fft_result) ** 2
    
    # Find peak frequency
    peak_idx = np.argmax(psd)
    freqs = np.fft.fftfreq(len(iq_samples), 1/sample_rate)
    peak_freq = freqs[peak_idx]
    
    # Normalized CFO
    if symbol_rate:
        cfo_normalized = cfo_hz / symbol_rate
    else:
        cfo_normalized = cfo_hz / sample_rate
    
    return {
        'cfo_hz': float(cfo_hz),
        'cfo_normalized': float(cfo_normalized),
        'peak_freq_hz': float(peak_freq),
        'method': 'Autocorrelation + PSD',
        'sample_rate': float(sample_rate),
        'symbol_rate': float(symbol_rate) if symbol_rate else None
    }


def main():
    """
    CLI interface for SNR and CFO estimation
    
    Input (stdin): JSON with {iq_real: [], iq_imag: [], sample_rate: float, params: {}}
    Output (stdout): JSON with estimation results
    """
    # Read input from stdin
    input_data = json.load(sys.stdin)
    
    iq_real = np.array(input_data['iq_real'], dtype=np.float32)
    iq_imag = np.array(input_data['iq_imag'], dtype=np.float32)
    iq_samples = iq_real + 1j * iq_imag
    
    sample_rate = input_data.get('sample_rate', 1e6)
    params = input_data.get('params', {})
    
    # Parameters
    modulation_type = params.get('modulation_type', 'QPSK')
    symbol_rate = params.get('symbol_rate')
    estimate_cfo = params.get('estimate_cfo', True)
    
    # SNR estimation
    estimator = M2M4SNREstimator()
    snr_results = estimator.estimate_snr(iq_samples, modulation_type)
    
    # CFO estimation
    if estimate_cfo:
        cfo_results = estimate_cfo_power_method(iq_samples, sample_rate, symbol_rate)
    else:
        cfo_results = None
    
    # Combined results
    results = {
        'snr': snr_results,
        'cfo': cfo_results
    }
    
    # Output JSON to stdout (convert -inf to None for JSON compatibility)
    def sanitize_for_json(obj):
        if isinstance(obj, dict):
            return {k: sanitize_for_json(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [sanitize_for_json(item) for item in obj]
        elif isinstance(obj, float):
            if np.isinf(obj) or np.isnan(obj):
                return None
            return obj
        return obj
    
    sanitized_results = sanitize_for_json(results)
    print(json.dumps(sanitized_results, indent=2))
    
    # Debug info to stderr
    print(f"[SNR Estimator] SNR: {snr_results['snr_db']:.2f} dB", file=sys.stderr)
    if cfo_results:
        print(f"[CFO Estimator] CFO: {cfo_results['cfo_hz']:.2f} Hz", file=sys.stderr)


if __name__ == '__main__':
    main()
