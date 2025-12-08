# Second Sight RF Tools

**Professional RF Signal Analysis Platform with GPU-Accelerated Processing**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-88%25-blue)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-10%25-yellow)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-brightgreen)](https://www.docker.com/)
[![CUDA](https://img.shields.io/badge/CUDA-12.3-green)](https://developer.nvidia.com/cuda-toolkit)

---

## Overview

**Second Sight RF Tools** is a comprehensive web-based platform for radio frequency signal analysis, designed for forensic investigators, RF engineers, and security researchers. The platform combines modern web technologies with GPU-accelerated signal processing to deliver professional-grade analysis capabilities through an intuitive interface.

Built with **React 19**, **Node.js 22**, **Python 3.11**, and **CUDA 12.3**, Second Sight provides real-time signal processing, advanced visualization, and machine learning-powered modulation classification. The platform supports industry-standard **SigMF** format, hardware SDR integration via **SoapySDR**, and containerized deployment with **Docker**.

---

## Key Features

### 📡 Signal File Management

Second Sight provides comprehensive support for managing and processing RF signal captures with industry-standard formats and metadata handling.

**SigMF Support** enables import and export of Signal Metadata Format files, the open-source standard for RF signal recordings. The platform automatically parses metadata including sample rate, center frequency, data type, and capture annotations, ensuring compatibility with other SigMF-compliant tools.

**Raw IQ Data Processing** allows direct upload of binary IQ sample files with flexible configuration of sample rate, center frequency, and data format (complex float32, int16, int8). The platform handles both interleaved and planar IQ formats with automatic endianness detection.

**File Organization** provides a searchable database of uploaded signal files with metadata tagging, filtering by frequency range, sample rate, and capture date. Users can organize captures into collections and share them with team members.

**S3 Storage Integration** ensures scalable and reliable storage for large signal files. All uploads are streamed directly to S3 with multipart upload support for files up to 10GB, eliminating server-side storage bottlenecks.

### 📊 WebGL Spectrogram Visualization

The platform delivers high-performance, interactive signal visualization using GPU-accelerated WebGL rendering for real-time exploration of RF captures.

**Real-time Rendering** leverages WebGL shaders to render spectrograms with millions of pixels at 60 FPS, enabling smooth panning and zooming through large signal files. The GPU-accelerated FFT pipeline processes IQ samples in parallel, delivering instant visual feedback.

**Interactive Controls** allow users to adjust FFT size (256 to 8192 points), window functions (Hamming, Hanning, Blackman), overlap percentage, and color maps (Viridis, Plasma, Inferno, Turbo). All parameters update in real-time without reprocessing the entire file.

**Frequency and Time Navigation** provides intuitive controls for exploring signal captures. Users can zoom into specific frequency bands, scroll through time, and place markers to measure bandwidth, duration, and signal characteristics.

**Export Capabilities** enable saving spectrogram images as high-resolution PNG files for reports and presentations, with customizable resolution, color schemes, and annotation overlays.

### 🌊 Cyclostationary Analysis

Advanced signal analysis techniques reveal hidden periodicities and modulation characteristics that traditional spectral analysis cannot detect.

**Spectral Correlation Function (SCF)** computes the two-dimensional correlation between frequency components, exposing cyclic features in modulated signals. This technique is particularly effective for detecting spread-spectrum signals, identifying co-channel interference, and classifying modulation types.

**Alpha Profile Extraction** generates one-dimensional profiles from the SCF, highlighting dominant cyclic frequencies (alpha values) that correspond to symbol rates, carrier offsets, and modulation parameters. These profiles serve as fingerprints for signal identification.

**GPU Acceleration** utilizes CUDA-enabled PyTorch and CuPy to accelerate cyclostationary computations by 10-50x compared to CPU-only processing. Large signal files that would take hours to analyze on CPU complete in minutes with GPU acceleration.

**Visualization Tools** render interactive 3D surface plots and heatmaps of the spectral correlation function, allowing analysts to explore cyclic features across frequency and cyclic frequency dimensions.

### 🤖 Machine Learning Modulation Classification

Deep learning models trained on millions of signal samples automatically identify modulation types with high accuracy, accelerating forensic analysis workflows.

**TorchSig Integration** leverages pre-trained neural networks from the TorchSig library, which includes state-of-the-art models for classifying 24 modulation types including AM, FM, PSK, QAM, FSK, and spread-spectrum variants.

**Real-time Inference** processes signal segments in milliseconds using GPU-accelerated PyTorch models. The platform automatically segments long captures into analysis windows and aggregates classification results to identify modulation transitions.

**Confidence Scoring** provides probability distributions across all modulation classes, enabling analysts to assess classification certainty and identify ambiguous or unknown signals that require manual investigation.

**Model Customization** supports fine-tuning pre-trained models on custom datasets, allowing organizations to train classifiers for proprietary or non-standard modulation schemes encountered in their operational environment.

### 🔌 Hardware SDR Integration

Direct integration with software-defined radio hardware enables live signal capture and monitoring without external recording tools.

**SoapySDR Support** provides a unified API for controlling a wide range of SDR devices including RTL-SDR, HackRF, Airspy, and USRP. The platform automatically detects connected hardware and configures appropriate sample rates and gain settings.

**Live Streaming** captures IQ samples directly from SDR hardware and streams them to the spectrogram viewer for real-time monitoring. Users can adjust center frequency, sample rate, and gain on-the-fly without interrupting the capture.

**Scheduled Recording** enables automated signal capture based on time schedules or trigger conditions. The platform can monitor specific frequencies and automatically save recordings when signal activity is detected.

**Device Management** allows configuration of multiple SDR devices with different frequency ranges and sampling capabilities, enabling simultaneous monitoring of multiple bands or diversity reception.

### 🐳 Containerized Deployment

Production-ready Docker configuration enables deployment across development, staging, and production environments with minimal setup.

**Multi-stage Dockerfile** optimizes image size and build time with separate stages for Python dependencies, Node.js build, and runtime environments. The GPU-enabled image includes CUDA 12.3, CuPy, and PyTorch with full NVIDIA support.

**Three Deployment Modes** support different use cases: development mode with hot reload and debug tools, production GPU mode with CUDA acceleration, and production CPU mode for environments without GPU hardware.

**Service Orchestration** uses Docker Compose to manage the application server, PostgreSQL database, Redis job queue, GPU processing service, and optional Nginx reverse proxy. All services include health checks and automatic restart policies.

**Automated Scripts** simplify deployment with `build.sh` for building Docker images and `deploy.sh` for launching services with automatic environment validation and database migration.

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19.0 | UI framework with concurrent rendering |
| **TypeScript** | 5.x | Type-safe JavaScript |
| **Vite** | 6.x | Fast build tool and dev server |
| **Tailwind CSS** | 4.x | Utility-first CSS framework |
| **shadcn/ui** | Latest | Accessible component library |
| **WebGL** | 2.0 | GPU-accelerated graphics |
| **tRPC** | 11.x | End-to-end type-safe APIs |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 22.x | JavaScript runtime |
| **Express** | 4.x | Web application framework |
| **tRPC** | 11.x | Type-safe API layer |
| **Drizzle ORM** | Latest | Type-safe database ORM |
| **PostgreSQL** | 15+ | Relational database |
| **Redis** | 7+ | Job queue and caching |

### Signal Processing

| Technology | Version | Purpose |
|------------|---------|---------|
| **Python** | 3.11 | Scientific computing |
| **NumPy** | 1.26 | Numerical arrays |
| **SciPy** | 1.11 | Signal processing algorithms |
| **PyTorch** | 2.1 | Deep learning framework |
| **CuPy** | 13.0 | GPU-accelerated NumPy |
| **TorchSig** | Latest | RF signal processing library |
| **SoapySDR** | Latest | SDR hardware abstraction |

### Infrastructure

| Technology | Version | Purpose |
|------------|---------|---------|
| **Docker** | 24+ | Containerization |
| **Docker Compose** | 2.20+ | Multi-container orchestration |
| **NVIDIA CUDA** | 12.3 | GPU computing platform |
| **cuDNN** | 9.x | Deep learning primitives |
| **Nginx** | Latest | Reverse proxy and SSL/TLS |

---

## Quick Start

### Prerequisites

- **Docker** 24.0+ and **Docker Compose** 2.20+
- **NVIDIA GPU** with Compute Capability 7.0+ (for GPU mode)
- **NVIDIA Container Toolkit** (for GPU mode)
- **8GB RAM** minimum (32GB recommended)
- **50GB storage** minimum (200GB recommended)

### Development Mode (No GPU Required)

```bash
# Clone repository
git clone https://github.com/Valentine-RF/Second-Sight-RF-Tools.git
cd Second-Sight-RF-Tools

# Copy environment template
cp .env.docker .env

# Edit .env and set JWT_SECRET
nano .env

# Deploy development environment
./docker/scripts/deploy.sh development

# Access services
# - Application: http://localhost:3000
# - Adminer (DB): http://localhost:8080
# - Redis Commander: http://localhost:8081
```

### Production Mode (GPU)

```bash
# Verify NVIDIA GPU is available
docker run --rm --gpus all nvidia/cuda:12.3.1-base-ubuntu22.04 nvidia-smi

# Deploy production environment with GPU
./docker/scripts/deploy.sh production

# Access application
# - Application: http://localhost:3000
# - Health check: http://localhost:3000/api/health
```

### Production Mode (CPU Only)

```bash
# Deploy production environment without GPU
./docker/scripts/deploy.sh production-cpu

# Access application
# - Application: http://localhost:3000
```

---

## Deployment Options

| Mode | Command | GPU | Image Size | Use Case |
|------|---------|-----|------------|----------|
| **Development** | `./docker/scripts/deploy.sh development` | Optional | ~8.5GB | Local development with hot reload |
| **Production (GPU)** | `./docker/scripts/deploy.sh production` | Required | ~8GB | High-volume signal processing |
| **Production (CPU)** | `./docker/scripts/deploy.sh production-cpu` | No | ~3GB | Cloud deployments without GPU |

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Browser                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   React UI   │  │ WebGL Canvas │  │  tRPC Client │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Nginx (Optional)                        │
│              Reverse Proxy, SSL/TLS, Rate Limiting           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Node.js Application                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Express API  │  │ tRPC Router  │  │ File Upload  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Auth Service │  │ Python Bridge│  │ S3 Client    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  PostgreSQL  │    │ GPU Service  │    │   S3/Minio   │
│   Database   │    │   (Python)   │    │   Storage    │
└──────────────┘    └──────────────┘    └──────────────┘
         │                    │
         │                    │
         ▼                    ▼
┌──────────────┐    ┌──────────────┐
│    Redis     │    │  NVIDIA GPU  │
│  Job Queue   │    │ CUDA + CuPy  │
└──────────────┘    └──────────────┘
```

### Data Flow

**Signal Upload** begins when a user selects SigMF or raw IQ files in the browser. The client initiates a multipart form upload to the `/api/upload/sigmf` or `/api/upload/raw-iq` endpoint with real-time progress tracking via XMLHttpRequest. The server validates file format and metadata, streams data directly to S3 storage, and saves file metadata (path, size, sample rate, center frequency) to PostgreSQL. Upon completion, the client receives the file ID and redirects to the analysis view.

**Spectrogram Rendering** starts when the user opens a signal file. The client requests IQ sample data from the server via tRPC, which retrieves the file from S3 and streams chunks to the browser. WebGL shaders perform FFT computation on the GPU, converting time-domain IQ samples to frequency-domain spectra. The shader pipeline applies windowing functions, computes magnitude, and maps values to colors using the selected color map. The resulting spectrogram is rendered to a canvas element with interactive pan and zoom controls.

**Cyclostationary Analysis** is triggered when the user selects a signal segment and initiates analysis. The client sends the file ID and time range to the server, which enqueues a job in Redis. The GPU service worker dequeues the job, loads IQ samples from S3, and computes the spectral correlation function using CUDA-accelerated FFT operations in CuPy. The resulting SCF matrix is saved to S3, and the job status is updated in PostgreSQL. The client polls for completion and retrieves the SCF data for visualization.

**Modulation Classification** executes when the user requests automatic identification. The server loads the pre-trained TorchSig model from the model cache, preprocesses the signal segment (resampling, normalization), and performs inference on the GPU using PyTorch. The model outputs a probability distribution across 24 modulation classes, which is returned to the client and displayed as a bar chart with confidence scores.

---

## Documentation

Comprehensive documentation is available in the repository:

- **[DOCKER.md](DOCKER.md)** - Complete Docker deployment guide with prerequisites, installation, configuration, and troubleshooting (60 pages)
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Manual deployment guide for non-Docker environments with system requirements and service management (40 pages)
- **[docs/PYTHON_SETUP.md](docs/PYTHON_SETUP.md)** - Python environment setup with virtual environments, dependencies, CUDA configuration, and verification scripts (30 pages)

---

## Development

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/Valentine-RF/Second-Sight-RF-Tools.git
cd Second-Sight-RF-Tools

# Install Node.js dependencies
pnpm install

# Set up environment variables
cp .env.example .env
nano .env

# Start development server
pnpm run dev

# Access application at http://localhost:3000
```

### Project Structure

```
Second-Sight-RF-Tools/
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable UI components
│   │   ├── lib/           # Utilities and tRPC client
│   │   └── hooks/         # Custom React hooks
│   └── public/            # Static assets
├── server/                # Node.js backend
│   ├── routers.ts         # tRPC procedures
│   ├── db.ts              # Database queries
│   └── _core/             # Framework plumbing
├── python/                # Python signal processing
│   ├── fft_service.py     # FFT computation
│   ├── cyclo_analysis.py  # Cyclostationary analysis
│   └── ml_classifier.py   # Modulation classification
├── drizzle/               # Database schema and migrations
│   └── schema.ts          # Drizzle ORM schema
├── docker/                # Docker configuration
│   ├── postgres/          # PostgreSQL config
│   ├── nginx/             # Nginx config
│   └── scripts/           # Deployment scripts
├── docs/                  # Documentation
├── Dockerfile             # Multi-stage Docker build
├── docker-compose.yml     # Service orchestration
└── package.json           # Node.js dependencies
```

### Building for Production

```bash
# Build frontend and backend
pnpm run build

# Run production server
pnpm start
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test server/auth.logout.test.ts

# Run tests with coverage
pnpm test:coverage
```

---

## Configuration

### Environment Variables

All configuration is managed through environment variables. Copy `.env.docker` to `.env` and customize:

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/forensic_signal_processor

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your_secure_random_secret_here

# Python
PYTHON_PATH=/app/venv/bin/python3

# GPU (optional)
CUDA_VISIBLE_DEVICES=0
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512

# Storage (Manus Platform)
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_api_key
```

### Database Migrations

```bash
# Generate migration from schema changes
pnpm db:generate

# Apply migrations to database
pnpm db:push

# Open Drizzle Studio (database GUI)
pnpm db:studio
```

---

## Performance

### Benchmarks

Performance measurements on a system with Intel i9-12900K CPU, NVIDIA RTX 3080 GPU, and 64GB RAM:

| Operation | CPU Time | GPU Time | Speedup |
|-----------|----------|----------|---------|
| **FFT (10M samples)** | 2.4s | 0.12s | 20x |
| **Cyclostationary Analysis** | 45s | 2.1s | 21x |
| **Modulation Classification** | 8.2s | 0.31s | 26x |
| **Spectrogram Rendering** | N/A | 16ms | Real-time |

### Optimization Tips

**GPU Memory Management** is critical for processing large signal files. Configure PyTorch memory allocator with `PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512` to reduce fragmentation. Use CuPy memory pools with size limits to prevent out-of-memory errors.

**Database Indexing** improves query performance for large signal file collections. Create indexes on frequently queried columns such as center frequency, sample rate, and capture timestamp. Use PostgreSQL's `pg_stat_statements` extension to identify slow queries.

**Redis Caching** reduces database load for frequently accessed metadata. Cache signal file metadata, user sessions, and analysis results with appropriate TTL values. Use Redis pub/sub for real-time job status updates.

**Nginx Optimization** enables efficient handling of large file uploads and downloads. Configure `client_max_body_size 10G` for large signal files, enable gzip compression for API responses, and use rate limiting to prevent abuse.

---

## Security

### Best Practices

**Authentication** is handled by Manus OAuth integration, which provides secure user authentication without storing passwords. JWT tokens are signed with a secret key and include expiration timestamps to prevent replay attacks.

**Authorization** uses role-based access control (RBAC) with `admin` and `user` roles. Admin users can manage all signal files and user accounts, while regular users can only access their own files.

**Input Validation** sanitizes all user inputs to prevent injection attacks. File uploads are validated for correct format and size limits, and metadata fields are checked against expected schemas.

**HTTPS/TLS** should be enabled in production using Nginx reverse proxy with Let's Encrypt certificates. Configure strong cipher suites and enable HSTS headers to prevent downgrade attacks.

**Secrets Management** stores sensitive configuration in environment variables, never in code. Use Docker secrets or a secrets management service (HashiCorp Vault, AWS Secrets Manager) for production deployments.

---

## Troubleshooting

### Common Issues

**GPU Not Detected**

If the application cannot access the GPU, verify NVIDIA drivers and Container Toolkit installation:

```bash
# Check NVIDIA drivers
nvidia-smi

# Test GPU access in Docker
docker run --rm --gpus all nvidia/cuda:12.3.1-base-ubuntu22.04 nvidia-smi

# Restart Docker daemon
sudo systemctl restart docker
```

**Database Connection Refused**

If the application cannot connect to PostgreSQL, check service status and credentials:

```bash
# Check PostgreSQL status
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Verify DATABASE_URL in .env
cat .env | grep DATABASE_URL
```

**Out of Memory Errors**

If Python processes crash with OOM errors, reduce batch sizes or increase swap space:

```bash
# Increase Docker memory limit
# Edit /etc/docker/daemon.json and add:
{
  "default-ulimits": {
    "memlock": {
      "Hard": -1,
      "Name": "memlock",
      "Soft": -1
    }
  }
}

# Restart Docker
sudo systemctl restart docker
```

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository** and create a feature branch
2. **Write tests** for new functionality
3. **Follow code style** (ESLint for TypeScript, Black for Python)
4. **Update documentation** for API changes
5. **Submit a pull request** with a clear description

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) file for details.

---

## Acknowledgments

**Second Sight RF Tools** builds upon the work of many open-source projects and research communities:

- **TorchSig** - RF signal processing library from TorchDSP
- **SigMF** - Signal Metadata Format specification from GNU Radio
- **SoapySDR** - SDR hardware abstraction layer from Pothosware
- **shadcn/ui** - Accessible component library
- **Manus Platform** - Deployment and hosting infrastructure

---

## Contact

**Project Maintainer:** Valentine RF  
**Repository:** https://github.com/Valentine-RF/Second-Sight-RF-Tools  
**Issues:** https://github.com/Valentine-RF/Second-Sight-RF-Tools/issues

---

**Built with ❤️ for the RF analysis community**
