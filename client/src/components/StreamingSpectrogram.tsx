import React, { useRef, useEffect, useState } from 'react';
import { useStreamingMode, StreamingData } from '@/hooks/useStreamingMode';
import { useSignalStore } from '@/store/signalStore';

interface StreamingSpectrogramProps {
  width: number;
  height: number;
  sessionId: string;
  enabled: boolean;
  fftSize?: number;
  historySize?: number; // Number of FFT rows to keep in history
}

/**
 * Real-time streaming spectrogram with WebGL rendering.
 * Displays live FFT data from SDR streaming session.
 */
export const StreamingSpectrogram: React.FC<StreamingSpectrogramProps> = ({
  width,
  height,
  sessionId,
  enabled,
  fftSize = 2048,
  historySize = 512,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  
  // Circular buffer for FFT history (time-domain scrolling)
  const fftHistoryRef = useRef<Float32Array>(new Float32Array(fftSize * historySize));
  const historyIndexRef = useRef(0);
  const animationFrameRef = useRef<number>(0);
  
  const colormap = useSignalStore((state) => state.colormap);
  const minColorLevel = useSignalStore((state) => state.minColorLevel);
  const maxColorLevel = useSignalStore((state) => state.maxColorLevel);
  
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  
  // Handle incoming streaming data
  const handleStreamingData = (data: StreamingData) => {
    if (data.fft.length === 0) return;
    
    // Add new FFT row to history (scroll up)
    const newRow = new Float32Array(data.fft[0]);
    
    // Shift history up by one row
    const history = fftHistoryRef.current;
    const rowIndex = historyIndexRef.current;
    
    // Copy new row to current position
    history.set(newRow, rowIndex * fftSize);
    
    // Increment index (circular)
    historyIndexRef.current = (rowIndex + 1) % historySize;
  };
  
  // Initialize streaming mode
  const { isConnected, stats } = useStreamingMode({
    enabled,
    sessionId,
    onData: handleStreamingData,
    onError: (error) => console.error('[StreamingSpectrogram] Error:', error),
    onConnect: () => console.log('[StreamingSpectrogram] Connected'),
    onDisconnect: () => console.log('[StreamingSpectrogram] Disconnected'),
  });
  
  // Update stats display
  useEffect(() => {
    setFps(stats.fps);
    setLatency(stats.latency);
  }, [stats]);
  
  // Initialize WebGL
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    glRef.current = gl;
    
    // Vertex shader
    const vertexShaderSource = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = (a_position + 1.0) / 2.0;
      }
    `;
    
    // Fragment shader with Viridis colormap
    const fragmentShaderSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform float u_minLevel;
      uniform float u_maxLevel;
      
      vec3 viridis(float t) {
        const vec3 c0 = vec3(0.2777273272234177, 0.005407344544966578, 0.3340998053353061);
        const vec3 c1 = vec3(0.1050930431085774, 1.404613529898575, 1.384590162594685);
        const vec3 c2 = vec3(-0.3308618287255563, 0.214847559468213, 0.09509516302823659);
        const vec3 c3 = vec3(-4.634230498983486, -5.799100973351585, -19.33244095627987);
        const vec3 c4 = vec3(6.228269936347081, 14.17993336680509, 56.69055260068105);
        const vec3 c5 = vec3(4.776384997670288, -13.74514537774601, -65.35303263337234);
        const vec3 c6 = vec3(-5.435455855934631, 4.645852612178535, 26.3124352495832);
        return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6)))));
      }
      
      void main() {
        float value = texture2D(u_texture, v_texCoord).r;
        float normalized = (value - u_minLevel) / (u_maxLevel - u_minLevel);
        normalized = clamp(normalized, 0.0, 1.0);
        vec3 color = viridis(normalized);
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    
    // Compile shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);
    
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    
    // Create program
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    programRef.current = program;
    
    // Create texture
    const texture = gl.createTexture();
    textureRef.current = texture;
    
    // Set up vertex buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);
  
  // Render loop
  useEffect(() => {
    const render = () => {
      const gl = glRef.current;
      const program = programRef.current;
      const texture = textureRef.current;
      const history = fftHistoryRef.current;
      
      if (!gl || !program || !texture) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      
      gl.useProgram(program);
      
      // Rearrange history buffer for correct time ordering
      // (newest at top, oldest at bottom)
      const currentIndex = historyIndexRef.current;
      const orderedHistory = new Float32Array(fftSize * historySize);
      
      for (let i = 0; i < historySize; i++) {
        const srcIndex = (currentIndex + i) % historySize;
        const dstIndex = historySize - 1 - i; // Reverse order (newest on top)
        orderedHistory.set(
          history.subarray(srcIndex * fftSize, (srcIndex + 1) * fftSize),
          dstIndex * fftSize
        );
      }
      
      // Update texture
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        fftSize,
        historySize,
        0,
        gl.LUMINANCE,
        gl.FLOAT,
        orderedHistory
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      
      // Set uniforms
      const minLevelLoc = gl.getUniformLocation(program, 'u_minLevel');
      const maxLevelLoc = gl.getUniformLocation(program, 'u_maxLevel');
      gl.uniform1f(minLevelLoc, minColorLevel);
      gl.uniform1f(maxLevelLoc, maxColorLevel);
      
      // Draw
      const positionLoc = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      
      animationFrameRef.current = requestAnimationFrame(render);
    };
    
    animationFrameRef.current = requestAnimationFrame(render);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [minColorLevel, maxColorLevel, fftSize, historySize]);
  
  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-border rounded"
      />
      
      {/* Status overlay */}
      <div className="absolute top-2 left-2 bg-background/80 backdrop-blur px-2 py-1 rounded text-xs font-mono">
        <div className={`flex items-center gap-2 ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
          {isConnected ? 'LIVE' : 'DISCONNECTED'}
        </div>
        {isConnected && (
          <>
            <div className="text-muted-foreground">FPS: {fps.toFixed(1)}</div>
            <div className="text-muted-foreground">Latency: {latency}ms</div>
          </>
        )}
      </div>
    </div>
  );
};
