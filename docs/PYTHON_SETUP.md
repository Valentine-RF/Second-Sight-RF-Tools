# Python Environment Setup Guide

**Application:** Second Sight RF Tools  
**Version:** 1.0.0  
**Last Updated:** December 8, 2024  
**Author:** Manus AI

---

## Overview

This guide provides detailed instructions for setting up the Python environment required for **Second Sight RF Tools**. The application uses Python for compute-intensive signal processing tasks including FFT computation, cyclostationary analysis, machine learning inference, and hardware SDR integration.

### Python Architecture

The application uses a **hybrid architecture** where Node.js handles HTTP requests and API routing while Python performs signal processing computations. The Node.js backend spawns Python child processes and communicates via stdin/stdout or ZeroMQ for long-running GPU services.

### Deployment Modes

The Python environment can be configured in three modes:

**CPU-Only Mode** uses NumPy and SciPy for signal processing without GPU acceleration. PyTorch runs in CPU mode for machine learning inference. This mode is suitable for development, testing, and low-volume production deployments.

**GPU-Accelerated Mode** adds CuPy for GPU-accelerated NumPy operations and CUDA-enabled PyTorch for ML inference. This mode requires NVIDIA GPU hardware with CUDA Compute Capability 7.0 or higher and provides significant performance improvements for large signal files.

**Full Production Mode** includes all dependencies from GPU mode plus SoapySDR for hardware SDR integration, ZeroMQ for GPU service communication, and Apache Arrow for zero-copy data serialization. This mode is recommended for production forensic analysis deployments.

---

## Prerequisites

### System Requirements

Before installing Python dependencies, ensure the following system requirements are met:

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Ubuntu 20.04 LTS | Ubuntu 22.04 LTS |
| **Python** | 3.10 | 3.11 |
| **RAM** | 8 GB | 32 GB |
| **Storage** | 10 GB free | 50 GB free |
| **GPU** | None (CPU mode) | NVIDIA RTX 3060+ |
| **CUDA** | N/A | 12.x |

### Build Tools

Install required build tools and system libraries:

```bash
# Update package index
sudo apt update && sudo apt upgrade -y

# Install build essentials
sudo apt install -y build-essential cmake pkg-config git

# Install Python development headers
sudo apt install -y python3.11-dev python3.11-venv python3-pip

# Install BLAS/LAPACK libraries (required for NumPy/SciPy)
sudo apt install -y libopenblas-dev liblapack-dev

# Install HDF5 libraries (optional, for large dataset storage)
sudo apt install -y libhdf5-dev

# Install FFTW3 libraries (optional, for faster FFT computation)
sudo apt install -y libfftw3-dev
```

---

## Virtual Environment Setup

### Creating Virtual Environment

Create an isolated Python environment to avoid conflicts with system packages:

```bash
# Navigate to project directory
cd /opt/Second-Sight-RF-Tools

# Create virtual environment with Python 3.11
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Verify Python version
python --version  # Should output: Python 3.11.x

# Upgrade pip, setuptools, and wheel
pip install --upgrade pip setuptools wheel
```

### Activating Virtual Environment

The virtual environment must be activated before running Python scripts:

```bash
# Activate (Linux/macOS)
source venv/bin/activate

# Deactivate when done
deactivate
```

For production deployments, configure the Node.js backend to use the virtual environment Python interpreter:

```bash
# Add to .env file
echo "PYTHON_PATH=/opt/Second-Sight-RF-Tools/venv/bin/python3" >> .env
```

---

## Core Dependencies

### NumPy Installation

NumPy provides vectorized numerical computing and is the foundation for all signal processing operations:

```bash
# Activate virtual environment
source venv/bin/activate

# Install NumPy
pip install numpy==1.26.4

# Verify installation
python -c "import numpy as np; print(f'NumPy version: {np.__version__}')"
python -c "import numpy as np; print(f'BLAS info: {np.show_config()}')"
```

**Performance Note:** NumPy automatically detects and uses optimized BLAS libraries (OpenBLAS, MKL) if available. Verify that OpenBLAS is detected in the BLAS info output for optimal performance.

### SciPy Installation

SciPy provides scientific algorithms including signal processing, optimization, and statistics:

```bash
# Install SciPy
pip install scipy==1.11.4

# Verify installation
python -c "import scipy; print(f'SciPy version: {scipy.__version__}')"
python -c "from scipy import signal; print('Signal processing module loaded')"
```

### Matplotlib Installation (Optional)

Matplotlib is used for plotting and visualization in Python scripts:

```bash
# Install Matplotlib
pip install matplotlib==3.8.2

# Verify installation
python -c "import matplotlib; print(f'Matplotlib version: {matplotlib.__version__}')"
```

---

## PyTorch Installation

### CPU-Only Installation

For deployments without GPU hardware, install the CPU-only version of PyTorch:

```bash
# Install PyTorch CPU version
pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2 --index-url https://download.pytorch.org/whl/cpu

# Verify installation
python -c "import torch; print(f'PyTorch version: {torch.__version__}')"
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"  # Should be False
```

### GPU-Accelerated Installation

For deployments with NVIDIA GPU hardware, install the CUDA-enabled version:

```bash
# Uninstall CPU version if already installed
pip uninstall -y torch torchvision torchaudio

# Install PyTorch with CUDA 12.1 support
pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2 --index-url https://download.pytorch.org/whl/cu121

# Verify CUDA support
python -c "import torch; print(f'PyTorch version: {torch.__version__}')"
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"  # Should be True
python -c "import torch; print(f'CUDA version: {torch.version.cuda}')"
python -c "import torch; print(f'GPU count: {torch.cuda.device_count()}')"
python -c "import torch; print(f'GPU name: {torch.cuda.get_device_name(0)}')"
```

### Testing PyTorch

Create a simple test script to verify PyTorch functionality:

```python
# test_pytorch.py
import torch
import time

# Create test tensor
x = torch.randn(1000, 1000)

# CPU benchmark
start = time.time()
y_cpu = torch.mm(x, x)
cpu_time = time.time() - start
print(f"CPU time: {cpu_time:.4f}s")

# GPU benchmark (if available)
if torch.cuda.is_available():
    x_gpu = x.cuda()
    torch.cuda.synchronize()
    start = time.time()
    y_gpu = torch.mm(x_gpu, x_gpu)
    torch.cuda.synchronize()
    gpu_time = time.time() - start
    print(f"GPU time: {gpu_time:.4f}s")
    print(f"Speedup: {cpu_time / gpu_time:.2f}x")
```

Run the test:

```bash
python test_pytorch.py
```

---

## TorchSig Installation

TorchSig provides datasets and models for RF signal processing and modulation classification:

```bash
# Install TorchSig from GitHub
pip install git+https://github.com/TorchDSP/torchsig.git

# Verify installation
python -c "import torchsig; print('TorchSig installed successfully')"
python -c "from torchsig.datasets import ModulationsDataset; print('Datasets module loaded')"
python -c "from torchsig.models import EfficientNet; print('Models module loaded')"
```

### Downloading Pre-trained Models

TorchSig provides pre-trained models for modulation classification:

```python
# download_models.py
from torchsig.models import EfficientNet
import torch

# Load pre-trained model
model = EfficientNet(
    input_channels=2,  # I/Q channels
    num_classes=24,    # Number of modulation types
)

# Download weights (if available)
# model.load_state_dict(torch.load('efficientnet_modulation_classifier.pt'))

print("Model loaded successfully")
print(f"Parameters: {sum(p.numel() for p in model.parameters())}")
```

---

## CUDA and CuPy Installation

### CUDA Toolkit Installation

Install NVIDIA CUDA Toolkit for GPU acceleration:

```bash
# Add NVIDIA package repository
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update

# Install CUDA Toolkit 12.3
sudo apt install -y cuda-toolkit-12-3

# Add CUDA to PATH and LD_LIBRARY_PATH
echo 'export PATH=/usr/local/cuda-12.3/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.3/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc

# Verify CUDA installation
nvcc --version
nvidia-smi
```

### CuPy Installation

CuPy provides GPU-accelerated NumPy operations:

```bash
# Activate virtual environment
source venv/bin/activate

# Install CuPy for CUDA 12.x
pip install cupy-cuda12x==13.0.0

# Verify installation
python -c "import cupy as cp; print(f'CuPy version: {cp.__version__}')"
python -c "import cupy as cp; print(f'CUDA available: {cp.cuda.is_available()}')"
python -c "import cupy as cp; print(f'CUDA version: {cp.cuda.runtime.runtimeGetVersion()}')"
```

### Testing CuPy

Create a benchmark script to compare NumPy vs CuPy performance:

```python
# test_cupy.py
import numpy as np
import cupy as cp
import time

# Test array size
N = 10000

# NumPy benchmark
x_np = np.random.randn(N, N).astype(np.float32)
start = time.time()
y_np = np.fft.fft2(x_np)
np_time = time.time() - start
print(f"NumPy FFT time: {np_time:.4f}s")

# CuPy benchmark
x_cp = cp.random.randn(N, N, dtype=cp.float32)
cp.cuda.Stream.null.synchronize()
start = time.time()
y_cp = cp.fft.fft2(x_cp)
cp.cuda.Stream.null.synchronize()
cp_time = time.time() - start
print(f"CuPy FFT time: {cp_time:.4f}s")
print(f"Speedup: {np_time / cp_time:.2f}x")
```

Run the benchmark:

```bash
python test_cupy.py
```

Expected output shows 10-50x speedup for FFT operations on GPU.

---

## SoapySDR Installation

SoapySDR provides a unified API for software-defined radio hardware:

### System Installation

Install SoapySDR system libraries:

```bash
# Install SoapySDR core
sudo apt install -y libsoapysdr-dev soapysdr-tools

# Install hardware modules
sudo apt install -y soapysdr-module-rtlsdr    # RTL-SDR
sudo apt install -y soapysdr-module-hackrf    # HackRF
sudo apt install -y soapysdr-module-uhd       # USRP
sudo apt install -y soapysdr-module-airspy    # Airspy

# Verify installation
SoapySDRUtil --info
```

### Python Bindings

Install Python bindings for SoapySDR:

```bash
# Activate virtual environment
source venv/bin/activate

# Install SoapySDR Python module
pip install SoapySDR

# Verify installation
python -c "import SoapySDR; print(f'SoapySDR version: {SoapySDR.getAPIVersion()}')"
python -c "from SoapySDR import Device; print('Device module loaded')"
```

### Testing SDR Hardware

List available SDR devices:

```python
# test_sdr.py
import SoapySDR

# Enumerate devices
results = SoapySDR.Device.enumerate()
print(f"Found {len(results)} SDR device(s):")
for i, result in enumerate(results):
    print(f"\nDevice {i}:")
    for key, value in result.items():
        print(f"  {key}: {value}")
```

Run the test:

```bash
python test_sdr.py
```

---

## Additional Dependencies

### ZeroMQ Installation

ZeroMQ is used for high-performance inter-process communication with the GPU service:

```bash
# Install system library
sudo apt install -y libzmq3-dev

# Install Python bindings
pip install pyzmq==25.1.2

# Verify installation
python -c "import zmq; print(f'PyZMQ version: {zmq.__version__}')"
python -c "import zmq; print(f'ZeroMQ version: {zmq.zmq_version()}')"
```

### Apache Arrow Installation

Apache Arrow provides zero-copy data serialization for efficient IQ sample transport:

```bash
# Install PyArrow
pip install pyarrow==14.0.2

# Verify installation
python -c "import pyarrow as pa; print(f'PyArrow version: {pa.__version__}')"
```

### HDF5 Installation

HDF5 is used for storing large signal datasets:

```bash
# Install h5py
pip install h5py==3.10.0

# Verify installation
python -c "import h5py; print(f'h5py version: {h5py.__version__}')"
```

---

## Requirements File

Create a `requirements.txt` file for reproducible installations:

```bash
cat > requirements.txt << 'EOF'
# Core scientific computing
numpy==1.26.4
scipy==1.11.4
matplotlib==3.8.2

# PyTorch (CPU version - replace with GPU version if needed)
--index-url https://download.pytorch.org/whl/cpu
torch==2.1.2
torchvision==0.16.2
torchaudio==2.1.2

# Signal processing and ML
git+https://github.com/TorchDSP/torchsig.git

# GPU acceleration (comment out if not using GPU)
# cupy-cuda12x==13.0.0

# Hardware integration
SoapySDR

# Data serialization and communication
pyarrow==14.0.2
pyzmq==25.1.2
h5py==3.10.0

# Utilities
tqdm==4.66.1
EOF
```

Install all dependencies:

```bash
pip install -r requirements.txt
```

For GPU deployments, create a separate `requirements-gpu.txt`:

```bash
cat > requirements-gpu.txt << 'EOF'
# All dependencies from requirements.txt plus GPU-specific packages

# PyTorch GPU version
--index-url https://download.pytorch.org/whl/cu121
torch==2.1.2
torchvision==0.16.2
torchaudio==2.1.2

# CuPy for GPU-accelerated NumPy
cupy-cuda12x==13.0.0
EOF
```

---

## Verification Script

Create a comprehensive verification script to test all dependencies:

```python
# verify_environment.py
import sys

def check_module(name, import_name=None, version_attr='__version__'):
    """Check if a module is installed and print version."""
    if import_name is None:
        import_name = name
    
    try:
        module = __import__(import_name)
        version = getattr(module, version_attr, 'unknown')
        print(f"✓ {name}: {version}")
        return True
    except ImportError:
        print(f"✗ {name}: NOT INSTALLED")
        return False

print("=" * 60)
print("Python Environment Verification")
print("=" * 60)

print(f"\nPython version: {sys.version}")
print(f"Python executable: {sys.executable}")

print("\n--- Core Dependencies ---")
check_module("NumPy", "numpy")
check_module("SciPy", "scipy")
check_module("Matplotlib", "matplotlib")

print("\n--- PyTorch ---")
has_torch = check_module("PyTorch", "torch")
if has_torch:
    import torch
    print(f"  CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"  CUDA version: {torch.version.cuda}")
        print(f"  GPU count: {torch.cuda.device_count()}")
        print(f"  GPU name: {torch.cuda.get_device_name(0)}")

print("\n--- TorchSig ---")
check_module("TorchSig", "torchsig")

print("\n--- GPU Acceleration ---")
has_cupy = check_module("CuPy", "cupy")
if has_cupy:
    import cupy as cp
    print(f"  CUDA available: {cp.cuda.is_available()}")
    if cp.cuda.is_available():
        print(f"  CUDA version: {cp.cuda.runtime.runtimeGetVersion()}")

print("\n--- Hardware Integration ---")
check_module("SoapySDR")

print("\n--- Data Serialization ---")
check_module("PyArrow", "pyarrow")
check_module("PyZMQ", "zmq")
check_module("h5py")

print("\n" + "=" * 60)
print("Verification complete!")
print("=" * 60)
```

Run the verification script:

```bash
python verify_environment.py
```

---

## Troubleshooting

### NumPy/SciPy Build Errors

If NumPy or SciPy fail to install due to build errors:

```bash
# Install BLAS/LAPACK libraries
sudo apt install -y libopenblas-dev liblapack-dev

# Install gfortran compiler
sudo apt install -y gfortran

# Retry installation
pip install --no-cache-dir numpy scipy
```

### PyTorch CUDA Mismatch

If PyTorch reports CUDA version mismatch:

```bash
# Check CUDA version
nvcc --version

# Install matching PyTorch version
# For CUDA 11.8:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# For CUDA 12.1:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### CuPy Installation Errors

If CuPy fails to install:

```bash
# Verify CUDA installation
nvcc --version
nvidia-smi

# Install correct CuPy version for your CUDA
# For CUDA 11.x:
pip install cupy-cuda11x

# For CUDA 12.x:
pip install cupy-cuda12x

# If still failing, install from source
pip install cupy --no-binary cupy
```

### SoapySDR Device Not Found

If SDR hardware is not detected:

```bash
# Check USB permissions
sudo usermod -a -G plugdev $USER
sudo udevadm control --reload-rules
sudo udevadm trigger

# Restart udev service
sudo systemctl restart udev

# Re-enumerate devices
SoapySDRUtil --find

# Check kernel modules
lsmod | grep rtl
lsmod | grep hackrf
```

### Memory Errors

If Python processes run out of memory:

```bash
# Increase swap space
sudo fallocate -l 16G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Performance Optimization

### NumPy Optimization

Verify NumPy is using optimized BLAS:

```python
import numpy as np
np.show_config()
```

Look for `openblas_info` or `mkl_info` in the output. If not present, install optimized BLAS:

```bash
# Install OpenBLAS
sudo apt install -y libopenblas-dev

# Or install Intel MKL (better performance)
pip install mkl mkl-service
```

### PyTorch Optimization

Enable PyTorch optimizations:

```python
# In your Python scripts
import torch

# Enable cuDNN benchmark mode (finds optimal algorithms)
torch.backends.cudnn.benchmark = True

# Enable TF32 for faster matrix multiplication on Ampere GPUs
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True
```

### CuPy Memory Pool

Configure CuPy memory pool for better performance:

```python
import cupy as cp

# Set memory pool size (in bytes)
mempool = cp.get_default_memory_pool()
mempool.set_limit(size=8 * 1024**3)  # 8 GB

# Use pinned memory for faster CPU-GPU transfers
pinned_mempool = cp.get_default_pinned_memory_pool()
pinned_mempool.set_limit(size=2 * 1024**3)  # 2 GB
```

---

## Conclusion

This guide provides comprehensive instructions for setting up the Python environment for **Second Sight RF Tools**. The environment supports three deployment modes (CPU-only, GPU-accelerated, Full Production) with detailed installation steps for all dependencies.

**Key Points:**

- Python 3.11 is recommended for optimal performance and compatibility
- Virtual environments isolate dependencies and prevent conflicts
- GPU acceleration requires NVIDIA CUDA 12.x and CuPy
- SoapySDR enables hardware SDR integration
- Comprehensive verification scripts ensure correct installation

For additional support, refer to the main [DEPLOYMENT.md](../DEPLOYMENT.md) guide or contact the development team.

---

**Document Version:** 1.0.0  
**Last Updated:** December 8, 2024  
**Maintained By:** Manus AI
