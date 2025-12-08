import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
