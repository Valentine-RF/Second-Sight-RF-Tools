#!/usr/bin/env python3
"""
GPU Service - ZeroMQ-based RPC Server for Node.js Integration

This service maintains a persistent CUDA context and handles
requests from the Node.js tRPC backend via ZeroMQ.

Features:
- Persistent GPU context (no per-request initialization overhead)
- Async request handling
- Health monitoring and memory management
- Graceful shutdown with resource cleanup
"""

import asyncio
import json
import signal
import sys
import os
import time
from typing import Dict, Any, Optional
from dataclasses import dataclass
import traceback
import numpy as np

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gpu_processor import GPUSignalProcessor, GPUConfig, get_processor

# ZeroMQ for IPC
try:
    import zmq
    import zmq.asyncio
    ZMQ_AVAILABLE = True
except ImportError:
    ZMQ_AVAILABLE = False
    print("[GPU Service] WARNING: pyzmq not installed - install with: pip install pyzmq", file=sys.stderr)


@dataclass
class ServiceConfig:
    """GPU Service configuration"""
    bind_address: str = "tcp://127.0.0.1:5555"
    heartbeat_interval: float = 30.0
    memory_cleanup_interval: float = 300.0
    max_request_size_mb: int = 100
    log_requests: bool = True


class GPUServiceStats:
    """Track service statistics"""
    
    def __init__(self):
        self.requests_total = 0
        self.requests_success = 0
        self.requests_failed = 0
        self.bytes_processed = 0
        self.start_time = time.time()
        self.last_request_time: Optional[float] = None
    
    def record_request(self, success: bool, bytes_processed: int = 0):
        self.requests_total += 1
        if success:
            self.requests_success += 1
        else:
            self.requests_failed += 1
        self.bytes_processed += bytes_processed
        self.last_request_time = time.time()
    
    def to_dict(self) -> Dict[str, Any]:
        uptime = time.time() - self.start_time
        return {
            'requests_total': self.requests_total,
            'requests_success': self.requests_success,
            'requests_failed': self.requests_failed,
            'bytes_processed': self.bytes_processed,
            'uptime_seconds': uptime,
            'requests_per_second': self.requests_total / uptime if uptime > 0 else 0,
            'last_request_ago': (
                time.time() - self.last_request_time 
                if self.last_request_time else None
            )
        }


class GPUService:
    """
    ZeroMQ-based GPU service for Node.js integration.
    
    Protocol:
    - Client sends JSON request with 'command' field
    - Server responds with JSON result or error
    
    Commands:
    - ping: Health check
    - psd: Power Spectral Density
    - fam: FAM Cyclostationary Analysis
    - wvd: Wigner-Ville Distribution
    - cwd: Choi-Williams Distribution
    - rf_dna: RF-DNA Feature Extraction
    - cumulants: Higher-Order Cumulants
    - memory: Get GPU memory info
    - cleanup: Free GPU memory
    - stats: Get service statistics
    """
    
    def __init__(self, config: Optional[ServiceConfig] = None):
        self.config = config or ServiceConfig()
        self.processor = get_processor()
        self.stats = GPUServiceStats()
        self.running = False
        self._context: Optional[zmq.asyncio.Context] = None
        self._socket: Optional[zmq.asyncio.Socket] = None
        self._cleanup_task: Optional[asyncio.Task] = None
    
    async def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Route and handle incoming request"""
        
        cmd = request.get('command', '').lower()
        params = request.get('params', {})
        start_time = time.time()
        
        try:
            # Extract IQ data if present
            iq_samples = None
            if 'iq_real' in request and 'iq_imag' in request:
                iq_real = np.array(request['iq_real'], dtype=np.float32)
                iq_imag = np.array(request['iq_imag'], dtype=np.float32)
                iq_samples = iq_real + 1j * iq_imag
                bytes_processed = iq_samples.nbytes
            else:
                bytes_processed = 0
            
            # Route to appropriate handler
            if cmd == 'ping':
                result = await self._handle_ping()
            
            elif cmd == 'psd':
                result = await self._handle_psd(iq_samples, params)
            
            elif cmd == 'fam':
                result = await self._handle_fam(iq_samples, params)
            
            elif cmd == 'wvd':
                result = await self._handle_wvd(iq_samples, params)
            
            elif cmd == 'cwd':
                result = await self._handle_cwd(iq_samples, params)
            
            elif cmd == 'rf_dna':
                result = await self._handle_rf_dna(iq_samples, params)
            
            elif cmd == 'cumulants':
                result = await self._handle_cumulants(iq_samples, params)
            
            elif cmd == 'memory':
                result = self.processor.get_memory_info()
            
            elif cmd == 'cleanup':
                self.processor.cleanup()
                result = {'status': 'ok', 'message': 'GPU memory cleared'}
            
            elif cmd == 'stats':
                result = self.stats.to_dict()
            
            else:
                result = {'error': f'Unknown command: {cmd}'}
                self.stats.record_request(success=False)
                return result
            
            # Add timing info
            result['processing_time_ms'] = (time.time() - start_time) * 1000
            self.stats.record_request(success=True, bytes_processed=bytes_processed)
            
            if self.config.log_requests:
                print(f"[GPU Service] {cmd}: {result['processing_time_ms']:.1f}ms", file=sys.stderr)
            
            return result
        
        except Exception as e:
            self.stats.record_request(success=False)
            error_msg = f"{type(e).__name__}: {str(e)}"
            print(f"[GPU Service] ERROR in {cmd}: {error_msg}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return {
                'error': error_msg,
                'command': cmd,
                'processing_time_ms': (time.time() - start_time) * 1000
            }
    
    async def _handle_ping(self) -> Dict[str, Any]:
        """Health check"""
        memory_info = self.processor.get_memory_info()
        return {
            'status': 'ok',
            'gpu_available': memory_info.get('gpu_available', False),
            'gpu_memory_used_mb': memory_info.get('used_bytes', 0) / 1e6,
            'stats': self.stats.to_dict()
        }
    
    async def _handle_psd(self, iq_samples: np.ndarray, params: Dict) -> Dict[str, Any]:
        """Power Spectral Density"""
        if iq_samples is None:
            return {'error': 'Missing IQ data'}
        
        psd = self.processor.psd_welch(
            iq_samples,
            fft_size=params.get('fft_size', 1024),
            overlap=params.get('overlap', 0.5),
            window=params.get('window', 'hann')
        )
        
        return {
            'psd': psd.tolist(),
            'fft_size': params.get('fft_size', 1024),
            'num_bins': len(psd)
        }
    
    async def _handle_fam(self, iq_samples: np.ndarray, params: Dict) -> Dict[str, Any]:
        """FAM Cyclostationary Analysis"""
        if iq_samples is None:
            return {'error': 'Missing IQ data'}
        
        result = self.processor.fam_scf(
            iq_samples,
            sample_rate=params.get('sample_rate', 1e6),
            nfft=params.get('nfft', 256),
            overlap=params.get('overlap', 0.5),
            alpha_max=params.get('alpha_max', 0.5)
        )
        
        return {
            'scf_magnitude': result['scf_magnitude'].tolist(),
            'spectral_freqs': result['spectral_freqs'].tolist(),
            'cyclic_freqs': result['cyclic_freqs'].tolist(),
            'cyclic_profile': result['cyclic_profile'].tolist(),
            'shape': list(result['scf_magnitude'].shape)
        }
    
    async def _handle_wvd(self, iq_samples: np.ndarray, params: Dict) -> Dict[str, Any]:
        """Wigner-Ville Distribution"""
        if iq_samples is None:
            return {'error': 'Missing IQ data'}
        
        result = self.processor.wigner_ville(
            iq_samples,
            nfft=params.get('nfft', 256),
            num_time_points=params.get('num_time_points'),
            smoothing=params.get('smoothing', False),
            smooth_window=params.get('smooth_window', 16)
        )
        
        return {
            'wvd': result['wvd'].tolist(),
            'time_axis': result['time_axis'].tolist(),
            'freq_axis': result['freq_axis'].tolist(),
            'shape': list(result['wvd'].shape)
        }
    
    async def _handle_cwd(self, iq_samples: np.ndarray, params: Dict) -> Dict[str, Any]:
        """Choi-Williams Distribution"""
        if iq_samples is None:
            return {'error': 'Missing IQ data'}
        
        result = self.processor.choi_williams(
            iq_samples,
            nfft=params.get('nfft', 256),
            sigma=params.get('sigma', 1.0),
            num_time_points=params.get('num_time_points')
        )
        
        return {
            'cwd': result['cwd'].tolist(),
            'time_axis': result['time_axis'].tolist(),
            'freq_axis': result['freq_axis'].tolist(),
            'shape': list(result['cwd'].shape)
        }
    
    async def _handle_rf_dna(self, iq_samples: np.ndarray, params: Dict) -> Dict[str, Any]:
        """RF-DNA Feature Extraction"""
        if iq_samples is None:
            return {'error': 'Missing IQ data'}
        
        result = self.processor.rf_dna_features(
            iq_samples,
            regions=params.get('regions', 20)
        )
        
        return {
            'features': result['features'].tolist(),
            'feature_count': result['feature_count'],
            'regions': result['regions']
        }
    
    async def _handle_cumulants(self, iq_samples: np.ndarray, params: Dict) -> Dict[str, Any]:
        """Higher-Order Cumulants"""
        if iq_samples is None:
            return {'error': 'Missing IQ data'}
        
        orders = params.get('orders', [4, 6])
        result = self.processor.higher_order_cumulants(iq_samples, orders=orders)
        
        return result
    
    async def _periodic_cleanup(self):
        """Periodic GPU memory cleanup"""
        while self.running:
            await asyncio.sleep(self.config.memory_cleanup_interval)
            memory_info = self.processor.get_memory_info()
            
            # If using more than 80% of allocated memory, cleanup
            if memory_info.get('used_bytes', 0) > memory_info.get('total_bytes', 1) * 0.8:
                print("[GPU Service] Memory cleanup triggered", file=sys.stderr)
                self.processor.cleanup()
    
    async def run(self):
        """Main service loop"""
        if not ZMQ_AVAILABLE:
            print("[GPU Service] Cannot start - pyzmq not available", file=sys.stderr)
            return
        
        self._context = zmq.asyncio.Context()
        self._socket = self._context.socket(zmq.REP)
        
        # Set socket options
        self._socket.setsockopt(zmq.RCVTIMEO, 60000)  # 60 second timeout
        self._socket.setsockopt(zmq.SNDTIMEO, 60000)
        self._socket.setsockopt(zmq.LINGER, 0)
        
        try:
            self._socket.bind(self.config.bind_address)
        except zmq.ZMQError as e:
            print(f"[GPU Service] Failed to bind to {self.config.bind_address}: {e}", file=sys.stderr)
            return
        
        self.running = True
        print(f"[GPU Service] Listening on {self.config.bind_address}", file=sys.stderr)
        
        # Start periodic cleanup task
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
        
        while self.running:
            try:
                # Wait for request
                message_bytes = await self._socket.recv()
                
                # Parse JSON
                try:
                    request = json.loads(message_bytes.decode('utf-8'))
                except json.JSONDecodeError as e:
                    response = {'error': f'Invalid JSON: {e}'}
                    await self._socket.send_json(response)
                    continue
                
                # Handle request
                response = await self.handle_request(request)
                
                # Send response
                await self._socket.send_json(response)
            
            except zmq.Again:
                # Timeout - continue loop
                continue
            
            except zmq.ZMQError as e:
                if self.running:
                    print(f"[GPU Service] ZMQ error: {e}", file=sys.stderr)
                break
            
            except asyncio.CancelledError:
                break
            
            except Exception as e:
                print(f"[GPU Service] Unexpected error: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                
                # Try to send error response
                try:
                    await self._socket.send_json({'error': str(e)})
                except:
                    pass
        
        await self.shutdown()
    
    async def shutdown(self):
        """Graceful shutdown"""
        print("[GPU Service] Shutting down...", file=sys.stderr)
        self.running = False
        
        # Cancel cleanup task
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        
        # Cleanup GPU resources
        self.processor.cleanup()
        
        # Close ZMQ
        if self._socket:
            self._socket.close()
        if self._context:
            self._context.term()
        
        print("[GPU Service] Shutdown complete", file=sys.stderr)


def main():
    """Entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='GPU Signal Processing Service')
    parser.add_argument('--address', default='tcp://127.0.0.1:5555',
                        help='ZeroMQ bind address')
    parser.add_argument('--no-log', action='store_true',
                        help='Disable request logging')
    args = parser.parse_args()
    
    config = ServiceConfig(
        bind_address=args.address,
        log_requests=not args.no_log
    )
    
    service = GPUService(config)
    
    # Handle signals
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(service.shutdown()))
    
    try:
        loop.run_until_complete(service.run())
    except KeyboardInterrupt:
        pass
    finally:
        loop.close()


if __name__ == '__main__':
    main()
