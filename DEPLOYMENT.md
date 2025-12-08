# Second Sight RF Tools - Deployment Guide

**Version:** 1.0.0  
**Last Updated:** December 8, 2024  
**Author:** Manus AI  
**Target Audience:** Backend Engineers, DevOps, System Administrators

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [System Requirements](#system-requirements)
4. [Pre-Deployment Checklist](#pre-deployment-checklist)
5. [Installation Steps](#installation-steps)
6. [Environment Configuration](#environment-configuration)
7. [Database Setup](#database-setup)
8. [Python Environment Setup](#python-environment-setup)
9. [GPU Acceleration Setup](#gpu-acceleration-setup)
10. [Storage Configuration](#storage-configuration)
11. [Service Management](#service-management)
12. [Monitoring & Health Checks](#monitoring--health-checks)
13. [Troubleshooting](#troubleshooting)
14. [Security Considerations](#security-considerations)
15. [Performance Tuning](#performance-tuning)

---

## Executive Summary

**Second Sight RF Tools** is a professional forensic signal processing web application designed for RF analysis, featuring GPU-accelerated DSP algorithms, WebGL visualizations, and advanced machine learning capabilities. This deployment guide provides comprehensive instructions for backend engineers to deploy and maintain the application in production environments.

### Key Features

The application provides a complete forensic signal analysis platform with the following capabilities:

- **SigMF file format support** with automatic metadata validation and SHA512 integrity checking
- **Real-time signal processing** including FFT, PSD, cyclostationary analysis (FAM algorithm), and blind modulation classification
- **GPU-accelerated algorithms** using CuPy and PyTorch for high-performance signal processing
- **WebGL visualizations** with spectrograms, constellation plots, and 3D SCF surfaces
- **Advanced ML capabilities** including TorchSig modulation classification, RF-DNA fingerprinting, and anomaly detection
- **Multi-file upload** with progress tracking supporting files up to 10GB
- **S3-compatible storage** for signal data with HTTP Range request support for streaming
- **Real-time SDR streaming** via SoapySDR integration with WebSocket data transport

### Technology Stack

The application is built on a modern full-stack architecture:

| Component | Technology | Version |
|-----------|-----------|---------|
| **Frontend** | React 19 + TypeScript + Vite | 19.x / 5.x / 5.x |
| **Backend** | Node.js + Express + tRPC | 22.x / 4.x / 11.x |
| **Database** | PostgreSQL (with in-memory fallback) | 14+ |
| **Storage** | S3-compatible (Manus built-in) | N/A |
| **Python Runtime** | Python 3.10+ | 3.10+ |
| **GPU Computing** | CUDA 12.x + CuPy | 12.x / 13.x |
| **ML Framework** | PyTorch 2.x + TorchSig | 2.x / latest |
| **SDR Integration** | SoapySDR + Python bindings | 0.8+ |

### Deployment Models

The application supports three deployment configurations:

**Development Mode** uses an in-memory database fallback when `DATABASE_URL` is not set, making it ideal for local development and testing without external dependencies.

**Production Mode (CPU)** runs with PostgreSQL database and S3 storage but without GPU acceleration, suitable for environments where GPU hardware is not available or cost-prohibitive.

**Production Mode (GPU)** includes full GPU acceleration via CUDA and CuPy, providing optimal performance for signal processing workloads and recommended for production forensic analysis deployments.

---

## System Architecture

### High-Level Architecture

The application follows a hybrid architecture combining Node.js for the web server and API layer with Python for compute-intensive signal processing tasks.

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (Browser)                        │
│  React + TypeScript + WebGL + Three.js + Web Workers       │
└─────────────────┬───────────────────────────┬───────────────┘
                  │                           │
                  │ HTTP/tRPC                 │ WebSocket
                  │                           │
┌─────────────────▼───────────────────────────▼───────────────┐
│              Node.js Backend (Express + tRPC)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ REST Upload  │  │ tRPC Router  │  │ WebSocket    │     │
│  │ Endpoints    │  │ (Type-safe)  │  │ Server       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Auth         │  │ File Stream  │  │ Job Queue    │     │
│  │ Middleware   │  │ Handler      │  │ (BullMQ)     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────┬───────────────────────────┬───────────────┘
                  │                           │
                  │ child_process             │ ZeroMQ
                  │                           │
┌─────────────────▼───────────────────────────▼───────────────┐
│           Python Processing Layer (DSP/ML)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ NumPy/SciPy  │  │ CuPy (GPU)   │  │ PyTorch      │     │
│  │ DSP          │  │ Acceleration │  │ TorchSig     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ SoapySDR     │  │ GPU Service  │  │ Demodulation │     │
│  │ Bridge       │  │ (ZeroMQ)     │  │ Pipeline     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                  │                           │
                  ▼                           ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│   PostgreSQL Database       │ │   S3-Compatible Storage     │
│   (or in-memory fallback)   │ │   (Signal IQ Data Files)    │
└─────────────────────────────┘ └─────────────────────────────┘
```

### Data Flow

**File Upload Flow** begins when a user uploads SigMF or raw IQ files through the frontend. The files are sent to the Express REST endpoint (`/api/upload/sigmf` or `/api/upload/raw-iq`) using multipart form data with multer middleware handling the upload. The backend validates file types and sizes (max 10GB), uploads files to S3 storage using the `storagePut` utility, creates database records with metadata, and returns the capture ID and file URLs to the client.

**Signal Analysis Flow** starts when a user selects a signal region in the spectrogram and triggers an analysis action (FAM, classification, demodulation). The frontend sends a tRPC mutation with capture ID and sample range parameters. The Node.js backend fetches IQ data from S3 using HTTP Range requests, spawns a Python child process with the appropriate script, passes IQ samples via stdin or temporary files, waits for Python to complete processing, parses JSON results from stdout, and returns results to the frontend for visualization.

**Real-Time Streaming Flow** occurs when a user starts SDR streaming from the Live Streaming panel. The frontend sends a tRPC mutation to start the streaming session. The Node.js backend spawns the Python SoapySDR bridge script, which opens the SDR device and begins IQ sample acquisition. The Python script computes FFT and sends data to the Node.js WebSocket server. The WebSocket server broadcasts FFT data to connected clients, and the frontend updates the waterfall display in real-time.

### Component Responsibilities

**Node.js Backend** handles HTTP request routing and authentication, tRPC procedure execution with type safety, file upload with multer middleware, S3 storage operations via REST API, database CRUD operations with Drizzle ORM, WebSocket server for real-time updates, job queue management with BullMQ, and Python process lifecycle management.

**Python Processing Layer** performs signal processing algorithms including FFT, PSD, FAM, SNR estimation, CFO estimation, GPU-accelerated computations with CuPy, machine learning inference with PyTorch and TorchSig, SoapySDR hardware control, demodulation pipelines for RTTY, PSK31, and CW, and RF-DNA fingerprinting with 180-feature extraction.

**Frontend (React)** provides the user interface with file upload and management, WebGL-accelerated visualizations including spectrograms, constellation plots, and waterfall displays, Three.js 3D SCF surface rendering, Web Worker for off-thread FFT computation, annotation creation and editing, real-time progress tracking, and WebSocket client for streaming data.

---

## System Requirements

### Hardware Requirements

**Minimum Configuration (Development/Testing):**
- CPU: 4 cores (Intel i5 or AMD Ryzen 5 equivalent)
- RAM: 8 GB
- Storage: 50 GB SSD
- Network: 100 Mbps

**Recommended Configuration (Production - CPU Only):**
- CPU: 8+ cores (Intel Xeon or AMD EPYC)
- RAM: 32 GB
- Storage: 500 GB NVMe SSD
- Network: 1 Gbps

**Optimal Configuration (Production - GPU Accelerated):**
- CPU: 16+ cores (Intel Xeon or AMD EPYC)
- RAM: 64 GB
- GPU: NVIDIA GPU with CUDA Compute Capability 7.0+ (RTX 3060 or better)
- VRAM: 8 GB+ (12 GB recommended)
- Storage: 1 TB NVMe SSD
- Network: 10 Gbps

### Software Requirements

**Operating System:**
- Ubuntu 22.04 LTS (recommended)
- Debian 11+
- CentOS 8+ / Rocky Linux 8+
- Other Linux distributions with kernel 5.10+

**Runtime Dependencies:**
- Node.js 22.x (LTS)
- Python 3.10+ (3.11 recommended)
- PostgreSQL 14+ (optional, in-memory fallback available)
- Redis 7+ (for BullMQ job queue)
- CUDA Toolkit 12.x (for GPU acceleration)

**Build Tools:**
- GCC 9+ or Clang 10+
- CMake 3.18+
- pkg-config
- Git 2.30+

### Network Requirements

The application requires the following network access:

**Inbound:**
- Port 3000 (HTTP/WebSocket) - Main application server
- Port 5432 (PostgreSQL) - Database connections (if external DB)
- Port 6379 (Redis) - Job queue (if external Redis)

**Outbound:**
- Port 443 (HTTPS) - S3 storage API, package repositories
- Port 80 (HTTP) - Package repositories

---

## Pre-Deployment Checklist

Before beginning deployment, verify the following prerequisites are met:

### Infrastructure Readiness

- [ ] Server or VM provisioned with adequate CPU, RAM, and storage
- [ ] Operating system installed and updated (`apt update && apt upgrade`)
- [ ] Firewall rules configured to allow required ports
- [ ] SSL/TLS certificates obtained (if deploying with HTTPS)
- [ ] DNS records configured (if using custom domain)

### Database Readiness

- [ ] PostgreSQL server accessible (or plan to use in-memory fallback)
- [ ] Database created with appropriate character encoding (UTF-8)
- [ ] Database user created with necessary privileges
- [ ] Connection string tested and verified
- [ ] Backup and recovery procedures established

### Storage Readiness

- [ ] S3-compatible storage endpoint accessible
- [ ] Storage bucket created with appropriate permissions
- [ ] API credentials obtained (access key + secret key)
- [ ] Storage quota verified (minimum 100 GB recommended)
- [ ] CORS policy configured for frontend access

### Access & Credentials

- [ ] SSH access to deployment server configured
- [ ] Sudo/root privileges available for package installation
- [ ] Environment variables documented and secured
- [ ] API keys and secrets stored in secure vault
- [ ] OAuth configuration completed (if using Manus OAuth)

---

## Installation Steps

### Step 1: Install System Dependencies

Update the system package index and install required build tools and libraries:

```bash
# Update package index
sudo apt update && sudo apt upgrade -y

# Install build essentials
sudo apt install -y build-essential cmake pkg-config git curl wget

# Install Node.js 22.x via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
node --version  # Should show v22.x.x
npm --version   # Should show 10.x.x

# Install pnpm globally
npm install -g pnpm

# Install Python 3.11 and pip
sudo apt install -y python3.11 python3.11-venv python3.11-dev python3-pip

# Verify Python installation
python3.11 --version  # Should show Python 3.11.x

# Install PostgreSQL client (optional, for database access)
sudo apt install -y postgresql-client

# Install Redis (for job queue)
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### Step 2: Clone Repository

Clone the application repository from GitHub:

```bash
# Navigate to deployment directory
cd /opt

# Clone repository
sudo git clone https://github.com/Valentine-RF/Second-Sight-RF-Tools.git
cd Second-Sight-RF-Tools

# Checkout specific version (replace with desired tag/branch)
sudo git checkout main

# Set ownership to deployment user
sudo chown -R $USER:$USER /opt/Second-Sight-RF-Tools
```

### Step 3: Install Node.js Dependencies

Install all Node.js packages using pnpm:

```bash
# Install dependencies
pnpm install

# Build frontend assets
pnpm run build

# Verify installation
pnpm list --depth=0
```

### Step 4: Install Python Dependencies

Create a Python virtual environment and install required packages:

```bash
# Create virtual environment
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip setuptools wheel

# Install core dependencies
pip install numpy scipy matplotlib

# Install optional dependencies (if not using GPU)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Verify installation
python -c "import numpy; print(f'NumPy: {numpy.__version__}')"
python -c "import scipy; print(f'SciPy: {scipy.__version__}')"
python -c "import torch; print(f'PyTorch: {torch.__version__}')"
```

**Note:** GPU-specific dependencies (CuPy, CUDA-enabled PyTorch) are covered in the [GPU Acceleration Setup](#gpu-acceleration-setup) section.

### Step 5: Configure Environment Variables

Create a `.env` file in the project root with required configuration:

```bash
# Copy example environment file
cp .env.example .env

# Edit with your configuration
nano .env
```

Minimal `.env` configuration for development:

```bash
# Node environment
NODE_ENV=development

# Server configuration
PORT=3000
HOST=0.0.0.0

# Database (optional - will use in-memory fallback if not set)
# DATABASE_URL=postgresql://user:password@localhost:5432/forensic_signal_processor

# Redis (for job queue)
REDIS_URL=redis://localhost:6379

# Storage (Manus built-in S3)
# These are automatically injected by Manus platform
# BUILT_IN_FORGE_API_URL=https://api.manus.im
# BUILT_IN_FORGE_API_KEY=your_api_key

# JWT secret (for session cookies)
JWT_SECRET=your_random_secret_here_change_in_production

# OAuth (Manus built-in)
# OAUTH_SERVER_URL=https://api.manus.im
# VITE_OAUTH_PORTAL_URL=https://auth.manus.im
# VITE_APP_ID=your_app_id
```

### Step 6: Initialize Database

Run database migrations to create required tables:

```bash
# Push schema to database
pnpm db:push

# Verify tables created
psql $DATABASE_URL -c "\dt"
```

**Note:** If `DATABASE_URL` is not set, the application will automatically use an in-memory database fallback. This is suitable for development but **not recommended for production**.

### Step 7: Start Application

Start the development server:

```bash
# Start in development mode
pnpm run dev
```

The application should now be accessible at `http://localhost:3000`.

For production deployment, use:

```bash
# Build production assets
pnpm run build

# Start production server
pnpm run start
```

---

## Environment Configuration

### Required Environment Variables

The following environment variables are **required** for production deployment:

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Node environment mode | `production` |
| `PORT` | HTTP server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret key for JWT signing | `random_64_char_string` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |

### Optional Environment Variables

The following environment variables are **optional** and have sensible defaults:

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `HOST` | HTTP server bind address | `0.0.0.0` | `127.0.0.1` |
| `LOG_LEVEL` | Logging verbosity | `info` | `debug` |
| `MAX_UPLOAD_SIZE` | Max file upload size | `10GB` | `5GB` |
| `PYTHON_PATH` | Path to Python interpreter | `python3` | `/opt/python3.11/bin/python3` |

### Manus Platform Variables

When deploying on the Manus platform, the following variables are **automatically injected**:

| Variable | Description |
|----------|-------------|
| `BUILT_IN_FORGE_API_URL` | Manus API base URL |
| `BUILT_IN_FORGE_API_KEY` | Server-side API key |
| `VITE_FRONTEND_FORGE_API_KEY` | Frontend API key |
| `VITE_FRONTEND_FORGE_API_URL` | Frontend API URL |
| `OAUTH_SERVER_URL` | OAuth backend URL |
| `VITE_OAUTH_PORTAL_URL` | OAuth login portal URL |
| `VITE_APP_ID` | Application ID |
| `OWNER_OPEN_ID` | Owner's OpenID |
| `OWNER_NAME` | Owner's name |

### Generating Secure Secrets

Generate secure random secrets for production:

```bash
# Generate JWT secret (64 characters)
openssl rand -hex 32

# Generate API key (32 characters)
openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
```

---

## Database Setup

### PostgreSQL Installation

Install PostgreSQL 14+ on Ubuntu:

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start and enable service
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Verify installation
sudo -u postgres psql --version
```

### Database Creation

Create the application database and user:

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database
CREATE DATABASE forensic_signal_processor;

# Create user with password
CREATE USER forensic_user WITH ENCRYPTED PASSWORD 'your_secure_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE forensic_signal_processor TO forensic_user;

# Exit psql
\q
```

### Connection String Format

The `DATABASE_URL` environment variable should follow this format:

```
postgresql://[user]:[password]@[host]:[port]/[database]?[options]
```

Example:

```
DATABASE_URL=postgresql://forensic_user:your_secure_password@localhost:5432/forensic_signal_processor?sslmode=require
```

### Database Schema

The application uses Drizzle ORM with the following tables:

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `signal_captures` | Stores signal file metadata | `id`, `name`, `datatype`, `sampleRate`, `centerFrequency` |
| `annotations` | Stores signal annotations | `id`, `captureId`, `label`, `color`, `sampleStart`, `sampleEnd` |
| `processing_jobs` | Tracks async processing tasks | `id`, `captureId`, `type`, `status`, `result` |
| `chat_messages` | Stores chat conversation history | `id`, `captureId`, `role`, `content` |
| `comparison_sessions` | Stores comparison mode sessions | `id`, `userId`, `name`, `notes`, `captureIds` |
| `batch_jobs` | Stores batch processing jobs | `id`, `type`, `status`, `captureIds`, `results` |
| `training_datasets` | Stores ML training datasets | `id`, `name`, `format`, `fileKey`, `sampleCount` |
| `model_versions` | Tracks ML model versions | `id`, `name`, `version`, `accuracy`, `isActive` |

### In-Memory Fallback

If `DATABASE_URL` is not set, the application automatically uses an in-memory database implemented in `server/db.ts`. This fallback provides the same API but stores data in memory, making it suitable for:

- Local development without PostgreSQL
- Testing and CI/CD pipelines
- Demo environments

**Warning:** In-memory data is lost on server restart. Do not use in production.

### Database Migrations

The application uses Drizzle Kit for schema management:

```bash
# Generate migration from schema changes
pnpm drizzle-kit generate

# Push schema to database (no migration files)
pnpm db:push

# View current schema
pnpm drizzle-kit introspect
```

### Database Backup

Set up automated backups for production:

```bash
# Create backup script
cat > /opt/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/forensic-signal-processor"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/backup_$DATE.sql.gz
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
EOF

# Make executable
chmod +x /opt/backup-db.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/backup-db.sh") | crontab -
```

---

## Python Environment Setup

### Virtual Environment Creation

Create an isolated Python environment for the application:

```bash
# Navigate to project directory
cd /opt/Second-Sight-RF-Tools

# Create virtual environment with Python 3.11
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Verify Python version
python --version  # Should show Python 3.11.x
```

### Core Dependencies

Install core scientific computing libraries:

```bash
# Upgrade pip and setuptools
pip install --upgrade pip setuptools wheel

# Install NumPy (vectorized numerical computing)
pip install numpy==1.26.4

# Install SciPy (scientific algorithms)
pip install scipy==1.11.4

# Install Matplotlib (plotting, optional)
pip install matplotlib==3.8.2

# Verify installations
python -c "import numpy; print(f'NumPy {numpy.__version__}')"
python -c "import scipy; print(f'SciPy {scipy.__version__}')"
```

### PyTorch Installation (CPU)

Install PyTorch for CPU-only environments:

```bash
# Install PyTorch CPU version
pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2 --index-url https://download.pytorch.org/whl/cpu

# Verify installation
python -c "import torch; print(f'PyTorch {torch.__version__}')"
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```

### TorchSig Installation

Install TorchSig for modulation classification:

```bash
# Install TorchSig from GitHub
pip install git+https://github.com/TorchDSP/torchsig.git

# Verify installation
python -c "import torchsig; print('TorchSig installed successfully')"
```

### SoapySDR Installation (Optional)

Install SoapySDR for hardware SDR integration:

```bash
# Install system dependencies
sudo apt install -y libsoapysdr-dev soapysdr-tools

# Install Python bindings
pip install SoapySDR

# Verify installation
SoapySDRUtil --info

# Install SDR hardware modules (examples)
sudo apt install -y soapysdr-module-rtlsdr    # RTL-SDR
sudo apt install -y soapysdr-module-hackrf    # HackRF
sudo apt install -y soapysdr-module-uhd       # USRP
```

### ZeroMQ Installation

Install ZeroMQ for GPU service communication:

```bash
# Install system library
sudo apt install -y libzmq3-dev

# Install Python bindings
pip install pyzmq==25.1.2

# Verify installation
python -c "import zmq; print(f'PyZMQ {zmq.__version__}')"
```

### Apache Arrow Installation

Install Apache Arrow for zero-copy data serialization:

```bash
# Install PyArrow
pip install pyarrow==14.0.2

# Verify installation
python -c "import pyarrow; print(f'PyArrow {pyarrow.__version__}')"
```

### Requirements File

Create a `requirements.txt` for reproducible installations:

```bash
cat > requirements.txt << 'EOF'
# Core scientific computing
numpy==1.26.4
scipy==1.11.4
matplotlib==3.8.2

# PyTorch (CPU version)
--index-url https://download.pytorch.org/whl/cpu
torch==2.1.2
torchvision==0.16.2
torchaudio==2.1.2

# Signal processing
git+https://github.com/TorchDSP/torchsig.git

# Hardware integration
SoapySDR

# Data serialization
pyarrow==14.0.2
pyzmq==25.1.2

# Utilities
h5py==3.10.0
EOF

# Install all dependencies
pip install -r requirements.txt
```

### Python Path Configuration

Ensure the Node.js backend can find the Python virtual environment:

```bash
# Add to .env file
echo "PYTHON_PATH=/opt/Second-Sight-RF-Tools/venv/bin/python3" >> .env
```

The backend will use this path when spawning Python child processes.

---

## GPU Acceleration Setup

### CUDA Toolkit Installation

Install NVIDIA CUDA Toolkit 12.x:

```bash
# Add NVIDIA package repository
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update

# Install CUDA Toolkit
sudo apt install -y cuda-toolkit-12-3

# Add CUDA to PATH
echo 'export PATH=/usr/local/cuda-12.3/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.3/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc

# Verify installation
nvcc --version
nvidia-smi
```

### CuPy Installation

Install CuPy for GPU-accelerated NumPy operations:

```bash
# Activate virtual environment
source venv/bin/activate

# Install CuPy for CUDA 12.x
pip install cupy-cuda12x==13.0.0

# Verify installation
python -c "import cupy; print(f'CuPy {cupy.__version__}')"
python -c "import cupy; print(f'CUDA available: {cupy.cuda.is_available()}')"
```

### PyTorch GPU Installation

Install PyTorch with CUDA support:

```bash
# Uninstall CPU version
pip uninstall -y torch torchvision torchaudio

# Install GPU version
pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2 --index-url https://download.pytorch.org/whl/cu121

# Verify CUDA support
python -c "import torch; print(f'PyTorch {torch.__version__}')"
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
python -c "import torch; print(f'CUDA devices: {torch.cuda.device_count()}')"
```

### GPU Service Setup

The application includes a persistent GPU service for high-performance processing:

```bash
# Start GPU service manually
cd /opt/Second-Sight-RF-Tools
source venv/bin/activate
python server/python/gpu_service.py &

# Verify service is running
ps aux | grep gpu_service
```

For production, create a systemd service:

```bash
# Create service file
sudo tee /etc/systemd/system/forensic-gpu-service.service > /dev/null << 'EOF'
[Unit]
Description=Second Sight GPU Processing Service
After=network.target

[Service]
Type=simple
User=forensic
WorkingDirectory=/opt/Second-Sight-RF-Tools
Environment="PATH=/opt/Second-Sight-RF-Tools/venv/bin:/usr/local/cuda-12.3/bin:/usr/bin"
Environment="LD_LIBRARY_PATH=/usr/local/cuda-12.3/lib64"
ExecStart=/opt/Second-Sight-RF-Tools/venv/bin/python server/python/gpu_service.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable forensic-gpu-service
sudo systemctl start forensic-gpu-service

# Check status
sudo systemctl status forensic-gpu-service
```

### GPU Memory Management

Configure GPU memory limits to prevent OOM errors:

```bash
# Add to .env file
echo "CUDA_VISIBLE_DEVICES=0" >> .env
echo "PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512" >> .env
```

### GPU Performance Tuning

Optimize GPU performance settings:

```bash
# Set GPU persistence mode (reduces initialization overhead)
sudo nvidia-smi -pm 1

# Set GPU clock speeds to maximum
sudo nvidia-smi -lgc 1800

# Monitor GPU usage
watch -n 1 nvidia-smi
```

### Troubleshooting GPU Issues

Common GPU-related issues and solutions:

**Issue: CUDA out of memory**
```bash
# Reduce batch size in processing scripts
# Add memory limit to environment
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256
```

**Issue: GPU not detected**
```bash
# Check NVIDIA driver
nvidia-smi

# Reinstall driver if needed
sudo apt install -y nvidia-driver-535
sudo reboot
```

**Issue: CuPy import error**
```bash
# Verify CUDA installation
nvcc --version

# Reinstall CuPy with correct CUDA version
pip uninstall cupy-cuda12x
pip install cupy-cuda12x==13.0.0
```

---

## Storage Configuration

### S3-Compatible Storage

The application uses S3-compatible storage for signal data files. When deployed on the Manus platform, storage is automatically configured. For self-hosted deployments, configure an S3-compatible service (AWS S3, MinIO, DigitalOcean Spaces, etc.).

### Storage Helper Functions

The application provides pre-configured storage helpers in `server/storage.ts`:

```typescript
// Upload file to S3
const { url, key } = await storagePut(
  'captures/signal-123.sigmf-data',
  fileBuffer,
  'application/octet-stream'
);

// Get presigned URL for file
const { url } = await storageGet('captures/signal-123.sigmf-data', 3600);

// Delete file from S3
await storageDelete('captures/signal-123.sigmf-data');
```

### Storage Bucket Structure

The application organizes files in S3 with the following structure:

```
bucket-name/
├── captures/
│   ├── {userId}-{timestamp}.sigmf-meta
│   ├── {userId}-{timestamp}.sigmf-data
│   └── ...
├── models/
│   ├── torchsig-classifier-v1.pt
│   └── ...
└── exports/
    ├── report-{captureId}-{timestamp}.pdf
    └── ...
```

### CORS Configuration

Configure CORS policy for frontend access:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://your-domain.com"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

### Storage Quota Management

Monitor storage usage and set up alerts:

```bash
# Check total storage used
aws s3 ls s3://your-bucket --recursive --summarize | grep "Total Size"

# Set up CloudWatch alarm for storage usage (AWS)
aws cloudwatch put-metric-alarm \
  --alarm-name forensic-storage-quota \
  --alarm-description "Alert when storage exceeds 80%" \
  --metric-name BucketSizeBytes \
  --namespace AWS/S3 \
  --statistic Average \
  --period 86400 \
  --threshold 858993459200 \
  --comparison-operator GreaterThanThreshold
```

---

## Service Management

### Systemd Service Configuration

Create a systemd service for production deployment:

```bash
# Create service file
sudo tee /etc/systemd/system/forensic-signal-processor.service > /dev/null << 'EOF'
[Unit]
Description=Second Sight RF Signal Analysis Platform
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=forensic
WorkingDirectory=/opt/Second-Sight-RF-Tools
Environment="NODE_ENV=production"
Environment="PATH=/opt/Second-Sight-RF-Tools/node_modules/.bin:/usr/bin"
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=forensic-signal-processor

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable forensic-signal-processor

# Start service
sudo systemctl start forensic-signal-processor

# Check status
sudo systemctl status forensic-signal-processor
```

### Service Management Commands

```bash
# Start service
sudo systemctl start forensic-signal-processor

# Stop service
sudo systemctl stop forensic-signal-processor

# Restart service
sudo systemctl restart forensic-signal-processor

# View logs
sudo journalctl -u forensic-signal-processor -f

# View last 100 lines
sudo journalctl -u forensic-signal-processor -n 100

# View logs since boot
sudo journalctl -u forensic-signal-processor -b
```

### Process Management with PM2

Alternative to systemd, use PM2 for process management:

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start pnpm --name "forensic-signal-processor" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup systemd

# View logs
pm2 logs forensic-signal-processor

# Monitor processes
pm2 monit

# Restart application
pm2 restart forensic-signal-processor
```

---

## Monitoring & Health Checks

### Health Check Endpoint

The application exposes a health check endpoint at `/api/health`:

```bash
# Check application health
curl http://localhost:3000/api/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-12-08T12:00:00.000Z",
  "uptime": 3600,
  "database": "connected",
  "storage": "accessible",
  "python": "available",
  "gpu": "available"
}
```

### Monitoring with Prometheus

Set up Prometheus metrics collection:

```bash
# Install Prometheus Node Exporter
sudo apt install -y prometheus-node-exporter

# Configure Prometheus scrape config
cat >> /etc/prometheus/prometheus.yml << 'EOF'
  - job_name: 'forensic-signal-processor'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/metrics'
EOF

# Restart Prometheus
sudo systemctl restart prometheus
```

### Logging Configuration

Configure application logging:

```bash
# Add to .env file
echo "LOG_LEVEL=info" >> .env
echo "LOG_FORMAT=json" >> .env

# View application logs
sudo journalctl -u forensic-signal-processor -f --output=json-pretty
```

### Performance Monitoring

Monitor application performance metrics:

```bash
# Monitor CPU and memory usage
htop

# Monitor GPU usage (if available)
watch -n 1 nvidia-smi

# Monitor disk I/O
iostat -x 1

# Monitor network traffic
iftop
```

---

## Troubleshooting

### Common Issues

**Issue: Application fails to start**

Check the service logs for error messages:

```bash
sudo journalctl -u forensic-signal-processor -n 50
```

Common causes:
- Missing environment variables (check `.env` file)
- Database connection failure (verify `DATABASE_URL`)
- Port already in use (check with `sudo lsof -i :3000`)

**Issue: File upload fails**

Verify storage configuration:

```bash
# Test S3 connectivity
curl -I https://storage-endpoint.com

# Check storage credentials
echo $BUILT_IN_FORGE_API_KEY
```

**Issue: Python processing fails**

Verify Python environment:

```bash
# Activate virtual environment
source venv/bin/activate

# Test Python imports
python -c "import numpy, scipy, torch"

# Check Python path in .env
cat .env | grep PYTHON_PATH
```

**Issue: GPU not detected**

Verify CUDA installation:

```bash
# Check NVIDIA driver
nvidia-smi

# Check CUDA toolkit
nvcc --version

# Test CuPy
python -c "import cupy; print(cupy.cuda.is_available())"
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Add to .env file
echo "LOG_LEVEL=debug" >> .env
echo "DEBUG=*" >> .env

# Restart application
sudo systemctl restart forensic-signal-processor

# View debug logs
sudo journalctl -u forensic-signal-processor -f
```

### Performance Issues

If the application is slow or unresponsive:

```bash
# Check system resources
top
free -h
df -h

# Check database performance
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity;"

# Check Redis queue
redis-cli INFO
redis-cli LLEN bull:batch-jobs:wait
```

---

## Security Considerations

### Environment Variables

Store sensitive credentials securely:

```bash
# Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
# Never commit .env files to version control

# Add .env to .gitignore
echo ".env" >> .gitignore
```

### Database Security

Secure PostgreSQL connections:

```bash
# Enable SSL/TLS connections
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Restrict database access by IP
sudo nano /etc/postgresql/14/main/pg_hba.conf
# Add: host all all 10.0.0.0/24 md5
```

### File Upload Security

The application validates file uploads with:

- File type checking (`.sigmf-meta`, `.sigmf-data`, `.iq`, `.dat`, `.bin`)
- File size limits (max 10GB)
- Authentication required for all upload endpoints

### API Security

Secure API endpoints:

- All tRPC procedures require authentication
- JWT tokens with secure signing
- CORS policy restricts cross-origin requests
- Rate limiting on upload endpoints

---

## Performance Tuning

### Node.js Optimization

Optimize Node.js runtime:

```bash
# Increase max memory limit
export NODE_OPTIONS="--max-old-space-size=8192"

# Enable cluster mode for multi-core CPUs
# (requires code changes to use cluster module)
```

### Database Optimization

Optimize PostgreSQL performance:

```bash
# Edit postgresql.conf
sudo nano /etc/postgresql/14/main/postgresql.conf

# Recommended settings for 32GB RAM server
shared_buffers = 8GB
effective_cache_size = 24GB
maintenance_work_mem = 2GB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 20MB
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
```

### Redis Optimization

Optimize Redis for job queue:

```bash
# Edit redis.conf
sudo nano /etc/redis/redis.conf

# Recommended settings
maxmemory 2gb
maxmemory-policy allkeys-lru
save ""
appendonly yes
```

### GPU Optimization

Optimize GPU performance:

```bash
# Set GPU to performance mode
sudo nvidia-smi -pm 1

# Set maximum clock speeds
sudo nvidia-smi -lgc 1800

# Enable persistence mode
sudo nvidia-smi -i 0 -pm 1
```

---

## Conclusion

This deployment guide provides comprehensive instructions for deploying **Second Sight RF Tools** in production environments. For additional support, refer to the project repository or contact the development team.

**Key Takeaways:**

- The application supports three deployment modes: Development (in-memory), Production (CPU), and Production (GPU)
- PostgreSQL and Redis are required for production deployments
- Python 3.10+ with NumPy, SciPy, and PyTorch are essential dependencies
- GPU acceleration requires NVIDIA CUDA 12.x and CuPy
- S3-compatible storage is used for signal data files
- Comprehensive monitoring and health checks ensure operational reliability

**Next Steps:**

1. Review the [Python Environment Setup](#python-environment-setup) section for detailed dependency installation
2. Configure [GPU Acceleration](#gpu-acceleration-setup) if deploying with NVIDIA hardware
3. Set up [Monitoring & Health Checks](#monitoring--health-checks) for production observability
4. Refer to [Troubleshooting](#troubleshooting) section for common issues and solutions

---

**Document Version:** 1.0.0  
**Last Updated:** December 8, 2024  
**Maintained By:** Manus AI
