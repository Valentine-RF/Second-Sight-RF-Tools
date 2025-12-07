"""
CUDA-Accelerated Signal Processing for Second Sight RF Forensics

This module provides GPU-accelerated implementations of:
- Power Spectral Density (Welch's method)
- FAM Cyclostationary Analysis (Spectral Correlation Function)
- Wigner-Ville Distribution (and variants: PWVD, SPWVD)
- Choi-Williams Distribution
- RF-DNA Feature Extraction
- Higher-Order Cumulants

Usage:
    from cuda_accelerated import get_processor
    
    processor = get_processor()
    psd = processor.psd_welch(iq_samples)
    fam_result = processor.fam_scf(iq_samples, sample_rate=1e6)
"""

from .gpu_processor import (
    GPUSignalProcessor,
    GPUConfig,
    CUDAStreamPool,
    get_processor,
    GPU_AVAILABLE
)

__all__ = [
    'GPUSignalProcessor',
    'GPUConfig',
    'CUDAStreamPool',
    'get_processor',
    'GPU_AVAILABLE'
]

__version__ = '1.0.0'
