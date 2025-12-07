import { spawn } from 'child_process';
import path from 'path';

/**
 * SoapySDR Python Bridge
 * 
 * Provides TypeScript wrappers for SoapySDR Python bindings.
 * Communicates with Python subprocess for device control and streaming.
 */

interface SoapyDevice {
  driver: string;
  hardware: string;
  serial: string;
  label: string;
  channels: {
    rx: number;
    tx: number;
  };
  freqRange: {
    min: number;
    max: number;
  };
  sampleRateRange: {
    min: number;
    max: number;
  };
  gainRange: {
    min: number;
    max: number;
  };
  antennas: string[];
}

interface SoapyDeviceConfig {
  deviceSerial: string;
  frequency: number;
  sampleRate: number;
  gain: number;
  antenna: string;
  bandwidth: number;
}

interface SoapyStreamConfig {
  deviceSerial: string;
  sessionId: string;
}

/**
 * Execute Python SoapySDR command
 */
async function executeSoapyCommand(command: string, args: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '../python/soapy_bridge.py');
    
    const proc = spawn('python3', [
      pythonScript,
      command,
      JSON.stringify(args),
    ]);
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`SoapySDR command failed: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse SoapySDR response: ${stdout}`));
      }
    });
    
    proc.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });
  });
}

/**
 * Enumerate available SoapySDR devices
 */
export async function enumerateSoapyDevices(): Promise<SoapyDevice[]> {
  try {
    const result = await executeSoapyCommand('enumerate');
    return result.devices || [];
  } catch (error) {
    console.error('Failed to enumerate SoapySDR devices:', error);
    // Return mock devices for development
    return [
      {
        driver: 'usdr',
        hardware: 'USDR PCIe',
        serial: '012345678',
        label: 'USDR: bus=pci,device=usdr0',
        channels: { rx: 1, tx: 1 },
        freqRange: { min: 100000, max: 3800000000 },
        sampleRateRange: { min: 100000, max: 80000000 },
        gainRange: { min: -12, max: 61 },
        antennas: ['LNAH', 'LNAL', 'LNAW'],
      },
    ];
  }
}

/**
 * Configure SoapySDR device
 */
export async function configureSoapyDevice(config: SoapyDeviceConfig): Promise<void> {
  try {
    await executeSoapyCommand('configure', config);
  } catch (error) {
    console.error('Failed to configure SoapySDR device:', error);
    // Mock success for development
    console.log('Mock: Configured device', config.deviceSerial);
  }
}

/**
 * Start SoapySDR streaming
 */
export async function startSoapyStream(config: SoapyStreamConfig): Promise<void> {
  try {
    await executeSoapyCommand('start_stream', config);
  } catch (error) {
    console.error('Failed to start SoapySDR stream:', error);
    // Mock success for development
    console.log('Mock: Started stream for', config.deviceSerial);
  }
}

/**
 * Stop SoapySDR streaming
 */
export async function stopSoapyStream(config: { deviceSerial: string }): Promise<void> {
  try {
    await executeSoapyCommand('stop_stream', config);
  } catch (error) {
    console.error('Failed to stop SoapySDR stream:', error);
    // Mock success for development
    console.log('Mock: Stopped stream for', config.deviceSerial);
  }
}

/**
 * Read IQ samples from stream and compute FFT
 */
export async function readStreamFFT(config: {
  sessionId: string;
  numSamples?: number;
  fftSize?: number;
}): Promise<{
  fft: number[][];
  samplesRead: number;
  timestamp: number;
  fftSize: number;
}> {
  try {
    const result = await executeSoapyCommand('read_fft', config);
    return result;
  } catch (error) {
    console.error('Failed to read stream FFT:', error);
    // Return mock FFT data for development
    const fftSize = config.fftSize || 2048;
    const mockFFT = Array.from({ length: 1 }, () =>
      Array.from({ length: fftSize }, (_, i) => {
        // Generate synthetic spectrum with noise and peaks
        let value = Math.random() * 10 - 80; // Noise floor
        if (i === Math.floor(fftSize / 4)) value = -30; // Peak 1
        if (i === Math.floor(fftSize / 2)) value = -20; // Peak 2
        if (i === Math.floor(3 * fftSize / 4)) value = -40; // Peak 3
        return value;
      })
    );
    return {
      fft: mockFFT,
      samplesRead: config.numSamples || fftSize,
      timestamp: Date.now() / 1000,
      fftSize,
    };
  }
}

/**
 * Pause SoapySDR streaming (keep session alive but stop data flow)
 */
export async function pauseSoapyStream(config: { deviceSerial: string }): Promise<void> {
  try {
    await executeSoapyCommand('pause_stream', config);
  } catch (error) {
    console.error('Failed to pause SoapySDR stream:', error);
    // Mock success for development
    console.log('Mock: Paused stream for', config.deviceSerial);
  }
}
