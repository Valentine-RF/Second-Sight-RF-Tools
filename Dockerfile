# Multi-stage Dockerfile for Second Sight RF Tools
# Supports both CPU-only and GPU-accelerated deployments

# =============================================================================
# Stage 1: Base image with NVIDIA CUDA support
# =============================================================================
FROM nvidia/cuda:12.3.1-cudnn9-devel-ubuntu22.04 AS base

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    CUDA_HOME=/usr/local/cuda \
    PATH=/usr/local/cuda/bin:$PATH \
    LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Build tools
    build-essential \
    cmake \
    pkg-config \
    git \
    curl \
    wget \
    ca-certificates \
    # Python dependencies
    python3.11 \
    python3.11-dev \
    python3.11-venv \
    python3-pip \
    # Scientific computing libraries
    libopenblas-dev \
    liblapack-dev \
    libfftw3-dev \
    libhdf5-dev \
    gfortran \
    # SDR hardware support
    libsoapysdr-dev \
    soapysdr-tools \
    soapysdr-module-rtlsdr \
    soapysdr-module-hackrf \
    # Communication libraries
    libzmq3-dev \
    # Utilities
    vim \
    htop \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22.x
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm \
    && rm -rf /var/lib/apt/lists/*

# Create application user
RUN useradd -m -u 1000 -s /bin/bash forensic && \
    mkdir -p /app && \
    chown -R forensic:forensic /app

# Set working directory
WORKDIR /app

# =============================================================================
# Stage 2: Python dependencies builder
# =============================================================================
FROM base AS python-builder

USER forensic

# Create Python virtual environment
RUN python3.11 -m venv /app/venv

# Activate virtual environment
ENV PATH="/app/venv/bin:$PATH"

# Upgrade pip and install build tools
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Copy Python requirements
COPY --chown=forensic:forensic requirements.txt requirements-gpu.txt ./

# Install Python dependencies
# Core dependencies
RUN pip install --no-cache-dir numpy==1.26.4 scipy==1.11.4 matplotlib==3.8.2

# PyTorch with CUDA support
RUN pip install --no-cache-dir \
    torch==2.1.2 \
    torchvision==0.16.2 \
    torchaudio==2.1.2 \
    --index-url https://download.pytorch.org/whl/cu121

# CuPy for GPU-accelerated NumPy
RUN pip install --no-cache-dir cupy-cuda12x==13.0.0

# TorchSig for modulation classification
RUN pip install --no-cache-dir git+https://github.com/TorchDSP/torchsig.git

# Hardware and communication libraries
RUN pip install --no-cache-dir \
    SoapySDR \
    pyzmq==25.1.2 \
    pyarrow==14.0.2 \
    h5py==3.10.0 \
    tqdm==4.66.1

# =============================================================================
# Stage 3: Node.js dependencies builder
# =============================================================================
FROM base AS node-builder

USER forensic

# Copy package files
COPY --chown=forensic:forensic package.json pnpm-lock.yaml ./

# Install Node.js dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy application source
COPY --chown=forensic:forensic . .

# Build frontend
RUN pnpm run build

# =============================================================================
# Stage 4: Production image
# =============================================================================
FROM base AS production

USER forensic

# Copy Python virtual environment from builder
COPY --from=python-builder --chown=forensic:forensic /app/venv /app/venv

# Copy Node.js dependencies and built assets from builder
COPY --from=node-builder --chown=forensic:forensic /app/node_modules /app/node_modules
COPY --from=node-builder --chown=forensic:forensic /app/dist /app/dist
COPY --from=node-builder --chown=forensic:forensic /app/client/dist /app/client/dist

# Copy application source
COPY --chown=forensic:forensic . .

# Set Python path to use virtual environment
ENV PATH="/app/venv/bin:$PATH" \
    PYTHON_PATH="/app/venv/bin/python3"

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start application
CMD ["pnpm", "start"]

# =============================================================================
# Stage 5: Development image
# =============================================================================
FROM base AS development

USER forensic

# Copy Python virtual environment from builder
COPY --from=python-builder --chown=forensic:forensic /app/venv /app/venv

# Copy package files
COPY --chown=forensic:forensic package.json pnpm-lock.yaml ./

# Install all Node.js dependencies (including dev dependencies)
RUN pnpm install --frozen-lockfile

# Set Python path
ENV PATH="/app/venv/bin:$PATH" \
    PYTHON_PATH="/app/venv/bin/python3" \
    NODE_ENV=development

# Expose application port and Vite HMR port
EXPOSE 3000 5173

# Start development server
CMD ["pnpm", "run", "dev"]

# =============================================================================
# Stage 6: CPU-only production image (without CUDA)
# =============================================================================
FROM ubuntu:22.04 AS production-cpu

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production

# Install system dependencies (without CUDA)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    pkg-config \
    git \
    curl \
    wget \
    ca-certificates \
    python3.11 \
    python3.11-dev \
    python3.11-venv \
    python3-pip \
    libopenblas-dev \
    liblapack-dev \
    libfftw3-dev \
    libhdf5-dev \
    gfortran \
    libsoapysdr-dev \
    soapysdr-tools \
    libzmq3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22.x
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm \
    && rm -rf /var/lib/apt/lists/*

# Create application user
RUN useradd -m -u 1000 -s /bin/bash forensic && \
    mkdir -p /app && \
    chown -R forensic:forensic /app

WORKDIR /app
USER forensic

# Create Python virtual environment and install CPU-only dependencies
RUN python3.11 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

COPY --chown=forensic:forensic requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir numpy==1.26.4 scipy==1.11.4 matplotlib==3.8.2 && \
    pip install --no-cache-dir \
        torch==2.1.2 \
        torchvision==0.16.2 \
        torchaudio==2.1.2 \
        --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir \
        git+https://github.com/TorchDSP/torchsig.git \
        SoapySDR \
        pyzmq==25.1.2 \
        pyarrow==14.0.2 \
        h5py==3.10.0 \
        tqdm==4.66.1

# Copy Node.js dependencies and built assets
COPY --from=node-builder --chown=forensic:forensic /app/node_modules /app/node_modules
COPY --from=node-builder --chown=forensic:forensic /app/dist /app/dist
COPY --from=node-builder --chown=forensic:forensic /app/client/dist /app/client/dist

# Copy application source
COPY --chown=forensic:forensic . .

ENV PYTHON_PATH="/app/venv/bin/python3"

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["pnpm", "start"]
