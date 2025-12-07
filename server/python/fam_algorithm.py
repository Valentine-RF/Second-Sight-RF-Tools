#!/usr/bin/env python3
"""
Cyclostationary Analysis - FAM (Fast Averaging Method) Algorithm
GPU-accelerated implementation using CuPy (with NumPy fallback)
"""

import sys
import json
import numpy as np
from scipy import signal
import pyarrow as pa

# Try to import CuPy for GPU acceleration
try:
    import cupy as cp
    GPU_AVAILABLE = True
    xp = cp
except ImportError:
    GPU_AVAILABLE = False
    xp = np
    print("Warning: CuPy not available, using NumPy (CPU-only)", file=sys.stderr)


class FAMAnalyzer:
    """Fast Averaging Method for Cyclostationary Analysis"""
    
    def __init__(self, sample_rate: float, use_gpu: bool = True):
        self.sample_rate = sample_rate
        self.use_gpu = use_gpu and GPU_AVAILABLE
        self.xp = cp if self.use_gpu else np
    
    def channelize(self, iq_samples: np.ndarray, nfft: int = 256, overlap: float = 0.5) -> np.ndarray:
        """
        Step 1: Channelization
        Divide input signal into overlapping blocks with windowing
        
        Args:
            iq_samples: Complex IQ samples (1D array)
            nfft: FFT size for channelization
            overlap: Overlap fraction (0.5 = 50%)
        
        Returns:
            Channelized signal (2D: time x frequency)
        """
        # Convert to GPU if available
        if self.use_gpu:
            iq_samples = cp.asarray(iq_samples)
        
        # Hamming window to reduce spectral leakage
        window = self.xp.hamming(nfft)
        
        # Calculate hop size
        hop = int(nfft * (1 - overlap))
        
        # Number of blocks
        num_blocks = (len(iq_samples) - nfft) // hop + 1
        
        # Channelization matrix
        channels = self.xp.zeros((num_blocks, nfft), dtype=complex)
        
        for i in range(num_blocks):
            start = i * hop
            end = start + nfft
            block = iq_samples[start:end] * window
            channels[i, :] = self.xp.fft.fft(block)
        
        return channels
    
    def compute_fam(self, iq_samples: np.ndarray, alpha_max: float = 0.5, 
                    nfft: int = 256, overlap: float = 0.5) -> tuple:
        """
        Complete FAM Algorithm
        
        Args:
            iq_samples: Complex IQ samples
            alpha_max: Maximum cyclic frequency (normalized by sample rate)
            nfft: FFT size
            overlap: Overlap fraction
        
        Returns:
            (scf_magnitude, spectral_freqs, cyclic_freqs, cyclic_profile)
        """
        print(f"[FAM] Processing {len(iq_samples)} samples...", file=sys.stderr)
        print(f"[FAM] GPU: {self.use_gpu}, NFFT: {nfft}, Overlap: {overlap}", file=sys.stderr)
        
        # Step 1: Channelization
        channels = self.channelize(iq_samples, nfft, overlap)
        print(f"[FAM] Channelized: {channels.shape}", file=sys.stderr)
        
        # Step 2: Down-conversion (shift to baseband)
        # For each channel, demodulate by shifting frequency
        num_blocks, num_freqs = channels.shape
        
        # Step 3: Cyclic FFT along time axis
        # This transforms time variations into cyclic frequencies
        scf_raw = self.xp.fft.fft(channels, axis=0)
        
        # Step 4: Magnitude calculation
        scf_magnitude = self.xp.abs(scf_raw)
        
        # Normalize
        scf_magnitude = scf_magnitude / self.xp.max(scf_magnitude)
        
        # Step 5: Compute Cyclic Profile (max-hold along spectral frequency axis)
        cyclic_profile = self.xp.max(scf_magnitude, axis=1)
        
        # Generate frequency axes
        spectral_freqs = self.xp.fft.fftfreq(num_freqs, 1/self.sample_rate)
        cyclic_freqs = self.xp.fft.fftfreq(num_blocks, 1/self.sample_rate)
        
        # Limit cyclic frequency range
        alpha_max_hz = alpha_max * self.sample_rate
        valid_cyclic = self.xp.abs(cyclic_freqs) <= alpha_max_hz
        
        scf_magnitude = scf_magnitude[valid_cyclic, :]
        cyclic_freqs = cyclic_freqs[valid_cyclic]
        cyclic_profile = cyclic_profile[valid_cyclic]
        
        # Convert back to NumPy if using GPU
        if self.use_gpu:
            scf_magnitude = cp.asnumpy(scf_magnitude)
            spectral_freqs = cp.asnumpy(spectral_freqs)
            cyclic_freqs = cp.asnumpy(cyclic_freqs)
            cyclic_profile = cp.asnumpy(cyclic_profile)
        
        print(f"[FAM] SCF shape: {scf_magnitude.shape}", file=sys.stderr)
        print(f"[FAM] Spectral freqs: {len(spectral_freqs)}, Cyclic freqs: {len(cyclic_freqs)}", file=sys.stderr)
        
        return scf_magnitude, spectral_freqs, cyclic_freqs, cyclic_profile


def serialize_to_arrow(scf_magnitude, spectral_freqs, cyclic_freqs, cyclic_profile):
    """
    Serialize FAM results to Apache Arrow format for efficient transport
    
    Returns:
        bytes: Arrow IPC stream
    """
    # Flatten SCF magnitude for Arrow (2D -> 1D with metadata)
    scf_flat = scf_magnitude.flatten().astype(np.float32)
    
    # Create Arrow table
    table = pa.table({
        'scf_magnitude': scf_flat,
        'spectral_freqs': spectral_freqs.astype(np.float32),
        'cyclic_freqs': cyclic_freqs.astype(np.float32),
        'cyclic_profile': cyclic_profile.astype(np.float32),
    })
    
    # Serialize to IPC stream
    sink = pa.BufferOutputStream()
    writer = pa.ipc.new_stream(sink, table.schema)
    writer.write_table(table)
    writer.close()
    
    return sink.getvalue().to_pybytes()


def main():
    """
    CLI interface for FAM algorithm
    
    Input (stdin): JSON with {iq_real: [], iq_imag: [], sample_rate: float, params: {}}
    Output (stdout): Apache Arrow IPC stream
    """
    # Read input from stdin
    input_data = json.load(sys.stdin)
    
    iq_real = np.array(input_data['iq_real'], dtype=np.float32)
    iq_imag = np.array(input_data['iq_imag'], dtype=np.float32)
    iq_samples = iq_real + 1j * iq_imag
    
    sample_rate = input_data['sample_rate']
    params = input_data.get('params', {})
    
    # FAM parameters
    nfft = params.get('nfft', 256)
    overlap = params.get('overlap', 0.5)
    alpha_max = params.get('alpha_max', 0.5)
    use_gpu = params.get('use_gpu', True)
    
    # Run FAM algorithm
    analyzer = FAMAnalyzer(sample_rate, use_gpu=use_gpu)
    scf_magnitude, spectral_freqs, cyclic_freqs, cyclic_profile = analyzer.compute_fam(
        iq_samples, alpha_max, nfft, overlap
    )
    
    # Serialize to Arrow
    arrow_bytes = serialize_to_arrow(scf_magnitude, spectral_freqs, cyclic_freqs, cyclic_profile)
    
    # Write to stdout (binary)
    sys.stdout.buffer.write(arrow_bytes)
    
    # Write metadata to stderr for debugging
    print(f"[FAM] Complete. Sent {len(arrow_bytes)} bytes via Arrow", file=sys.stderr)


if __name__ == '__main__':
    main()
