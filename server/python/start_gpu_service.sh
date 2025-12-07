#!/bin/bash
# GPU Service Launcher for Second Sight RF Forensics
# This script starts the persistent Python GPU service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if Python 3.11 is available
if ! command -v python3.11 &> /dev/null; then
    echo "[ERROR] Python 3.11 not found. Please install it first."
    exit 1
fi

# Check if GPU requirements are installed
if ! python3.11 -c "import cupy" 2>/dev/null; then
    echo "[WARNING] CuPy not installed. GPU acceleration will not be available."
    echo "[INFO] To install GPU dependencies: pip3 install -r requirements-gpu.txt"
    echo "[INFO] Starting service in CPU-only mode..."
fi

# Check if ZeroMQ is installed
if ! python3.11 -c "import zmq" 2>/dev/null; then
    echo "[ERROR] pyzmq not installed. Installing now..."
    pip3 install pyzmq
fi

echo "[GPU Service] Starting on tcp://127.0.0.1:5555"
echo "[GPU Service] Press Ctrl+C to stop"

# Start the GPU service
exec python3.11 gpu_service.py
