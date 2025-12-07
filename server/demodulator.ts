/**
 * Digital Mode Demodulator Library
 * 
 * Implements demodulation and decoding for RTTY, PSK31, and CW signals
 */

import { Complex } from './dsp';

/**
 * Baudot (ITA2) character set for RTTY
 * 5-bit encoding with LTRS/FIGS shift states
 */
const BAUDOT_LTRS: { [key: number]: string } = {
  0x00: '\0', 0x01: 'E', 0x02: '\n', 0x03: 'A', 0x04: ' ',
  0x05: 'S', 0x06: 'I', 0x07: 'U', 0x08: '\r', 0x09: 'D',
  0x0A: 'R', 0x0B: 'J', 0x0C: 'N', 0x0D: 'F', 0x0E: 'C',
  0x0F: 'K', 0x10: 'T', 0x11: 'Z', 0x12: 'L', 0x13: 'W',
  0x14: 'H', 0x15: 'Y', 0x16: 'P', 0x17: 'Q', 0x18: 'O',
  0x19: 'B', 0x1A: 'G', 0x1B: '[FIGS]', 0x1C: 'M', 0x1D: 'X',
  0x1E: 'V', 0x1F: '[LTRS]'
};

const BAUDOT_FIGS: { [key: number]: string } = {
  0x00: '\0', 0x01: '3', 0x02: '\n', 0x03: '-', 0x04: ' ',
  0x05: '\'', 0x06: '8', 0x07: '7', 0x08: '\r', 0x09: '$',
  0x0A: '4', 0x0B: '\x07', 0x0C: ',', 0x0D: '!', 0x0E: ':',
  0x0F: '(', 0x10: '5', 0x11: '+', 0x12: ')', 0x13: '2',
  0x14: '#', 0x15: '6', 0x16: '0', 0x17: '1', 0x18: '9',
  0x19: '?', 0x1A: '&', 0x1B: '[FIGS]', 0x1C: '.', 0x1D: '/',
  0x1E: ';', 0x1F: '[LTRS]'
};

/**
 * PSK31 Varicode table
 * Variable-length binary encoding optimized for ASCII
 */
const PSK31_VARICODE: { [key: string]: string } = {
  '1010101011': '\0', '1011011011': ' ', '1011101101': '!', '1110111011': '"',
  '1110110111': '#', '1011010111': '$', '1101110101': '%', '1011011101': '&',
  '1111111011': '\'', '1111110111': '(', '1111101111': ')', '1101111101': '*',
  '1101111111': '+', '1110101111': ',', '1101010111': '-', '1101101111': '.',
  '1101011011': '/', '1011010101': '0', '1011011111': '1', '1011111101': '2',
  '1011111111': '3', '1101110111': '4', '1101111011': '5', '1101101011': '6',
  '1101010101': '7', '1101011111': '8', '1101101101': '9', '1111101011': ':',
  '1111101101': ';', '1111110101': '<', '1101011101': '=', '1111011011': '>',
  '1011101011': '?', '1101111010': '@',  '1111111': 'A', '11101011': 'B',
  '10101101': 'C', '10110101': 'D', '1110111': 'E', '11011011': 'F',
  '11111101': 'G', '101010101': 'H', '1111': 'I', '111111101': 'J',  '101111111': 'K', '11010111': 'L', '10111011': 'M', '11011101': 'N',
  '10101011': 'O', '11010101': 'P', '111011101': 'Q', '10101111': 'R',
  '1101111': 'S', '1101101': 'T', '101010111': 'U', '110110101': 'V',
  '101011101': 'W', '101110101': 'X', '101111101': 'Y', '1010101101': 'Z',
  '111110101': '[', '111101111': '\\', '111111011': ']', '1010111111': '^',
  '101101101': '_', '1011110111': '`', '1011': 'a', '1011111': 'b',
  '101111': 'c', '101101': 'd', '11': 'e', '111101': 'f', '1011011': 'g',
  '101011': 'h', '1101': 'i', '111101011': 'j', '10111111': 'k',
  '11011': 'l', '111011': 'm', '11111': 'n', '111': 'o', '111111': 'p',
  '110101101': 'q', '10101': 'r', '10111': 's', '101': 't',
  '110111': 'u', '1111011': 'v', '1101011': 'w', '11011111': 'x',
  '1011101': 'y', '111010101': 'z', '1010110111': '{', '110111101': '|',
  '1010110101': '}', '1010101010': '~'
};

/**
 * International Morse Code table
 */
const MORSE_CODE: { [key: string]: string } = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
  '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
  '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
  '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
  '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
  '--..': 'Z', '-----': '0', '.----': '1', '..---': '2', '...--': '3',
  '....-': '4', '.....': '5', '-....': '6', '--...': '7', '---..': '8',
  '----.': '9', '.-.-.-': '.', '--..--': ',', '..--..': '?', '.----.': '\'',
  '-.-.--': '!', '-..-.': '/', '-.--.': '(', '-.--.-': ')', '.-...': '&',
  '---...': ':', '-.-.-.': ';', '-...-': '=', '.-.-.': '+', '-....-': '-',
  '..--.-': '_', '.-..-.': '"', '...-..-': '$', '.--.-.': '@'
};

export interface DemodulationResult {
  mode: 'RTTY' | 'PSK31' | 'CW';
  bitstream: string;
  decoded: string;
  baudRate?: number;
  shift?: number;
  confidence: number;
}

/**
 * Demodulate RTTY signal using FSK detection
 */
export function demodulateRTTY(
  samples: Complex[],
  sampleRate: number,
  baudRate: number = 45.45,
  shift: number = 170
): DemodulationResult {
  const markFreq = shift / 2;
  const spaceFreq = -shift / 2;
  const samplesPerBit = Math.floor(sampleRate / baudRate);
  
  // Goertzel algorithm for mark/space detection
  const detectTone = (samples: Complex[], freq: number): number => {
    const k = Math.floor(0.5 + (samples.length * freq) / sampleRate);
    const omega = (2 * Math.PI * k) / samples.length;
    const coeff = 2 * Math.cos(omega);
    
    let q0 = 0, q1 = 0, q2 = 0;
    for (const sample of samples) {
      q0 = coeff * q1 - q2 + sample.re;
      q2 = q1;
      q1 = q0;
    }
    
    return q1 * q1 + q2 * q2 - q1 * q2 * coeff;
  };
  
  // Detect bits
  const bits: number[] = [];
  for (let i = 0; i < samples.length - samplesPerBit; i += samplesPerBit) {
    const segment = samples.slice(i, i + samplesPerBit);
    const markPower = detectTone(segment, markFreq);
    const spacePower = detectTone(segment, spaceFreq);
    bits.push(markPower > spacePower ? 1 : 0);
  }
  
  // Decode Baudot
  let decoded = '';
  let bitstream = bits.join('');
  let figureMode = false;
  
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    const code = bits.slice(i, i + 5).reduce((acc, bit, idx) => acc | (bit << idx), 0);
    
    if (code === 0x1B) {
      figureMode = true;
    } else if (code === 0x1F) {
      figureMode = false;
    } else {
      const char = figureMode ? BAUDOT_FIGS[code] : BAUDOT_LTRS[code];
      if (char) decoded += char;
    }
  }
  
  return {
    mode: 'RTTY',
    bitstream: bitstream.match(/.{1,8}/g)?.join(' ') || bitstream,
    decoded: decoded.replace(/\0/g, ''),
    baudRate,
    shift,
    confidence: 0.85
  };
}

/**
 * Demodulate PSK31 signal using phase detection
 */
export function demodulatePSK31(
  samples: Complex[],
  sampleRate: number
): DemodulationResult {
  const baudRate = 31.25;
  const samplesPerBit = Math.floor(sampleRate / baudRate);
  
  // Phase detection
  const phases: number[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const phase = Math.atan2(samples[i].im, samples[i].re);
    phases.push(phase);
  }
  
  // Detect phase transitions (180° = bit flip)
  const bits: number[] = [];
  let currentBit = 0;
  
  for (let i = samplesPerBit; i < phases.length; i += samplesPerBit) {
    const phaseDiff = Math.abs(phases[i] - phases[i - samplesPerBit]);
    if (phaseDiff > Math.PI / 2) {
      currentBit = 1 - currentBit; // Toggle bit
    }
    bits.push(currentBit);
  }
  
  // Decode Varicode
  let decoded = '';
  let bitstream = bits.join('');
  let buffer = '';
  
  for (const bit of bits) {
    buffer += bit.toString();
    
    // Check for character terminator (00)
    if (buffer.endsWith('00')) {
      const code = buffer.slice(0, -2);
      if (code.length > 0) {
        // Find matching varicode
        for (const [varicode, char] of Object.entries(PSK31_VARICODE)) {
          if (varicode === code) {
            decoded += char;
            break;
          }
        }
      }
      buffer = '';
    }
  }
  
  return {
    mode: 'PSK31',
    bitstream: bitstream.match(/.{1,8}/g)?.join(' ') || bitstream,
    decoded,
    confidence: 0.75
  };
}

/**
 * Decode CW (Morse code) signal using envelope detection
 */
export function decodeCW(
  samples: Complex[],
  sampleRate: number,
  wpm: number = 20
): DemodulationResult {
  // Envelope detection
  const envelope: number[] = samples.map(s => Math.sqrt(s.re * s.re + s.im * s.im));
  
  // Calculate timing units (dit length in samples)
  const ditLength = Math.floor((1.2 / wpm) * sampleRate);
  const dahLength = ditLength * 3;
  const elementGap = ditLength;
  const letterGap = ditLength * 3;
  const wordGap = ditLength * 7;
  
  // Threshold detection
  const threshold = envelope.reduce((a, b) => a + b, 0) / envelope.length;
  
  // Detect marks and spaces
  const events: { type: 'mark' | 'space', duration: number }[] = [];
  let currentType: 'mark' | 'space' = envelope[0] > threshold ? 'mark' : 'space';
  let currentDuration = 0;
  
  for (const level of envelope) {
    const newType: 'mark' | 'space' = level > threshold ? 'mark' : 'space';
    if (newType === currentType) {
      currentDuration++;
    } else {
      events.push({ type: currentType, duration: currentDuration });
      currentType = newType;
      currentDuration = 1;
    }
  }
  
  // Convert to dits and dahs
  let morseBuffer = '';
  let decoded = '';
  let bitstream = '';
  
  for (const event of events) {
    if (event.type === 'mark') {
      const symbol = event.duration > dahLength * 0.7 ? '-' : '.';
      morseBuffer += symbol;
      bitstream += event.duration > dahLength * 0.7 ? '111' : '1';
    } else {
      // Space
      bitstream += '0';
      if (event.duration > wordGap * 0.7) {
        // Word gap
        if (morseBuffer.length > 0) {
          decoded += MORSE_CODE[morseBuffer] || '?';
          morseBuffer = '';
        }
        decoded += ' ';
      } else if (event.duration > letterGap * 0.7) {
        // Letter gap
        if (morseBuffer.length > 0) {
          decoded += MORSE_CODE[morseBuffer] || '?';
          morseBuffer = '';
        }
      }
    }
  }
  
  // Final character
  if (morseBuffer.length > 0) {
    decoded += MORSE_CODE[morseBuffer] || '?';
  }
  
  return {
    mode: 'CW',
    bitstream: bitstream.match(/.{1,8}/g)?.join(' ') || bitstream,
    decoded,
    confidence: 0.80
  };
}
