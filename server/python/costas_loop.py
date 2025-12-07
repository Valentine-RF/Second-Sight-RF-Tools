#!/usr/bin/env python3
"""
Costas Loop for Carrier Frequency Offset (CFO) Fine-Tuning
Phase-Locked Loop (PLL) implementation for continuous carrier tracking
"""

import sys
import json
import numpy as np


class CostasLoop:
    """
    Costas Loop PLL for carrier synchronization and CFO refinement
    
    Supports BPSK, QPSK, and 8PSK modulations with adaptive loop bandwidth
    """
    
    def __init__(self, 
                 loop_bandwidth: float = 0.01,
                 damping_factor: float = 0.707,
                 modulation_order: int = 4):
        """
        Initialize Costas loop
        
        Args:
            loop_bandwidth: Normalized loop bandwidth (0.001 to 0.1)
            damping_factor: Damping factor (typically 0.707 for critical damping)
            modulation_order: Modulation order (2=BPSK, 4=QPSK, 8=8PSK)
        """
        self.loop_bandwidth = loop_bandwidth
        self.damping_factor = damping_factor
        self.modulation_order = modulation_order
        
        # Calculate loop filter coefficients
        self._calculate_loop_gains()
        
        # Initialize state variables
        self.phase = 0.0  # NCO phase
        self.frequency = 0.0  # NCO frequency offset
        self.phase_error_history = []
        self.frequency_history = []
        
    def _calculate_loop_gains(self):
        """Calculate proportional and integral loop filter gains"""
        # Normalized loop bandwidth
        theta_n = self.loop_bandwidth / (self.damping_factor + 1 / (4 * self.damping_factor))
        
        # Proportional gain (K1)
        self.k1 = 4 * self.damping_factor * theta_n / (1 + 2 * self.damping_factor * theta_n + theta_n ** 2)
        
        # Integral gain (K2)
        self.k2 = 4 * theta_n ** 2 / (1 + 2 * self.damping_factor * theta_n + theta_n ** 2)
    
    def phase_detector(self, sample: complex) -> float:
        """
        Phase detector for different modulation orders
        
        Args:
            sample: Complex IQ sample after NCO correction
        
        Returns:
            Phase error estimate
        """
        if self.modulation_order == 2:
            # BPSK phase detector: error = Q(sample) * sign(I(sample))
            return sample.imag * np.sign(sample.real)
        
        elif self.modulation_order == 4:
            # QPSK phase detector: error = sign(I) * Q - sign(Q) * I
            return np.sign(sample.real) * sample.imag - np.sign(sample.imag) * sample.real
        
        elif self.modulation_order == 8:
            # 8PSK phase detector: decision-directed
            # Find nearest constellation point
            angle = np.angle(sample)
            nearest_angle = np.round(angle / (np.pi / 4)) * (np.pi / 4)
            error_angle = angle - nearest_angle
            
            # Wrap to [-pi, pi]
            while error_angle > np.pi:
                error_angle -= 2 * np.pi
            while error_angle < -np.pi:
                error_angle += 2 * np.pi
            
            return error_angle
        
        else:
            raise ValueError(f"Unsupported modulation order: {self.modulation_order}")
    
    def loop_filter(self, phase_error: float) -> float:
        """
        Second-order loop filter (proportional + integral)
        
        Args:
            phase_error: Phase error from detector
        
        Returns:
            Frequency correction
        """
        # Proportional term
        proportional = self.k1 * phase_error
        
        # Integral term (accumulate frequency offset)
        self.frequency += self.k2 * phase_error
        
        # Clamp frequency to prevent runaway
        max_freq = 0.5  # Nyquist limit
        self.frequency = np.clip(self.frequency, -max_freq, max_freq)
        
        return proportional + self.frequency
    
    def nco_update(self, frequency_correction: float):
        """
        Update NCO (Numerically Controlled Oscillator) phase
        
        Args:
            frequency_correction: Frequency correction from loop filter
        """
        self.phase += frequency_correction
        
        # Wrap phase to [-pi, pi]
        while self.phase > np.pi:
            self.phase -= 2 * np.pi
        while self.phase < -np.pi:
            self.phase += 2 * np.pi
    
    def nco_mix(self, sample: complex) -> complex:
        """
        Mix input sample with NCO to remove carrier offset
        
        Args:
            sample: Input complex sample
        
        Returns:
            Corrected sample
        """
        # Generate NCO output: e^(-j*phase)
        nco_output = np.exp(-1j * self.phase)
        
        # Mix with input
        return sample * nco_output
    
    def process_sample(self, sample: complex) -> tuple:
        """
        Process single IQ sample through Costas loop
        
        Args:
            sample: Complex IQ sample
        
        Returns:
            Tuple of (corrected_sample, phase_error, current_frequency)
        """
        # Mix with NCO to remove carrier
        corrected = self.nco_mix(sample)
        
        # Detect phase error
        phase_error = self.phase_detector(corrected)
        
        # Filter phase error to get frequency correction
        freq_correction = self.loop_filter(phase_error)
        
        # Update NCO
        self.nco_update(freq_correction)
        
        # Store history
        self.phase_error_history.append(phase_error)
        self.frequency_history.append(self.frequency)
        
        return corrected, phase_error, self.frequency
    
    def process_signal(self, iq_samples: np.ndarray) -> dict:
        """
        Process entire signal through Costas loop
        
        Args:
            iq_samples: Array of complex IQ samples
        
        Returns:
            Dictionary with corrected samples and tracking metrics
        """
        n_samples = len(iq_samples)
        corrected_samples = np.zeros(n_samples, dtype=complex)
        phase_errors = np.zeros(n_samples)
        frequencies = np.zeros(n_samples)
        
        for i, sample in enumerate(iq_samples):
            corrected, phase_error, freq = self.process_sample(sample)
            corrected_samples[i] = corrected
            phase_errors[i] = phase_error
            frequencies[i] = freq
        
        # Detect lock status
        lock_detected, lock_time = self._detect_lock(phase_errors)
        
        # Calculate final CFO estimate
        if lock_detected and lock_time < n_samples:
            # Use frequency after lock
            final_frequency = np.mean(frequencies[lock_time:])
        else:
            # Use last 20% of samples
            final_frequency = np.mean(frequencies[int(0.8 * n_samples):])
        
        # Calculate phase error variance (lower = better lock)
        if lock_detected and lock_time < n_samples:
            phase_error_var = np.var(phase_errors[lock_time:])
        else:
            phase_error_var = np.var(phase_errors[int(0.8 * n_samples):])
        
        return {
            'corrected_samples': corrected_samples,
            'phase_errors': phase_errors,
            'frequencies': frequencies,
            'final_frequency_normalized': float(final_frequency),
            'lock_detected': bool(lock_detected),
            'lock_time_samples': int(lock_time) if lock_detected else None,
            'phase_error_variance': float(phase_error_var),
            'convergence_time_samples': int(self._estimate_convergence_time(frequencies))
        }
    
    def _detect_lock(self, phase_errors: np.ndarray, window_size: int = 100) -> tuple:
        """
        Detect when loop has achieved lock
        
        Args:
            phase_errors: Array of phase errors
            window_size: Window size for variance calculation
        
        Returns:
            Tuple of (lock_detected, lock_time_index)
        """
        if len(phase_errors) < window_size:
            return False, len(phase_errors)
        
        # Calculate rolling variance
        lock_threshold = 0.1  # Phase error variance threshold
        
        for i in range(window_size, len(phase_errors)):
            window = phase_errors[i - window_size:i]
            variance = np.var(window)
            
            if variance < lock_threshold:
                return True, i - window_size
        
        return False, len(phase_errors)
    
    def _estimate_convergence_time(self, frequencies: np.ndarray) -> int:
        """
        Estimate convergence time based on frequency settling
        
        Args:
            frequencies: Array of frequency estimates
        
        Returns:
            Convergence time in samples
        """
        if len(frequencies) < 100:
            return len(frequencies)
        
        # Final frequency (average of last 20%)
        final_freq = np.mean(frequencies[int(0.8 * len(frequencies)):])
        
        # Find when frequency settles within 5% of final value
        threshold = 0.05 * abs(final_freq) if final_freq != 0 else 0.01
        
        for i in range(len(frequencies)):
            if abs(frequencies[i] - final_freq) < threshold:
                # Check if it stays settled
                if i + 50 < len(frequencies):
                    window = frequencies[i:i + 50]
                    if np.all(np.abs(window - final_freq) < threshold):
                        return i
        
        return len(frequencies)


def refine_cfo_with_costas(iq_samples: np.ndarray,
                           sample_rate: float,
                           coarse_cfo_hz: float = 0.0,
                           modulation_order: int = 4,
                           loop_bandwidth: float = 0.01) -> dict:
    """
    Refine CFO estimate using Costas loop
    
    Args:
        iq_samples: Complex IQ samples
        sample_rate: Sample rate in Hz
        coarse_cfo_hz: Coarse CFO estimate from FFT method (Hz)
        modulation_order: Modulation order (2=BPSK, 4=QPSK, 8=8PSK)
        loop_bandwidth: Normalized loop bandwidth
    
    Returns:
        Dictionary with refined CFO and tracking metrics
    """
    # Pre-correct for coarse CFO if provided
    if coarse_cfo_hz != 0:
        t = np.arange(len(iq_samples)) / sample_rate
        coarse_correction = np.exp(-2j * np.pi * coarse_cfo_hz * t)
        iq_samples = iq_samples * coarse_correction
    
    # Initialize Costas loop
    costas = CostasLoop(
        loop_bandwidth=loop_bandwidth,
        damping_factor=0.707,
        modulation_order=modulation_order
    )
    
    # Process signal
    result = costas.process_signal(iq_samples)
    
    # Convert normalized frequency to Hz
    fine_cfo_hz = result['final_frequency_normalized'] * sample_rate / (2 * np.pi)
    
    # Total CFO = coarse + fine
    total_cfo_hz = coarse_cfo_hz + fine_cfo_hz
    
    return {
        'coarse_cfo_hz': float(coarse_cfo_hz),
        'fine_cfo_hz': float(fine_cfo_hz),
        'total_cfo_hz': float(total_cfo_hz),
        'cfo_normalized': float(total_cfo_hz / sample_rate),
        'lock_detected': result['lock_detected'],
        'lock_time_samples': result['lock_time_samples'],
        'convergence_time_samples': result['convergence_time_samples'],
        'phase_error_variance': result['phase_error_variance'],
        'phase_errors': result['phase_errors'].tolist(),
        'frequencies': result['frequencies'].tolist(),
        'loop_bandwidth': float(loop_bandwidth),
        'modulation_order': int(modulation_order),
        'method': 'Costas Loop PLL'
    }


def main():
    """Main entry point for CLI usage"""
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        
        # Extract parameters
        iq_real = np.array(input_data['iq_real'], dtype=np.float32)
        iq_imag = np.array(input_data['iq_imag'], dtype=np.float32)
        iq_samples = iq_real + 1j * iq_imag
        
        sample_rate = input_data['sample_rate']
        coarse_cfo_hz = input_data.get('coarse_cfo_hz', 0.0)
        modulation_order = input_data.get('modulation_order', 4)
        loop_bandwidth = input_data.get('loop_bandwidth', 0.01)
        
        # Run Costas loop refinement
        result = refine_cfo_with_costas(
            iq_samples=iq_samples,
            sample_rate=sample_rate,
            coarse_cfo_hz=coarse_cfo_hz,
            modulation_order=modulation_order,
            loop_bandwidth=loop_bandwidth
        )
        
        # Output result as JSON
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'traceback': __import__('traceback').format_exc()
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
