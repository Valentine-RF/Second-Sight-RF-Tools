import { useEffect, useRef } from 'react';

interface HexViewProps {
  bitstream: string;
  decoded: string;
  mode: 'RTTY' | 'PSK31' | 'CW';
  confidence: number;
}

export function HexView({ bitstream, decoded, mode, confidence }: HexViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Auto-scroll to bottom when new data arrives
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [bitstream, decoded]);

  if (!bitstream && !decoded) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a signal region and demodulate to view decoded data
      </div>
    );
  }

  // Convert bitstream to hex dump format
  const bitstreamBytes = bitstream.split(' ').map(byte => parseInt(byte, 2));
  const hexLines: string[] = [];
  
  for (let i = 0; i < bitstreamBytes.length; i += 16) {
    const offset = i.toString(16).padStart(8, '0').toUpperCase();
    const hexBytes = bitstreamBytes
      .slice(i, i + 16)
      .map(b => (isNaN(b) ? '??' : b.toString(16).padStart(2, '0').toUpperCase()))
      .join(' ');
    const asciiChars = bitstreamBytes
      .slice(i, i + 16)
      .map(b => (isNaN(b) || b < 32 || b > 126 ? '.' : String.fromCharCode(b)))
      .join('');
    
    hexLines.push(`${offset}: ${hexBytes.padEnd(48, ' ')}  ${asciiChars}`);
  }

  return (
    <div className="h-full flex flex-col p-4 space-y-4">
      {/* Mode and Confidence Header */}
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-4">
          <span className="font-black text-sm">Mode: {mode}</span>
          <span className="technical-label">
            Confidence: {(confidence * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">Decoding</span>
        </div>
      </div>

      {/* Decoded Text Panel */}
      <div className="flex-1 border border-border rounded-md p-3 bg-card/50 overflow-auto">
        <h4 className="font-black text-xs mb-2 text-cyan-400">DECODED TEXT</h4>
        <pre className="font-mono text-sm text-foreground whitespace-pre-wrap">
          {decoded || '(No text decoded yet)'}
        </pre>
      </div>

      {/* Hex Dump Panel */}
      <div 
        ref={containerRef}
        className="flex-1 border border-border rounded-md p-3 bg-card/50 overflow-auto"
      >
        <h4 className="font-black text-xs mb-2 text-pink-400">HEX DUMP (BITSTREAM)</h4>
        <pre className="font-mono text-xs text-muted-foreground">
          {hexLines.join('\n')}
        </pre>
      </div>

      {/* Raw Bitstream */}
      <div className="border border-border rounded-md p-3 bg-card/50 overflow-auto max-h-24">
        <h4 className="font-black text-xs mb-2 text-purple-400">RAW BITSTREAM</h4>
        <pre className="font-mono text-xs text-muted-foreground break-all">
          {bitstream}
        </pre>
      </div>
    </div>
  );
}
