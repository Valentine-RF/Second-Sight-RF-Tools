# SoapySDR Bridge for Second Sight RF

Python bridge for connecting SDR hardware to the Second Sight web application via SoapySDR.

## Features

- **Device Enumeration**: Automatically detect all connected SDR devices
- **Real-time Streaming**: Capture IQ samples and stream FFT data to web UI
- **Recording**: Save IQ samples for offline analysis
- **Multi-device Support**: Works with RTL-SDR, HackRF, USRP, Airspy, bladeRF, and more

## Installation

### Quick Install (Linux)

```bash
cd python
./install.sh
```

The installation script will:
1. Install system dependencies (SoapySDR library)
2. Install Python dependencies (numpy, requests)
3. Optionally install device-specific drivers (RTL-SDR, HackRF, USRP)
4. Verify installation and detect connected devices

### Manual Installation

#### System Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y libsoapysdr-dev soapysdr-tools python3-pip
```

**Fedora/RHEL:**
```bash
sudo yum install -y SoapySDR-devel SoapySDR python3-pip
```

#### Device Drivers

**RTL-SDR:**
```bash
sudo apt-get install -y soapysdr-module-rtlsdr rtl-sdr
```

**HackRF:**
```bash
sudo apt-get install -y soapysdr-module-hackrf hackrf
```

**USRP:**
```bash
sudo apt-get install -y soapysdr-module-uhd uhd-host
```

#### Python Dependencies

```bash
pip3 install -r requirements.txt
```

## Usage

### Command Line Interface

**List all available devices:**
```bash
python3 soapy_bridge.py enumerate
```

**Start streaming:**
```bash
python3 soapy_bridge.py stream <frequency_hz> <sample_rate_hz> <gain_db>
```

**Example - Stream FM radio at 100 MHz:**
```bash
python3 soapy_bridge.py stream 100e6 2.4e6 20
```

This will:
- Set center frequency to 100 MHz
- Set sample rate to 2.4 MHz
- Set gain to 20 dB
- Stream FFT data to http://localhost:3000

### Integration with Second Sight

The bridge communicates with the Second Sight web application via HTTP POST:

1. Start the Second Sight web server (default port 3000)
2. Run the SoapySDR bridge with desired parameters
3. Open the Forensic Cockpit in your browser
4. The waterfall display will show real-time FFT data from the SDR

### Python API

```python
from soapy_bridge import SoapyBridge

# Create bridge instance
bridge = SoapyBridge(websocket_url="http://localhost:3000")

# Enumerate devices
devices = bridge.enumerate_devices()
print(f"Found {len(devices)} devices")

# Open first device
bridge.open_device(devices[0]["args"])

# Configure device
bridge.configure_device(
    frequency=100e6,      # 100 MHz
    sample_rate=2.4e6,    # 2.4 MHz
    gain=20,              # 20 dB
    antenna="RX"
)

# Start streaming
bridge.start_stream(buffer_size=8192)

# Start recording
bridge.start_recording()

# ... wait for some time ...

# Stop recording and get samples
samples = bridge.stop_recording()
print(f"Recorded {len(samples)} IQ samples")

# Stop streaming
bridge.stop_stream()

# Close device
bridge.close_device()
```

## Supported Devices

The bridge supports any SDR hardware with SoapySDR drivers:

- **RTL-SDR** (RTL2832U dongles)
- **HackRF One**
- **USRP** (B200, B210, N210, X310, etc.)
- **Airspy** (R2, Mini, HF+)
- **bladeRF** (x40, x115, 2.0 micro)
- **LimeSDR**
- **PlutoSDR**
- **SDRplay** (RSP1, RSP2, RSPduo)

## Troubleshooting

### No devices found

```bash
# Verify SoapySDR installation
SoapySDRUtil --info

# Check for devices
SoapySDRUtil --find

# For RTL-SDR, check USB permissions
sudo usermod -a -G plugdev $USER
# Log out and log back in
```

### Permission denied errors

```bash
# Add udev rules for RTL-SDR
sudo cp /etc/udev/rules.d/rtl-sdr.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### Connection refused to web server

- Ensure Second Sight web server is running on port 3000
- Check firewall settings
- Verify websocket_url parameter matches server address

## Architecture

```
SDR Hardware
    ↓
SoapySDR Library
    ↓
soapy_bridge.py (Python)
    ↓ HTTP POST /api/sdr/broadcast-fft
Second Sight Server (Node.js)
    ↓ WebSocket
Browser (Forensic Cockpit)
```

## Performance Tips

- **Buffer Size**: Increase `buffer_size` parameter for high sample rates (e.g., 16384 for 10 MHz)
- **FFT Rate**: The bridge computes FFT for every buffer, adjust buffer size to control update rate
- **Network**: Use wired Ethernet for high sample rates to avoid WiFi packet loss
- **CPU**: FFT computation is CPU-intensive, consider reducing sample rate on low-power systems

## License

Part of the Second Sight RF Forensic Platform by Valentine RF
