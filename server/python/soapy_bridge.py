#!/usr/bin/env python3
"""
SoapySDR Bridge for Second Sight RF Tools
Provides Python interface to SoapySDR devices
"""

import SoapySDR
from SoapySDR import SOAPY_SDR_RX, SOAPY_SDR_TX, SOAPY_SDR_CF32, SOAPY_SDR_CS16
import numpy as np
import json
import sys
import struct

class SDRBridge:
    def __init__(self):
        self.device = None
        self.rx_stream = None
        self.tx_stream = None
        
    def enumerate_devices(self):
        """List all available SoapySDR devices"""
        try:
            devices = SoapySDR.Device.enumerate()
            return {
                'success': True,
                'devices': devices
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def open_device(self, device_args):
        """Open SDR device with given arguments"""
        try:
            self.device = SoapySDR.Device(device_args)
            return {
                'success': True,
                'info': {
                    'driver': self.device.getDriverKey(),
                    'hardware': self.device.getHardwareKey(),
                    'rx_channels': self.device.getNumChannels(SOAPY_SDR_RX),
                    'tx_channels': self.device.getNumChannels(SOAPY_SDR_TX),
                }
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def configure_rx(self, freq, sample_rate, gain, antenna='LNAH', bandwidth=None):
        """Configure RX channel"""
        try:
            if not self.device:
                raise Exception("Device not opened")
            
            # Set frequency
            self.device.setFrequency(SOAPY_SDR_RX, 0, freq)
            
            # Set sample rate
            self.device.setSampleRate(SOAPY_SDR_RX, 0, sample_rate)
            
            # Set gain
            self.device.setGain(SOAPY_SDR_RX, 0, gain)
            
            # Set antenna
            self.device.setAntenna(SOAPY_SDR_RX, 0, antenna)
            
            # Set bandwidth if specified
            if bandwidth:
                self.device.setBandwidth(SOAPY_SDR_RX, 0, bandwidth)
            
            return {
                'success': True,
                'actual_freq': self.device.getFrequency(SOAPY_SDR_RX, 0),
                'actual_sample_rate': self.device.getSampleRate(SOAPY_SDR_RX, 0),
                'actual_gain': self.device.getGain(SOAPY_SDR_RX, 0),
                'actual_antenna': self.device.getAntenna(SOAPY_SDR_RX, 0),
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def start_rx_stream(self, num_samples=1024, format='CF32'):
        """Start RX stream"""
        try:
            if not self.device:
                raise Exception("Device not opened")
            
            stream_format = SOAPY_SDR_CF32 if format == 'CF32' else SOAPY_SDR_CS16
            
            self.rx_stream = self.device.setupStream(SOAPY_SDR_RX, stream_format)
            self.device.activateStream(self.rx_stream)
            
            return {
                'success': True,
                'mtu': self.device.getStreamMTU(self.rx_stream)
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def read_samples(self, num_samples=1024):
        """Read IQ samples from RX stream"""
        try:
            if not self.rx_stream:
                raise Exception("RX stream not started")
            
            buff = np.zeros(num_samples, dtype=np.complex64)
            sr = self.device.readStream(self.rx_stream, [buff], len(buff), timeoutUs=1000000)
            
            if sr.ret < 0:
                raise Exception(f"Stream read error: {sr.ret}")
            
            # Return as interleaved I/Q float32
            iq_data = np.empty(sr.ret * 2, dtype=np.float32)
            iq_data[0::2] = buff[:sr.ret].real
            iq_data[1::2] = buff[:sr.ret].imag
            
            return {
                'success': True,
                'num_samples': sr.ret,
                'data': iq_data.tobytes().hex()  # Hex encode for JSON transport
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def stop_rx_stream(self):
        """Stop RX stream"""
        try:
            if self.rx_stream:
                self.device.deactivateStream(self.rx_stream)
                self.device.closeStream(self.rx_stream)
                self.rx_stream = None
            
            return {'success': True}
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def close_device(self):
        """Close SDR device"""
        try:
            self.stop_rx_stream()
            self.device = None
            return {'success': True}
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

def main():
    """Command-line interface"""
    bridge = SDRBridge()
    
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No command specified'}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'enumerate':
        result = bridge.enumerate_devices()
        print(json.dumps(result))
    
    elif command == 'open':
        device_args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
        result = bridge.open_device(device_args)
        print(json.dumps(result))
    
    elif command == 'configure':
        config = json.loads(sys.argv[2])
        result = bridge.configure_rx(
            freq=config['frequency'],
            sample_rate=config['sampleRate'],
            gain=config['gain'],
            antenna=config.get('antenna', 'LNAH'),
            bandwidth=config.get('bandwidth')
        )
        print(json.dumps(result))
    
    elif command == 'start':
        result = bridge.start_rx_stream()
        print(json.dumps(result))
    
    elif command == 'read':
        num_samples = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
        result = bridge.read_samples(num_samples)
        print(json.dumps(result))
    
    elif command == 'stop':
        result = bridge.stop_rx_stream()
        print(json.dumps(result))
    
    elif command == 'close':
        result = bridge.close_device()
        print(json.dumps(result))
    
    else:
        print(json.dumps({'error': f'Unknown command: {command}'}))
        sys.exit(1)

if __name__ == '__main__':
    main()
