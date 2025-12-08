# Docker Deployment Guide

**Application:** Second Sight RF Tools  
**Version:** 1.0.0  
**Last Updated:** December 8, 2024  
**Author:** Manus AI

---

## Overview

This guide provides comprehensive instructions for deploying **Second Sight RF Tools** using Docker and Docker Compose. The Docker deployment supports three modes: **Development**, **Production (GPU)**, and **Production (CPU)**, each optimized for different use cases.

### Why Docker?

Docker deployment offers several advantages over traditional installation:

**Consistency** ensures the application runs identically across development, staging, and production environments, eliminating "works on my machine" issues.

**Isolation** packages all dependencies (Node.js, Python, CUDA, system libraries) in containers, preventing conflicts with host system packages.

**Reproducibility** allows the entire stack to be deployed with a single command, reducing setup time from hours to minutes.

**Scalability** enables easy horizontal scaling by running multiple container instances behind a load balancer.

**Portability** allows deployment on any platform that supports Docker, including cloud providers (AWS, GCP, Azure), on-premises servers, and developer workstations.

---

## Prerequisites

### System Requirements

Before deploying with Docker, ensure the following requirements are met:

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Ubuntu 20.04 LTS | Ubuntu 22.04 LTS |
| **Docker** | 24.0+ | 25.0+ |
| **Docker Compose** | 2.20+ | 2.23+ |
| **RAM** | 8 GB | 32 GB |
| **Storage** | 50 GB | 200 GB |
| **GPU** | None (CPU mode) | NVIDIA RTX 3060+ |

### Software Installation

Install Docker Engine and Docker Compose:

```bash
# Update package index
sudo apt update

# Install dependencies
sudo apt install -y ca-certificates curl gnupg

# Add Docker GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### NVIDIA Container Toolkit (GPU Mode Only)

For GPU-accelerated deployments, install NVIDIA Container Toolkit:

```bash
# Add NVIDIA package repository
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install NVIDIA Container Toolkit
sudo apt update
sudo apt install -y nvidia-container-toolkit

# Configure Docker to use NVIDIA runtime
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Verify GPU access
docker run --rm --gpus all nvidia/cuda:12.3.1-base-ubuntu22.04 nvidia-smi
```

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/Valentine-RF/Second-Sight-RF-Tools.git
cd Second-Sight-RF-Tools
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.docker .env

# Edit environment variables
nano .env
```

**Required environment variables:**

```bash
# Generate secure JWT secret
JWT_SECRET=$(openssl rand -hex 32)

# Database credentials (change in production)
DATABASE_URL=postgresql://forensic:CHANGE_THIS_PASSWORD@postgres:5432/forensic_signal_processor
```

### 3. Deploy

**Development Mode:**

```bash
./docker/scripts/deploy.sh development
```

**Production Mode (GPU):**

```bash
./docker/scripts/deploy.sh production
```

**Production Mode (CPU):**

```bash
./docker/scripts/deploy.sh production-cpu
```

### 4. Access Application

Open your browser and navigate to:

- **Application:** http://localhost:3000
- **Health Check:** http://localhost:3000/api/health
- **Adminer (Dev):** http://localhost:8080
- **Redis Commander (Dev):** http://localhost:8081

---

## Deployment Modes

### Development Mode

Development mode is optimized for local development with hot reload, debug logging, and development tools.

**Features:**
- Hot reload for code changes
- Debug logging enabled
- Source code mounted as volumes
- Adminer for database management
- Redis Commander for queue inspection
- No build optimization

**Start development environment:**

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

**Use cases:**
- Local development
- Testing new features
- Debugging issues

### Production Mode (GPU)

Production mode with GPU acceleration provides optimal performance for signal processing workloads.

**Features:**
- NVIDIA CUDA 12.3 support
- CuPy for GPU-accelerated NumPy
- PyTorch with CUDA support
- Persistent GPU service
- Optimized builds
- Health checks

**Requirements:**
- NVIDIA GPU with Compute Capability 7.0+
- NVIDIA drivers installed
- NVIDIA Container Toolkit

**Start GPU-accelerated production:**

```bash
docker-compose up -d
```

**Use cases:**
- Production deployments
- High-volume signal processing
- Real-time analysis

### Production Mode (CPU)

Production mode without GPU acceleration is suitable for environments without NVIDIA hardware.

**Features:**
- CPU-only PyTorch
- No CUDA dependencies
- Smaller image size
- Lower resource requirements

**Start CPU-only production:**

```bash
docker-compose -f docker-compose.yml -f docker-compose.cpu.yml up -d
```

**Use cases:**
- Cloud deployments without GPU
- Cost-sensitive environments
- Low-volume processing

---

## Docker Images

### Multi-Stage Build

The Dockerfile uses multi-stage builds to optimize image size and build time:

| Stage | Purpose | Base Image |
|-------|---------|------------|
| **base** | System dependencies | `nvidia/cuda:12.3.1-cudnn9-devel-ubuntu22.04` |
| **python-builder** | Python dependencies | `base` |
| **node-builder** | Node.js build | `base` |
| **production** | GPU production | `base` |
| **development** | Development | `base` |
| **production-cpu** | CPU production | `ubuntu:22.04` |

### Image Sizes

Approximate image sizes:

- **Production (GPU):** ~8 GB (includes CUDA, CuPy, PyTorch)
- **Production (CPU):** ~3 GB (no CUDA dependencies)
- **Development:** ~8.5 GB (includes dev tools)

### Building Images

Build images manually:

```bash
# GPU production image
docker build --target production -t second-sight-rf:latest .

# CPU production image
docker build --target production-cpu -t second-sight-rf:cpu .

# Development image
docker build --target development -t second-sight-rf:dev .
```

Or use the build script:

```bash
./docker/scripts/build.sh latest production
```

---

## Service Architecture

### Services Overview

The Docker Compose stack includes the following services:

| Service | Description | Port | Required |
|---------|-------------|------|----------|
| **app** | Main application | 3000 | Yes |
| **postgres** | PostgreSQL database | 5432 | Yes |
| **redis** | Job queue | 6379 | Yes |
| **gpu-service** | GPU processing | 5555 | GPU only |
| **nginx** | Reverse proxy | 80, 443 | Optional |
| **adminer** | DB management | 8080 | Dev only |
| **redis-commander** | Queue inspector | 8081 | Dev only |

### Service Dependencies

The services have the following dependency chain:

```
postgres (healthy) ──┐
                     ├──> app (healthy) ──> nginx
redis (healthy) ─────┘         │
                               └──> gpu-service
```

### Resource Limits

Default resource limits:

**Application Service:**
- GPU: 1 NVIDIA GPU
- Memory: No limit (uses available)

**PostgreSQL Service:**
- CPU: 1-2 cores
- Memory: 2-4 GB

**Redis Service:**
- CPU: 0.5-1 cores
- Memory: 1-2 GB

Adjust limits in `docker-compose.yml` under `deploy.resources`.

---

## Volume Management

### Persistent Volumes

The following volumes persist data across container restarts:

| Volume | Purpose | Backup Priority |
|--------|---------|-----------------|
| **postgres-data** | Database | Critical |
| **redis-data** | Job queue | Medium |
| **app-data** | Application data | Medium |
| **model-cache** | ML models | Low |
| **app-logs** | Application logs | Low |

### Backup Volumes

Create backups of critical volumes:

```bash
# Backup PostgreSQL data
docker run --rm \
  -v forensic-signal-processor_postgres-data:/data \
  -v $(pwd)/backups:/backup \
  ubuntu tar czf /backup/postgres-$(date +%Y%m%d).tar.gz /data

# Backup application data
docker run --rm \
  -v forensic-signal-processor_app-data:/data \
  -v $(pwd)/backups:/backup \
  ubuntu tar czf /backup/app-data-$(date +%Y%m%d).tar.gz /data
```

### Restore Volumes

Restore from backups:

```bash
# Restore PostgreSQL data
docker run --rm \
  -v forensic-signal-processor_postgres-data:/data \
  -v $(pwd)/backups:/backup \
  ubuntu tar xzf /backup/postgres-20241208.tar.gz -C /
```

---

## Configuration

### Environment Variables

All configuration is managed through environment variables in `.env` file.

**Required variables:**

```bash
# Database
DATABASE_URL=postgresql://user:password@postgres:5432/database

# Security
JWT_SECRET=your_secure_random_secret

# Redis
REDIS_URL=redis://redis:6379
```

**Optional variables:**

```bash
# Logging
LOG_LEVEL=info

# GPU
CUDA_VISIBLE_DEVICES=0
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512

# Upload limits
MAX_UPLOAD_SIZE=10GB
```

### PostgreSQL Configuration

Custom PostgreSQL settings are in `docker/postgres/postgresql.conf`:

```ini
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 10MB
```

### Nginx Configuration

Nginx reverse proxy configuration is in `docker/nginx/nginx.conf`:

- SSL/TLS termination
- Rate limiting
- WebSocket support
- Large file uploads (10GB)

---

## Operations

### Starting Services

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d app

# Start with logs
docker-compose up
```

### Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v

# Stop specific service
docker-compose stop app
```

### Viewing Logs

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f app

# View last 100 lines
docker-compose logs --tail=100 app
```

### Executing Commands

```bash
# Execute command in running container
docker-compose exec app pnpm db:push

# Execute shell
docker-compose exec app /bin/bash

# Execute as root
docker-compose exec -u root app /bin/bash
```

### Scaling Services

```bash
# Scale application service
docker-compose up -d --scale app=3

# Requires load balancer (nginx) configuration
```

---

## Monitoring

### Health Checks

All services include health checks:

```bash
# Check service health
docker-compose ps

# View health check logs
docker inspect --format='{{json .State.Health}}' forensic-signal-processor | jq
```

### Resource Usage

Monitor resource usage:

```bash
# View container stats
docker stats

# View GPU usage (GPU mode)
docker exec forensic-signal-processor nvidia-smi
```

### Application Metrics

Access application metrics:

```bash
# Health check endpoint
curl http://localhost:3000/api/health

# Expected response
{
  "status": "healthy",
  "database": "connected",
  "storage": "accessible",
  "python": "available",
  "gpu": "available"
}
```

---

## Troubleshooting

### Common Issues

**Issue: Container fails to start**

Check logs for error messages:

```bash
docker-compose logs app
```

Common causes:
- Missing environment variables
- Database connection failure
- Port already in use

**Issue: GPU not detected**

Verify NVIDIA runtime:

```bash
docker run --rm --gpus all nvidia/cuda:12.3.1-base-ubuntu22.04 nvidia-smi
```

If this fails:
1. Check NVIDIA drivers: `nvidia-smi`
2. Reinstall NVIDIA Container Toolkit
3. Restart Docker daemon

**Issue: Database connection refused**

Wait for PostgreSQL to be healthy:

```bash
docker-compose ps postgres
```

Check PostgreSQL logs:

```bash
docker-compose logs postgres
```

**Issue: Out of memory**

Increase Docker memory limit:

```bash
# Edit Docker daemon config
sudo nano /etc/docker/daemon.json

# Add memory limit
{
  "default-runtime": "nvidia",
  "runtimes": {
    "nvidia": {
      "path": "nvidia-container-runtime",
      "runtimeArgs": []
    }
  },
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

### Debug Mode

Enable debug logging:

```bash
# Add to .env
LOG_LEVEL=debug
DEBUG=*

# Restart services
docker-compose restart app
```

---

## Security

### Best Practices

**Change default passwords** in `.env` file before deploying to production.

**Use strong JWT secrets** generated with `openssl rand -hex 32`.

**Enable SSL/TLS** by configuring the nginx service with valid certificates.

**Restrict database access** by not exposing PostgreSQL port (5432) externally.

**Use Docker secrets** for sensitive data instead of environment variables:

```yaml
services:
  app:
    secrets:
      - jwt_secret
      - db_password

secrets:
  jwt_secret:
    file: ./secrets/jwt_secret.txt
  db_password:
    file: ./secrets/db_password.txt
```

**Keep images updated** by regularly pulling latest base images and rebuilding.

---

## Production Deployment

### Deployment Checklist

- [ ] Change default database password
- [ ] Generate secure JWT secret
- [ ] Configure SSL/TLS certificates
- [ ] Set up automated backups
- [ ] Configure monitoring and alerting
- [ ] Set resource limits
- [ ] Enable log rotation
- [ ] Configure firewall rules
- [ ] Test disaster recovery procedures

### SSL/TLS Setup

Generate SSL certificates with Let's Encrypt:

```bash
# Install certbot
sudo apt install -y certbot

# Generate certificates
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates to nginx directory
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem docker/nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem docker/nginx/ssl/key.pem

# Enable nginx service
docker-compose --profile with-nginx up -d
```

### Automated Backups

Set up automated backups with cron:

```bash
# Create backup script
cat > /opt/backup-forensic.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/forensic-signal-processor"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker exec forensic-postgres pg_dump -U forensic forensic_signal_processor | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# Backup volumes
docker run --rm \
  -v forensic-signal-processor_postgres-data:/data \
  -v $BACKUP_DIR:/backup \
  ubuntu tar czf /backup/volumes_$DATE.tar.gz /data

# Delete backups older than 7 days
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
EOF

chmod +x /opt/backup-forensic.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/backup-forensic.sh") | crontab -
```

---

## Conclusion

This Docker deployment guide provides comprehensive instructions for deploying **Second Sight RF Tools** in containerized environments. Docker simplifies deployment, ensures consistency, and enables easy scaling.

**Key Takeaways:**

- Three deployment modes support different use cases (development, GPU production, CPU production)
- Multi-stage Dockerfile optimizes image size and build time
- Docker Compose orchestrates all services with proper dependencies
- Persistent volumes ensure data survives container restarts
- Automated scripts simplify build and deployment processes
- Comprehensive monitoring and health checks ensure reliability

**Next Steps:**

1. Review the [DEPLOYMENT.md](DEPLOYMENT.md) guide for non-Docker deployment options
2. Configure SSL/TLS for production deployments
3. Set up automated backups and monitoring
4. Test disaster recovery procedures

---

**Document Version:** 1.0.0  
**Last Updated:** December 8, 2024  
**Maintained By:** Manus AI
