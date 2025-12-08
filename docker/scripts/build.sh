#!/bin/bash
# Build script for Second Sight RF Tools Docker images

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="second-sight-rf"
VERSION=${1:-latest}
BUILD_TARGET=${2:-production}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Second Sight RF Tools - Docker Build${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Image: ${YELLOW}${IMAGE_NAME}:${VERSION}${NC}"
echo -e "Target: ${YELLOW}${BUILD_TARGET}${NC}"
echo ""

# Check if NVIDIA Docker runtime is available (for GPU builds)
if [ "$BUILD_TARGET" = "production" ]; then
    if ! docker run --rm --gpus all nvidia/cuda:12.3.1-base-ubuntu22.04 nvidia-smi &> /dev/null; then
        echo -e "${YELLOW}Warning: NVIDIA Docker runtime not detected${NC}"
        echo -e "${YELLOW}GPU acceleration will not be available${NC}"
        echo -e "${YELLOW}Consider using 'production-cpu' target for CPU-only builds${NC}"
        echo ""
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# Build image
echo -e "${GREEN}Building Docker image...${NC}"
docker build \
    --target ${BUILD_TARGET} \
    --tag ${IMAGE_NAME}:${VERSION} \
    --tag ${IMAGE_NAME}:latest \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    --progress=plain \
    .

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Build complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Image: ${YELLOW}${IMAGE_NAME}:${VERSION}${NC}"
echo -e "Size: ${YELLOW}$(docker images ${IMAGE_NAME}:${VERSION} --format "{{.Size}")${NC}"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo -e "  1. Test the image: ${YELLOW}docker run --rm ${IMAGE_NAME}:${VERSION}${NC}"
echo -e "  2. Deploy with compose: ${YELLOW}docker-compose up -d${NC}"
echo ""
