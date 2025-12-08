#!/bin/bash
# Deployment script for Second Sight RF Tools

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_MODE=${1:-production}
COMPOSE_FILES="-f docker-compose.yml"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Second Sight RF Tools - Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Mode: ${YELLOW}${DEPLOYMENT_MODE}${NC}"
echo ""

# Select compose files based on deployment mode
case $DEPLOYMENT_MODE in
    development|dev)
        COMPOSE_FILES="${COMPOSE_FILES} -f docker-compose.dev.yml"
        echo -e "${BLUE}Development mode selected${NC}"
        echo -e "  - Hot reload enabled"
        echo -e "  - Debug logging enabled"
        echo -e "  - Adminer available at http://localhost:8080"
        echo -e "  - Redis Commander available at http://localhost:8081"
        ;;
    production-cpu|cpu)
        COMPOSE_FILES="${COMPOSE_FILES} -f docker-compose.cpu.yml"
        echo -e "${BLUE}CPU-only production mode selected${NC}"
        echo -e "  - No GPU acceleration"
        echo -e "  - Optimized for CPU workloads"
        ;;
    production|prod)
        echo -e "${BLUE}GPU-accelerated production mode selected${NC}"
        echo -e "  - NVIDIA GPU required"
        echo -e "  - CUDA acceleration enabled"
        ;;
    *)
        echo -e "${RED}Error: Invalid deployment mode '${DEPLOYMENT_MODE}'${NC}"
        echo -e "Valid modes: development, production, production-cpu"
        exit 1
        ;;
esac

echo ""

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    if [ -f .env.docker ]; then
        echo -e "${BLUE}Copying .env.docker to .env${NC}"
        cp .env.docker .env
        echo -e "${YELLOW}Please edit .env and set your configuration${NC}"
        exit 1
    else
        echo -e "${RED}Error: No environment configuration found${NC}"
        echo -e "Create .env file with required configuration"
        exit 1
    fi
fi

# Check for NVIDIA runtime (GPU mode only)
if [ "$DEPLOYMENT_MODE" = "production" ] || [ "$DEPLOYMENT_MODE" = "prod" ]; then
    if ! docker run --rm --gpus all nvidia/cuda:12.3.1-base-ubuntu22.04 nvidia-smi &> /dev/null; then
        echo -e "${RED}Error: NVIDIA Docker runtime not available${NC}"
        echo -e "GPU acceleration requires:"
        echo -e "  1. NVIDIA GPU with CUDA support"
        echo -e "  2. NVIDIA drivers installed"
        echo -e "  3. NVIDIA Container Toolkit installed"
        echo ""
        echo -e "Use 'production-cpu' mode for CPU-only deployment"
        exit 1
    fi
    echo -e "${GREEN}✓ NVIDIA GPU detected${NC}"
    docker run --rm --gpus all nvidia/cuda:12.3.1-base-ubuntu22.04 nvidia-smi | grep "CUDA Version"
    echo ""
fi

# Pull latest images
echo -e "${BLUE}Pulling latest images...${NC}"
docker-compose ${COMPOSE_FILES} pull

# Build application image
echo -e "${BLUE}Building application image...${NC}"
docker-compose ${COMPOSE_FILES} build

# Start services
echo -e "${BLUE}Starting services...${NC}"
docker-compose ${COMPOSE_FILES} up -d

# Wait for services to be healthy
echo -e "${BLUE}Waiting for services to be healthy...${NC}"
sleep 10

# Check service status
echo ""
echo -e "${GREEN}Service Status:${NC}"
docker-compose ${COMPOSE_FILES} ps

# Run database migrations
echo ""
echo -e "${BLUE}Running database migrations...${NC}"
docker-compose ${COMPOSE_FILES} exec -T app pnpm db:push || true

# Show logs
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Services:${NC}"
echo -e "  Application: ${YELLOW}http://localhost:3000${NC}"
echo -e "  Health check: ${YELLOW}http://localhost:3000/api/health${NC}"

if [ "$DEPLOYMENT_MODE" = "development" ] || [ "$DEPLOYMENT_MODE" = "dev" ]; then
    echo -e "  Adminer (DB): ${YELLOW}http://localhost:8080${NC}"
    echo -e "  Redis Commander: ${YELLOW}http://localhost:8081${NC}"
fi

echo ""
echo -e "${GREEN}Useful commands:${NC}"
echo -e "  View logs: ${YELLOW}docker-compose ${COMPOSE_FILES} logs -f${NC}"
echo -e "  Stop services: ${YELLOW}docker-compose ${COMPOSE_FILES} down${NC}"
echo -e "  Restart services: ${YELLOW}docker-compose ${COMPOSE_FILES} restart${NC}"
echo ""
