#!/usr/bin/env python3
"""
SoapySDR Python Bridge with FFT Computation

Provides device enumeration, configuration, streaming, and real-time FFT computation
for SDR hardware via SoapySDR library.
"""

import sys
import json
import numpy as np
import time
from typing import Dict, List, Any, Optional

# Try to import SoapySDR, fall back to mock if unavailable
try:
    import SoapySDR
    SOAPY_AVAILABLE = True
except ImportError:
    SOAPY_AVAILABLE = False
    print("Warning: SoapySDR not installed, using mock mode", file=sys.stderr)


class SoapyBridge:
    """Bridge between TypeScript and SoapySDR Python bindings"""
    
    def __init__(self):
        self.devices: Dict[str, Any] = {}
        self.streams: Dict[str, Any] = {}
        
    def enumerate_devices(self) -> List[Dict[str, Any]]:
        """Enumerate available SoapySDR devices"""
        if not SOAPY_AVAILABLE:
            return self._mock_devices()
        
        try:
            results = SoapySDR.Device.enumerate()
            devices = []
            
            for result in results:
                try:
                    # Create device to query capabilities
                    sdr = SoapySDR.Device(result)
                    
                    device_info = {
                        'driver': result.get('driver', 'unknown'),
                        'hardware': result.get('hardware', 'unknown'),
                        'serial': result.get('serial', 'unknown'),
                        'label': result.get('label', 'unknown'),
                        'channels': {
                            'rx': sdr.getNumChannels(SoapySDR.SOAPY_SDR_RX),
                            'tx': sdr.getNumChannels(SoapySDR.SOAPY_SDR_TX),
                        },
                        'freqRange': self._get_freq_range(sdr),
                        'sampleRateRange': self._get_sample_rate_range(sdr),
                        'gainRange': self._get_gain_range(sdr),
                        'antennas': sdr.listAntennas(SoapySDR.SOAPY_SDR_RX, 0),
                    }
                    
                    devices.append(device_info)
                    SoapySDR.Device.unmake(sdr)
                    
                except Exception as e:
                    print(f"Error querying device: {e}", file=sys.stderr)
                    continue
            
            return devices
            
        except Exception as e:
            print(f"Error enumerating devices: {e}", file=sys.stderr)
            return self._mock_devices()
    
    def _get_freq_range(self, sdr) -> Dict[str, float]:
        """Get frequency range for device"""
        try:
            ranges = sdr.getFrequencyRange(SoapySDR.SOAPY_SDR_RX, 0)
            if ranges:
                return {'min': ranges[0].minimum(), 'max': ranges[0].maximum()}
        except:
            pass
        return {'min': 0, 'max': 6000000000}  # Default 0-6 GHz
    
    def _get_sample_rate_range(self, sdr) -> Dict[str, float]:
        """Get sample rate range for device"""
        try:
            ranges = sdr.getSampleRateRange(SoapySDR.SOAPY_SDR_RX, 0)
            if ranges:
                return {'min': ranges[0].minimum(), 'max': ranges[0].maximum()}
        except:
            pass
        return {'min': 100000, 'max': 20000000}  # Default 100 kHz - 20 MHz
    
    def _get_gain_range(self, sdr) -> Dict[str, float]:
        """Get gain range for device"""
        try:
            gain_range = sdr.getGainRange(SoapySDR.SOAPY_SDR_RX, 0)
            return {'min': gain_range.minimum(), 'max': gain_range.maximum()}
        except:
            pass
        return {'min': 0, 'max': 50}  # Default 0-50 dB
    
    def _mock_devices(self) -> List[Dict[str, Any]]:
        """Return mock devices for development"""
        return [
            {
                'driver': 'rtlsdr',
                'hardware': 'R820T2',
                'serial': 'mock-rtl-001',
                'label': 'RTL-SDR Mock Device',
                'channels': {'rx': 1, 'tx': 0},
                'freqRange': {'min': 24000000, 'max': 1766000000},
                'sampleRateRange': {'min': 225000, 'max': 2400000},
                'gainRange': {'min': 0, 'max': 49.6},
                'antennas': ['RX'],
            }
        ]
    
    def configure_device(self, config: Dict[str, Any]) -> None:
        """Configure SoapySDR device"""
        if not SOAPY_AVAILABLE:
            print(f"Mock: Configured device {config['deviceSerial']}", file=sys.stderr)
            return
        
        try:
            device_serial = config['deviceSerial']
            
            # Create device
            sdr = SoapySDR.Device({'serial': device_serial})
            
            # Set frequency
            sdr.setFrequency(SoapySDR.SOAPY_SDR_RX, 0, config['frequency'])
            
            # Set sample rate
            sdr.setSampleRate(SoapySDR.SOAPY_SDR_RX, 0, config['sampleRate'])
            
            # Set gain
            sdr.setGain(SoapySDR.SOAPY_SDR_RX, 0, config['gain'])
            
            # Set antenna
            if 'antenna' in config:
                sdr.setAntenna(SoapySDR.SOAPY_SDR_RX, 0, config['antenna'])
            
            # Set bandwidth
            if 'bandwidth' in config:
                sdr.setBandwidth(SoapySDR.SOAPY_SDR_RX, 0, config['bandwidth'])
            
            # Store device for later use
            self.devices[device_serial] = sdr
            
            print(f"Configured device {device_serial}", file=sys.stderr)
            
        except Exception as e:
            raise Exception(f"Failed to configure device: {e}")
    
    def start_stream(self, config: Dict[str, Any]) -> None:
        """Start SoapySDR streaming with FFT computation"""
        if not SOAPY_AVAILABLE:
            print(f"Mock: Started stream for {config['deviceSerial']}", file=sys.stderr)
            return
        
        try:
            device_serial = config['deviceSerial']
            session_id = config['sessionId']
            
            if device_serial not in self.devices:
                raise Exception(f"Device {device_serial} not configured")
            
            sdr = self.devices[device_serial]
            
            # Setup stream
            stream = sdr.setupStream(SoapySDR.SOAPY_SDR_RX, SoapySDR.SOAPY_SDR_CF32)
            sdr.activateStream(stream)
            
            # Store stream
            self.streams[session_id] = {
                'device': sdr,
                'stream': stream,
                'deviceSerial': device_serial,
            }
            
            print(f"Started stream {session_id}", file=sys.stderr)
            
        except Exception as e:
            raise Exception(f"Failed to start stream: {e}")
    
    def stop_stream(self, config: Dict[str, Any]) -> None:
        """Stop SoapySDR streaming"""
        if not SOAPY_AVAILABLE:
            print(f"Mock: Stopped stream for {config['deviceSerial']}", file=sys.stderr)
            return
        
        try:
            device_serial = config['deviceSerial']
            
            # Find and stop all streams for this device
            sessions_to_remove = []
            for session_id, stream_info in self.streams.items():
                if stream_info['deviceSerial'] == device_serial:
                    sdr = stream_info['device']
                    stream = stream_info['stream']
                    
                    sdr.deactivateStream(stream)
                    sdr.closeStream(stream)
                    
                    sessions_to_remove.append(session_id)
            
            # Remove stopped sessions
            for session_id in sessions_to_remove:
                del self.streams[session_id]
            
            print(f"Stopped stream for {device_serial}", file=sys.stderr)
            
        except Exception as e:
            raise Exception(f"Failed to stop stream: {e}")
    
    def compute_fft(self, iq_samples: np.ndarray, fft_size: int = 2048, 
                   window: str = 'hamming') -> np.ndarray:
        """
        Compute FFT with windowing and PSD calculation.
        
        Args:
            iq_samples: Complex IQ samples
            fft_size: FFT size (power of 2)
            window: Window function ('hamming', 'hann', 'blackman', 'none')
        
        Returns:
            PSD in dB scale, shape (num_ffts, fft_size)
        """
        # Ensure IQ samples are complex
        if iq_samples.dtype != np.complex64:
            # Convert from interleaved I/Q to complex
            if len(iq_samples.shape) == 1:
                iq_samples = iq_samples[::2] + 1j * iq_samples[1::2]
        
        # Reshape to FFT chunks
        num_ffts = len(iq_samples) // fft_size
        if num_ffts == 0:
            return np.array([])
        
        iq_samples = iq_samples[:num_ffts * fft_size].reshape(num_ffts, fft_size)
        
        # Apply window
        if window == 'hamming':
            win = np.hamming(fft_size)
        elif window == 'hann':
            win = np.hann(fft_size)
        elif window == 'blackman':
            win = np.blackman(fft_size)
        else:
            win = np.ones(fft_size)
        
        iq_samples = iq_samples * win
        
        # Compute FFT
        fft_result = np.fft.fft(iq_samples, axis=1)
        fft_result = np.fft.fftshift(fft_result, axes=1)
        
        # Compute PSD (dB)
        psd = 10 * np.log10(np.abs(fft_result)**2 + 1e-10)
        
        return psd.astype(np.float32)
    
    def read_stream_and_compute_fft(self, session_id: str, num_samples: int = 2048,
                                    fft_size: int = 2048) -> Dict[str, Any]:
        """
        Read IQ samples from stream and compute FFT.
        
        Args:
            session_id: Stream session ID
            num_samples: Number of IQ samples to read
            fft_size: FFT size
        
        Returns:
            Dictionary with FFT result and metadata
        """
        if not SOAPY_AVAILABLE:
            # Return mock FFT data
            return self._mock_fft_data(fft_size)
        
        try:
            if session_id not in self.streams:
                raise Exception(f"Stream {session_id} not found")
            
            stream_info = self.streams[session_id]
            sdr = stream_info['device']
            stream = stream_info['stream']
            
            # Allocate buffer
            buff = np.zeros(num_samples, dtype=np.complex64)
            
            # Read samples
            sr = sdr.readStream(stream, [buff], num_samples, timeoutUs=1000000)
            
            if sr.ret < 0:
                raise Exception(f"Stream read error: {sr.ret}")
            
            # Compute FFT
            psd = self.compute_fft(buff[:sr.ret], fft_size=fft_size)
            
            return {
                'fft': psd.tolist(),
                'samplesRead': sr.ret,
                'timestamp': time.time(),
                'fftSize': fft_size,
            }
            
        except Exception as e:
            raise Exception(f"Failed to read stream and compute FFT: {e}")
    
    def _mock_fft_data(self, fft_size: int) -> Dict[str, Any]:
        """Generate mock FFT data for development"""
        # Generate synthetic signal with noise
        num_ffts = 1
        psd = np.random.randn(num_ffts, fft_size).astype(np.float32) * 10 - 80
        
        # Add a few peaks
        psd[0, fft_size // 4] = -30
        psd[0, fft_size // 2] = -20
        psd[0, 3 * fft_size // 4] = -40
        
        return {
            'fft': psd.tolist(),
            'samplesRead': fft_size,
            'timestamp': time.time(),
            'fftSize': fft_size,
        }


def main():
    """Main entry point for command-line interface"""
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No command specified'}))
        sys.exit(1)
    
    command = sys.argv[1]
    args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    
    bridge = SoapyBridge()
    
    try:
        if command == 'enumerate':
            devices = bridge.enumerate_devices()
            print(json.dumps({'devices': devices}))
        
        elif command == 'configure':
            bridge.configure_device(args)
            print(json.dumps({'success': True}))
        
        elif command == 'start_stream':
            bridge.start_stream(args)
            print(json.dumps({'success': True}))
        
        elif command == 'stop_stream':
            bridge.stop_stream(args)
            print(json.dumps({'success': True}))
        
        elif command == 'read_fft':
            result = bridge.read_stream_and_compute_fft(
                args['sessionId'],
                args.get('numSamples', 2048),
                args.get('fftSize', 2048)
            )
            print(json.dumps(result))
        
        else:
            print(json.dumps({'error': f'Unknown command: {command}'}))
            sys.exit(1)
    
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
