import { describe, expect, it } from 'vitest';
import { parseByteRange } from './dataRoutes';

describe('parseByteRange', () => {
  const fileSize = 1024;

  it('parses standard byte ranges', () => {
    const range = parseByteRange('bytes=0-99', fileSize);
    expect(range).toEqual({ start: 0, end: 99 });
  });

  it('clamps open-ended ranges to file size', () => {
    const range = parseByteRange('bytes=100-', fileSize);
    expect(range).toEqual({ start: 100, end: fileSize - 1 });
  });

  it('parses suffix byte ranges', () => {
    const range = parseByteRange('bytes=-200', fileSize);
    expect(range).toEqual({ start: fileSize - 200, end: fileSize - 1 });
  });

  it('rejects out-of-bounds ranges', () => {
    const range = parseByteRange('bytes=2048-4096', fileSize);
    expect(range).toEqual({ error: 'Range start out of bounds' });
  });

  it('rejects malformed ranges', () => {
    const range = parseByteRange('items=0-10', fileSize);
    expect(range).toEqual({ error: 'Invalid Range format' });
  });
});
