#!/usr/bin/env python3
"""
SoapySDR Bridge for Second Sight RF Forensic Platform
Handles device enumeration, configuration, IQ sample capture, and real-time FFT streaming
"""

import sys
import json
import time
import numpy as np
import requests
from typing import Dict, List, Optional, Tuple
import threading
import signal

try:
    import SoapySDR
    from SoapySDR import SOAPY_SDR_RX, SOAPY_SDR_CF32
except ImportError:
    print("ERROR: SoapySDR not installed. Install with: pip install SoapySDR", file=sys.stderr)
    sys.exit(1)


class SoapyBridge:
    """Bridge between SoapySDR hardware and Second Sight web application"""
    
    def __init__(self, websocket_url: str = "http://localhost:3000"):
        self.websocket_url = websocket_url
        self.device: Optional[SoapySDR.Device] = None
        self.stream = None
        self.is_streaming = False
        self.is_recording = False
        self.recorded_samples = []
        self.stream_thread: Optional[threading.Thread] = None
        
    def enumerate_devices(self) -> List[Dict]:
        """Enumerate all available SoapySDR devices"""
        try:
            results = SoapySDR.Device.enumerate()
            devices = []
            
            for i, result in enumerate(results):
                device_info = {
                    "id": i,
                    "driver": result.get("driver", "unknown"),
                    "label": result.get("label", f"Device {i}"),
                    "serial": result.get("serial", ""),
                    "hardware": result.get("hardware", ""),
                    "args": result
                }
                devices.append(device_info)
                
            return devices
        except Exception as e:
            print(f"ERROR: Failed to enumerate devices: {e}", file=sys.stderr)
            return []
    
    def open_device(self, device_args: Dict) -> bool:
        """Open a SoapySDR device"""
        try:
            if self.device is not None:
                self.close_device()
                
            self.device = SoapySDR.Device(device_args)
            print(f"Opened device: {device_args.get('driver', 'unknown')}")
            return True
        except Exception as e:
            print(f"ERROR: Failed to open device: {e}", file=sys.stderr)
            return False
    
    def configure_device(self, frequency: float, sample_rate: float, 
                        gain: float, antenna: str = "RX") -> bool:
        """Configure device parameters"""
        if self.device is None:
            print("ERROR: No device opened", file=sys.stderr)
            return False
            
        try:
            # Set sample rate
            self.device.setSampleRate(SOAPY_SDR_RX, 0, sample_rate)
            actual_rate = self.device.getSampleRate(SOAPY_SDR_RX, 0)
            print(f"Sample rate set to {actual_rate/1e6:.2f} MHz")
            
            # Set center frequency
            self.device.setFrequency(SOAPY_SDR_RX, 0, frequency)
            actual_freq = self.device.getFrequency(SOAPY_SDR_RX, 0)
            print(f"Center frequency set to {actual_freq/1e6:.2f} MHz")
            
            # Set gain
            self.device.setGain(SOAPY_SDR_RX, 0, gain)
            actual_gain = self.device.getGain(SOAPY_SDR_RX, 0)
            print(f"Gain set to {actual_gain} dB")
            
            # Set antenna
            self.device.setAntenna(SOAPY_SDR_RX, 0, antenna)
            print(f"Antenna set to {antenna}")
            
            return True
        except Exception as e:
            print(f"ERROR: Failed to configure device: {e}", file=sys.stderr)
            return False
    
    def start_stream(self, buffer_size: int = 8192) -> bool:
        """Start IQ sample streaming"""
        if self.device is None:
            print("ERROR: No device opened", file=sys.stderr)
            return False
            
        try:
            # Setup stream
            self.stream = self.device.setupStream(SOAPY_SDR_RX, SOAPY_SDR_CF32)
            self.device.activateStream(self.stream)
            self.is_streaming = True
            
            # Start streaming thread
            self.stream_thread = threading.Thread(
                target=self._stream_worker,
                args=(buffer_size,),
                daemon=True
            )
            self.stream_thread.start()
            
            print("Streaming started")
            return True
        except Exception as e:
            print(f"ERROR: Failed to start stream: {e}", file=sys.stderr)
            return False
    
    def stop_stream(self) -> bool:
        """Stop IQ sample streaming"""
        if not self.is_streaming:
            return True
            
        try:
            self.is_streaming = False
            
            # Wait for stream thread to finish
            if self.stream_thread:
                self.stream_thread.join(timeout=2.0)
            
            # Deactivate stream
            if self.stream and self.device:
                self.device.deactivateStream(self.stream)
                self.device.closeStream(self.stream)
                self.stream = None
            
            print("Streaming stopped")
            return True
        except Exception as e:
            print(f"ERROR: Failed to stop stream: {e}", file=sys.stderr)
            return False
    
    def start_recording(self):
        """Start recording IQ samples"""
        self.is_recording = True
        self.recorded_samples = []
        print("Recording started")
    
    def stop_recording(self) -> np.ndarray:
        """Stop recording and return captured samples"""
        self.is_recording = False
        samples = np.concatenate(self.recorded_samples) if self.recorded_samples else np.array([])
        print(f"Recording stopped. Captured {len(samples)} samples")
        return samples
    
    def _stream_worker(self, buffer_size: int):
        """Worker thread for streaming IQ samples"""
        buff = np.zeros(buffer_size, dtype=np.complex64)
        
        while self.is_streaming:
            try:
                # Read samples from device
                sr = self.device.readStream(self.stream, [buff], buffer_size, timeoutUs=1000000)
                
                if sr.ret > 0:
                    samples = buff[:sr.ret].copy()
                    
                    # Record samples if recording is active
                    if self.is_recording:
                        self.recorded_samples.append(samples)
                    
                    # Compute FFT and send to server
                    self._send_fft_data(samples)
                    
            except Exception as e:
                print(f"ERROR in stream worker: {e}", file=sys.stderr)
                time.sleep(0.1)
    
    def _send_fft_data(self, samples: np.ndarray):
        """Compute FFT and send to WebSocket server"""
        try:
            # Compute FFT
            fft_result = np.fft.fftshift(np.fft.fft(samples))
            magnitude_db = 20 * np.log10(np.abs(fft_result) + 1e-10)
            
            # Prepare data for server
            fft_data = {
                "timestamp": time.time(),
                "fft": magnitude_db.tolist(),
                "sampleCount": len(samples)
            }
            
            # Send to server via HTTP POST
            # The server's WebSocket handler will broadcast this to connected clients
            requests.post(
                f"{self.websocket_url}/api/sdr/broadcast-fft",
                json=fft_data,
                timeout=0.5
            )
            
        except Exception as e:
            # Don't spam errors during streaming
            pass
    
    def close_device(self):
        """Close the device and cleanup"""
        self.stop_stream()
        
        if self.device:
            self.device = None
            print("Device closed")


def main():
    """Command-line interface for SoapySDR bridge"""
    if len(sys.argv) < 2:
        print("Usage: python soapy_bridge.py <command> [args...]")
        print("Commands:")
        print("  enumerate                    - List all available devices")
        print("  stream <freq> <rate> <gain>  - Start streaming (freq in Hz, rate in Hz, gain in dB)")
        sys.exit(1)
    
    command = sys.argv[1]
    bridge = SoapyBridge()
    
    if command == "enumerate":
        devices = bridge.enumerate_devices()
        print(json.dumps(devices, indent=2))
        
    elif command == "stream":
        if len(sys.argv) < 5:
            print("ERROR: stream requires frequency, sample_rate, and gain")
            sys.exit(1)
        
        freq = float(sys.argv[2])
        rate = float(sys.argv[3])
        gain = float(sys.argv[4])
        
        # Enumerate and open first device
        devices = bridge.enumerate_devices()
        if not devices:
            print("ERROR: No devices found")
            sys.exit(1)
        
        if not bridge.open_device(devices[0]["args"]):
            sys.exit(1)
        
        if not bridge.configure_device(freq, rate, gain):
            sys.exit(1)
        
        if not bridge.start_stream():
            sys.exit(1)
        
        # Handle Ctrl+C gracefully
        def signal_handler(sig, frame):
            print("\nStopping stream...")
            bridge.stop_stream()
            bridge.close_device()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        
        print("Streaming... Press Ctrl+C to stop")
        while True:
            time.sleep(1)
    
    else:
        print(f"ERROR: Unknown command '{command}'")
        sys.exit(1)


if __name__ == "__main__":
    main()
