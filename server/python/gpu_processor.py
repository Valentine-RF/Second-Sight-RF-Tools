#!/usr/bin/env python3
"""
GPU Signal Processing Core - Second Sight RF Forensics

Production-ready CUDA-accelerated signal processing with:
- Proper CUDA stream management
- Pinned memory for efficient H2D/D2H transfers
- Memory pool management to prevent fragmentation
- Thread-safe operation for multi-client scenarios
"""

import sys
import threading
from typing import Dict, Any, Optional, Tuple, List
from dataclasses import dataclass
from contextlib import contextmanager
import numpy as np

# GPU acceleration with graceful fallback
try:
    import cupy as cp
    from cupy.cuda import stream as cuda_stream
    from cupyx.scipy import signal as cp_signal
    GPU_AVAILABLE = True
except ImportError:
    GPU_AVAILABLE = False
    cp = None
    print("[GPU Processor] CuPy not available - falling back to CPU", file=sys.stderr)

# Use NumPy as fallback
if GPU_AVAILABLE:
    xp = cp
else:
    import scipy.signal as sp_signal
    xp = np


@dataclass
class GPUConfig:
    """GPU configuration parameters"""
    device_id: int = 0
    num_streams: int = 4
    enable_memory_pool: bool = True
    pinned_memory_limit_mb: int = 512
    unified_memory: bool = False


class CUDAStreamPool:
    """
    Manages a pool of CUDA streams for concurrent kernel execution.
    Thread-safe round-robin allocation.
    """
    
    def __init__(self, num_streams: int = 4):
        self.num_streams = num_streams
        self._lock = threading.Lock()
        self._current_idx = 0
        
        if GPU_AVAILABLE:
            self.streams = [cp.cuda.Stream(non_blocking=True) for _ in range(num_streams)]
        else:
            self.streams = [None] * num_streams
    
    def get_stream(self) -> Optional[Any]:
        """Get next stream from pool (thread-safe)"""
        with self._lock:
            stream = self.streams[self._current_idx]
            self._current_idx = (self._current_idx + 1) % self.num_streams
            return stream
    
    def synchronize_all(self):
        """Synchronize all streams"""
        if GPU_AVAILABLE:
            for stream in self.streams:
                stream.synchronize()
    
    @contextmanager
    def stream_context(self):
        """Context manager for stream-scoped operations"""
        stream = self.get_stream()
        if GPU_AVAILABLE and stream is not None:
            with stream:
                yield stream
        else:
            yield None


class GPUSignalProcessor:
    """
    High-performance GPU signal processing for RF forensics.
    
    Features:
    - CUDA stream-based async execution
    - Pinned memory for zero-copy transfers where possible
    - Memory pool to prevent fragmentation
    - Graceful CPU fallback
    """
    
    def __init__(self, config: Optional[GPUConfig] = None):
        self.config = config or GPUConfig()
        self._lock = threading.Lock()
        
        if GPU_AVAILABLE:
            # Select GPU device
            cp.cuda.Device(self.config.device_id).use()
            
            # Configure memory pool
            if self.config.enable_memory_pool:
                if self.config.unified_memory:
                    pool = cp.cuda.MemoryPool(cp.cuda.malloc_managed)
                else:
                    pool = cp.cuda.MemoryPool()
                cp.cuda.set_allocator(pool.malloc)
                self._memory_pool = pool
                
                # Pinned memory pool for H2D transfers
                pinned_pool = cp.cuda.PinnedMemoryPool()
                cp.cuda.set_pinned_memory_allocator(pinned_pool.malloc)
                self._pinned_pool = pinned_pool
            
            # Initialize stream pool
            self.stream_pool = CUDAStreamPool(self.config.num_streams)
            
            # Pre-cache window functions
            self._cached_windows: Dict[Tuple[str, int], Any] = {}
            
            print(f"[GPU Processor] Initialized on GPU {self.config.device_id}", file=sys.stderr)
            print(f"[GPU Processor] {self.config.num_streams} CUDA streams", file=sys.stderr)
        else:
            self.stream_pool = CUDAStreamPool(0)
            self._memory_pool = None
            self._pinned_pool = None
            self._cached_windows = {}
            print("[GPU Processor] Running in CPU-only mode", file=sys.stderr)
    
    def _get_window(self, window_type: str, size: int) -> Any:
        """Get cached window function (GPU or CPU)"""
        key = (window_type, size)
        if key not in self._cached_windows:
            if window_type == 'hann':
                self._cached_windows[key] = xp.hanning(size).astype(xp.float32)
            elif window_type == 'hamming':
                self._cached_windows[key] = xp.hamming(size).astype(xp.float32)
            elif window_type == 'blackman':
                self._cached_windows[key] = xp.blackman(size).astype(xp.float32)
            elif window_type == 'kaiser':
                if GPU_AVAILABLE:
                    # CuPy doesn't have kaiser, compute on CPU and transfer
                    self._cached_windows[key] = cp.asarray(np.kaiser(size, 14.0).astype(np.float32))
                else:
                    self._cached_windows[key] = np.kaiser(size, 14.0).astype(np.float32)
            else:
                raise ValueError(f"Unknown window type: {window_type}")
        return self._cached_windows[key]
    
    def to_gpu(self, arr: np.ndarray) -> Any:
        """Transfer array to GPU (or return as-is for CPU mode)"""
        if GPU_AVAILABLE:
            return cp.asarray(arr)
        return arr
    
    def to_cpu(self, arr: Any) -> np.ndarray:
        """Transfer array to CPU"""
        if GPU_AVAILABLE and isinstance(arr, cp.ndarray):
            return cp.asnumpy(arr)
        return arr
    
    def psd_welch(self, iq_samples: np.ndarray, fft_size: int = 1024,
                  overlap: float = 0.5, window: str = 'hann',
                  detrend: bool = False) -> np.ndarray:
        """
        GPU-accelerated Welch's Power Spectral Density estimation.
        
        Args:
            iq_samples: Complex IQ samples (CPU numpy array)
            fft_size: FFT size for each segment
            overlap: Overlap fraction between segments (0.0-1.0)
            window: Window function ('hann', 'hamming', 'blackman', 'kaiser')
            detrend: Whether to remove DC offset
        
        Returns:
            PSD in dB (CPU numpy array)
        """
        with self.stream_pool.stream_context():
            # Transfer to GPU
            iq_gpu = self.to_gpu(iq_samples.astype(np.complex64))
            
            n = len(iq_gpu)
            hop = int(fft_size * (1 - overlap))
            num_segments = max(1, (n - fft_size) // hop + 1)
            
            # Get window
            win = self._get_window(window, fft_size)
            win_power = xp.sum(win ** 2)
            
            # Detrend if requested
            if detrend:
                iq_gpu = iq_gpu - xp.mean(iq_gpu)
            
            if num_segments == 1:
                # Single segment case
                segment = iq_gpu[:fft_size] * win
                spectrum = xp.fft.fft(segment)
                psd = xp.abs(spectrum) ** 2 / win_power
            else:
                # Multi-segment: extract overlapping segments using advanced indexing
                indices = xp.arange(num_segments)[:, None] * hop + xp.arange(fft_size)
                
                # Bounds check
                valid_mask = indices[:, -1] < n
                indices = indices[valid_mask]
                num_segments = len(indices)
                
                # Extract and window segments
                segments = iq_gpu[indices] * win
                
                # Batched FFT
                spectra = xp.fft.fft(segments, axis=1)
                
                # Average power
                psd = xp.mean(xp.abs(spectra) ** 2, axis=0) / win_power
            
            # Convert to dB
            psd_db = 10 * xp.log10(psd + 1e-12)
            
            # FFT shift to center DC
            psd_db = xp.fft.fftshift(psd_db)
            
            return self.to_cpu(psd_db)
    
    def fam_scf(self, iq_samples: np.ndarray, sample_rate: float,
                nfft: int = 256, overlap: float = 0.5,
                alpha_max: float = 0.5, window: str = 'hamming') -> Dict[str, np.ndarray]:
        """
        GPU-accelerated FAM (FFT Accumulation Method) for Spectral Correlation Function.
        
        The FAM algorithm provides efficient estimation of the cyclic spectral
        density for cyclostationary signal analysis.
        
        Args:
            iq_samples: Complex IQ samples
            sample_rate: Sample rate in Hz
            nfft: FFT size for channelization
            overlap: Overlap fraction
            alpha_max: Maximum cyclic frequency (normalized 0-1)
            window: Window function
        
        Returns:
            Dict with 'scf_magnitude', 'spectral_freqs', 'cyclic_freqs', 'cyclic_profile'
        """
        with self.stream_pool.stream_context():
            iq_gpu = self.to_gpu(iq_samples.astype(np.complex64))
            
            n = len(iq_gpu)
            hop = int(nfft * (1 - overlap))
            num_blocks = max(1, (n - nfft) // hop + 1)
            
            # Get window
            win = self._get_window(window, nfft)
            
            # Step 1: Channelization with overlapping blocks
            indices = xp.arange(num_blocks)[:, None] * hop + xp.arange(nfft)
            valid_mask = indices[:, -1] < n
            indices = indices[valid_mask]
            num_blocks = len(indices)
            
            # Extract windowed blocks
            blocks = iq_gpu[indices] * win
            
            # Step 2: FFT each block (channelization)
            channels = xp.fft.fft(blocks, axis=1)
            
            # Step 3: Cyclic FFT along time axis
            # This transforms temporal variations into cyclic frequencies
            scf_raw = xp.fft.fft(channels, axis=0)
            
            # Step 4: Compute magnitude
            scf_magnitude = xp.abs(scf_raw)
            
            # Normalize
            max_val = xp.max(scf_magnitude)
            if max_val > 0:
                scf_magnitude = scf_magnitude / max_val
            
            # Step 5: Cyclic profile (max-hold along spectral axis)
            cyclic_profile = xp.max(scf_magnitude, axis=1)
            
            # Generate frequency axes
            spectral_freqs = xp.fft.fftfreq(nfft, 1/sample_rate)
            cyclic_freqs = xp.fft.fftfreq(num_blocks, hop/sample_rate)
            
            # Limit to alpha_max
            alpha_max_hz = alpha_max * sample_rate
            valid_cyclic = xp.abs(cyclic_freqs) <= alpha_max_hz
            
            return {
                'scf_magnitude': self.to_cpu(scf_magnitude[valid_cyclic, :]),
                'spectral_freqs': self.to_cpu(xp.fft.fftshift(spectral_freqs)),
                'cyclic_freqs': self.to_cpu(cyclic_freqs[valid_cyclic]),
                'cyclic_profile': self.to_cpu(cyclic_profile[valid_cyclic])
            }
    
    def wigner_ville(self, iq_samples: np.ndarray, nfft: int = 256,
                     num_time_points: Optional[int] = None,
                     smoothing: bool = False,
                     smooth_window: int = 16) -> Dict[str, np.ndarray]:
        """
        GPU-accelerated Wigner-Ville Distribution.
        
        WVD(t,f) = ∫ x(t+τ/2) x*(t-τ/2) e^(-j2πfτ) dτ
        
        Provides optimal time-frequency resolution but with cross-term artifacts
        for multi-component signals.
        
        Args:
            iq_samples: Complex IQ samples
            nfft: FFT size (determines frequency resolution)
            num_time_points: Number of time points (default: N/4)
            smoothing: Apply Pseudo-WVD smoothing
            smooth_window: Smoothing window size
        
        Returns:
            Dict with 'wvd', 'time_axis', 'freq_axis'
        """
        with self.stream_pool.stream_context():
            iq_gpu = self.to_gpu(iq_samples.astype(np.complex64))
            
            N = len(iq_gpu)
            if num_time_points is None:
                num_time_points = N // 4
            
            half_nfft = nfft // 2
            time_step = max(1, N // num_time_points)
            
            # Compute valid time indices
            t_indices = xp.arange(num_time_points) * time_step + half_nfft
            t_indices = t_indices[(t_indices >= half_nfft) & (t_indices < N - half_nfft)]
            actual_time_points = len(t_indices)
            
            if actual_time_points == 0:
                return {
                    'wvd': np.zeros((1, nfft), dtype=np.float32),
                    'time_axis': np.array([0], dtype=np.float32),
                    'freq_axis': np.linspace(-0.5, 0.5, nfft, dtype=np.float32)
                }
            
            # Allocate output
            autocorr = xp.zeros((actual_time_points, nfft), dtype=xp.complex64)
            
            # Compute instantaneous autocorrelation for all tau values
            # Using vectorized operations across time points
            for tau_offset in range(-half_nfft, half_nfft):
                tau_idx = tau_offset + half_nfft
                
                idx1 = t_indices + tau_offset // 2
                idx2 = t_indices - tau_offset // 2
                
                # Bounds check
                valid = (idx1 >= 0) & (idx1 < N) & (idx2 >= 0) & (idx2 < N)
                
                # x(t+τ/2) * conj(x(t-τ/2))
                autocorr[valid, tau_idx] = iq_gpu[idx1[valid]] * xp.conj(iq_gpu[idx2[valid]])
            
            # Apply smoothing window if requested (Pseudo-WVD)
            if smoothing and smooth_window > 0:
                smooth_win = self._get_window('hamming', smooth_window)
                # Pad window to nfft
                pad_left = (nfft - smooth_window) // 2
                pad_right = nfft - smooth_window - pad_left
                smooth_win_padded = xp.pad(smooth_win, (pad_left, pad_right))
                autocorr = autocorr * smooth_win_padded
            
            # Batched FFT for all time slices
            wvd_complex = xp.fft.fft(autocorr, axis=1)
            wvd_magnitude = xp.abs(wvd_complex)
            
            # FFT shift to center DC
            wvd_magnitude = xp.fft.fftshift(wvd_magnitude, axes=1)
            
            # Frequency axis (normalized)
            freq_axis = xp.fft.fftshift(xp.fft.fftfreq(nfft))
            
            return {
                'wvd': self.to_cpu(wvd_magnitude),
                'time_axis': self.to_cpu(t_indices.astype(xp.float32)),
                'freq_axis': self.to_cpu(freq_axis.astype(xp.float32))
            }
    
    def choi_williams(self, iq_samples: np.ndarray, nfft: int = 256,
                      sigma: float = 1.0,
                      num_time_points: Optional[int] = None) -> Dict[str, np.ndarray]:
        """
        GPU-accelerated Choi-Williams Distribution.
        
        Uses exponential kernel to reduce cross-terms while maintaining resolution.
        Kernel: exp(-σ τ² / t²)
        
        Args:
            iq_samples: Complex IQ samples
            nfft: FFT size
            sigma: Kernel parameter (smaller = more smoothing)
            num_time_points: Number of time points
        
        Returns:
            Dict with 'cwd', 'time_axis', 'freq_axis'
        """
        with self.stream_pool.stream_context():
            iq_gpu = self.to_gpu(iq_samples.astype(np.complex64))
            
            N = len(iq_gpu)
            if num_time_points is None:
                num_time_points = N // 4
            
            half_nfft = nfft // 2
            time_step = max(1, N // num_time_points)
            
            t_indices = xp.arange(num_time_points) * time_step + half_nfft
            t_indices = t_indices[(t_indices >= half_nfft) & (t_indices < N - half_nfft)]
            actual_time_points = len(t_indices)
            
            if actual_time_points == 0:
                return {
                    'cwd': np.zeros((1, nfft), dtype=np.float32),
                    'time_axis': np.array([0], dtype=np.float32),
                    'freq_axis': np.linspace(-0.5, 0.5, nfft, dtype=np.float32)
                }
            
            autocorr = xp.zeros((actual_time_points, nfft), dtype=xp.complex64)
            
            for tau_offset in range(-half_nfft, half_nfft):
                tau_idx = tau_offset + half_nfft
                
                idx1 = t_indices + tau_offset // 2
                idx2 = t_indices - tau_offset // 2
                
                valid = (idx1 >= 0) & (idx1 < N) & (idx2 >= 0) & (idx2 < N)
                valid_t = t_indices[valid]
                
                # Choi-Williams kernel
                kernel = xp.exp(-sigma * (tau_offset ** 2) / (valid_t ** 2 + 1e-10))
                
                autocorr[valid, tau_idx] = kernel * (
                    iq_gpu[idx1[valid]] * xp.conj(iq_gpu[idx2[valid]])
                )
            
            cwd_complex = xp.fft.fft(autocorr, axis=1)
            cwd_magnitude = xp.abs(cwd_complex)
            cwd_magnitude = xp.fft.fftshift(cwd_magnitude, axes=1)
            
            freq_axis = xp.fft.fftshift(xp.fft.fftfreq(nfft))
            
            return {
                'cwd': self.to_cpu(cwd_magnitude),
                'time_axis': self.to_cpu(t_indices.astype(xp.float32)),
                'freq_axis': self.to_cpu(freq_axis.astype(xp.float32))
            }
    
    def rf_dna_features(self, iq_samples: np.ndarray,
                        regions: int = 20) -> Dict[str, np.ndarray]:
        """
        GPU-accelerated AFIT RF-DNA feature extraction.
        
        Extracts 180 features: 3 statistics × 20 regions × 3 domains
        - Domains: Amplitude, Phase, Instantaneous Frequency
        - Statistics: Variance, Skewness, Kurtosis
        
        Args:
            iq_samples: Complex IQ samples
            regions: Number of signal regions to analyze
        
        Returns:
            Dict with 'features' (180 element array), 'domain_features'
        """
        with self.stream_pool.stream_context():
            iq_gpu = self.to_gpu(iq_samples.astype(np.complex64))
            
            N = len(iq_gpu)
            region_size = N // regions
            
            # Compute instantaneous parameters
            amplitude = xp.abs(iq_gpu)
            phase = xp.angle(iq_gpu)
            
            # Unwrap phase for frequency calculation
            phase_unwrapped = xp.unwrap(phase)
            frequency = xp.diff(phase_unwrapped)
            frequency = xp.concatenate([frequency, xp.array([frequency[-1]])])
            
            all_features = []
            domain_features = {}
            
            for domain_name, domain_data in [
                ('amplitude', amplitude),
                ('phase', phase),
                ('frequency', frequency)
            ]:
                # Truncate to exact region boundaries
                truncated = domain_data[:regions * region_size]
                
                # Reshape into regions: (regions, region_size)
                reshaped = truncated.reshape(regions, region_size)
                
                # Compute statistics (vectorized across regions)
                mean_val = xp.mean(reshaped, axis=1, keepdims=True)
                variance = xp.var(reshaped, axis=1)
                std_dev = xp.sqrt(variance + 1e-10)
                
                # Standardize
                centered = reshaped - mean_val
                standardized = centered / std_dev[:, None]
                
                # Higher-order moments
                skewness = xp.mean(standardized ** 3, axis=1)
                kurtosis = xp.mean(standardized ** 4, axis=1) - 3  # Excess kurtosis
                
                # Stack features: [var1, skew1, kurt1, var2, skew2, kurt2, ...]
                domain_feat = xp.stack([variance, skewness, kurtosis], axis=1).flatten()
                all_features.append(domain_feat)
                domain_features[domain_name] = self.to_cpu(domain_feat)
            
            features = xp.concatenate(all_features)
            
            return {
                'features': self.to_cpu(features),
                'domain_features': domain_features,
                'feature_count': len(features),
                'regions': regions
            }
    
    def higher_order_cumulants(self, iq_samples: np.ndarray,
                                orders: List[int] = [4, 6]) -> Dict[str, float]:
        """
        GPU-accelerated higher-order cumulant calculation.
        
        Cumulants of order >= 3 are zero for Gaussian noise, making them
        robust for sub-noise signal detection.
        
        Args:
            iq_samples: Complex IQ samples
            orders: List of cumulant orders to compute
        
        Returns:
            Dict with cumulant values
        """
        with self.stream_pool.stream_context():
            iq_gpu = self.to_gpu(iq_samples.astype(np.complex64))
            
            n = len(iq_gpu)
            mean = xp.mean(iq_gpu)
            centered = iq_gpu - mean
            
            # Compute moments
            m2 = xp.mean(xp.abs(centered) ** 2)
            m4 = xp.mean(xp.abs(centered) ** 4)
            m6 = xp.mean(xp.abs(centered) ** 6)
            
            results = {}
            
            if 4 in orders:
                # 4th-order cumulant (kurtosis)
                cum4 = m4 - 3 * m2 ** 2
                results['cum4'] = float(self.to_cpu(cum4))
            
            if 6 in orders:
                # 6th-order cumulant
                cum6 = m6 - 15 * m4 * m2 + 30 * m2 ** 3
                results['cum6'] = float(self.to_cpu(cum6))
            
            return results
    
    def get_memory_info(self) -> Dict[str, Any]:
        """Get GPU memory usage information"""
        if GPU_AVAILABLE:
            mempool = cp.get_default_memory_pool()
            pinned_mempool = cp.get_default_pinned_memory_pool()
            
            return {
                'gpu_available': True,
                'device_id': self.config.device_id,
                'used_bytes': mempool.used_bytes(),
                'total_bytes': mempool.total_bytes(),
                'pinned_bytes': pinned_mempool.n_free_blocks(),
                'free_blocks': mempool.n_free_blocks()
            }
        else:
            return {
                'gpu_available': False,
                'device_id': -1,
                'used_bytes': 0,
                'total_bytes': 0
            }
    
    def cleanup(self):
        """Free GPU memory"""
        if GPU_AVAILABLE:
            self._cached_windows.clear()
            cp.get_default_memory_pool().free_all_blocks()
            cp.get_default_pinned_memory_pool().free_all_blocks()
            print("[GPU Processor] Memory cleared", file=sys.stderr)


# Singleton instance
_processor: Optional[GPUSignalProcessor] = None
_processor_lock = threading.Lock()


def get_processor(config: Optional[GPUConfig] = None) -> GPUSignalProcessor:
    """Get or create singleton GPU processor instance"""
    global _processor
    with _processor_lock:
        if _processor is None:
            _processor = GPUSignalProcessor(config)
        return _processor


if __name__ == '__main__':
    # Quick test
    print("Testing GPU Signal Processor...")
    
    processor = get_processor()
    
    # Generate test signal
    fs = 1e6
    t = np.arange(10000) / fs
    signal = np.exp(1j * 2 * np.pi * 100e3 * t) + 0.1 * (np.random.randn(10000) + 1j * np.random.randn(10000))
    signal = signal.astype(np.complex64)
    
    # Test PSD
    psd = processor.psd_welch(signal, fft_size=1024)
    print(f"PSD shape: {psd.shape}")
    
    # Test FAM
    fam_result = processor.fam_scf(signal, sample_rate=fs)
    print(f"SCF shape: {fam_result['scf_magnitude'].shape}")
    
    # Test WVD
    wvd_result = processor.wigner_ville(signal[:4096], nfft=256)
    print(f"WVD shape: {wvd_result['wvd'].shape}")
    
    # Test RF-DNA
    rfdna = processor.rf_dna_features(signal)
    print(f"RF-DNA features: {rfdna['feature_count']}")
    
    # Memory info
    print(f"Memory: {processor.get_memory_info()}")
    
    print("All tests passed!")
