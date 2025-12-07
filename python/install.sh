#!/bin/bash
# Installation script for SoapySDR bridge dependencies

echo "Installing SoapySDR Bridge Dependencies..."
echo "==========================================="

# Check if running on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "WARNING: This script is designed for Linux systems"
fi

# Install system dependencies
echo ""
echo "Step 1: Installing system dependencies..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y \
        python3 \
        python3-pip \
        python3-numpy \
        libsoapysdr-dev \
        soapysdr-tools
elif command -v yum &> /dev/null; then
    sudo yum install -y \
        python3 \
        python3-pip \
        python3-numpy \
        SoapySDR-devel \
        SoapySDR
else
    echo "ERROR: Unsupported package manager. Please install SoapySDR manually."
    exit 1
fi

# Install Python dependencies
echo ""
echo "Step 2: Installing Python dependencies..."
pip3 install -r requirements.txt

# Install SoapySDR device support modules (optional)
echo ""
echo "Step 3: Installing SoapySDR device support modules..."
echo "Available modules:"
echo "  - soapysdr-module-rtlsdr (RTL-SDR dongles)"
echo "  - soapysdr-module-hackrf (HackRF One)"
echo "  - soapysdr-module-uhd (USRP devices)"
echo "  - soapysdr-module-airspy (Airspy devices)"
echo "  - soapysdr-module-bladerf (bladeRF devices)"
echo ""
read -p "Install RTL-SDR support? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y soapysdr-module-rtlsdr rtl-sdr
    fi
fi

read -p "Install HackRF support? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y soapysdr-module-hackrf hackrf
    fi
fi

read -p "Install USRP support? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y soapysdr-module-uhd uhd-host
    fi
fi

# Verify installation
echo ""
echo "Step 4: Verifying installation..."
if command -v SoapySDRUtil &> /dev/null; then
    echo "✓ SoapySDR installed successfully"
    echo ""
    echo "Detected devices:"
    SoapySDRUtil --find
else
    echo "✗ SoapySDR installation failed"
    exit 1
fi

# Make bridge script executable
chmod +x soapy_bridge.py

echo ""
echo "==========================================="
echo "Installation complete!"
echo ""
echo "Usage examples:"
echo "  List devices:  python3 soapy_bridge.py enumerate"
echo "  Start stream:  python3 soapy_bridge.py stream 100e6 2.4e6 20"
echo "                 (freq=100MHz, rate=2.4MHz, gain=20dB)"
