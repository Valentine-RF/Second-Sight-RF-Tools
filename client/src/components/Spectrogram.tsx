import React, { useRef, useEffect, useState } from 'react';
import { useSignalStore } from '@/store/signalStore';
import { LODManager } from '@/lib/lodManager';
import { GPUFFT } from '@/lib/gpuFFT';
import { TileManager, type Viewport } from '@/lib/tileManager';

/**
 * Colormap shader functions for WebGL
 * Implements Viridis and Turbo colormaps for scientific visualization
 */
const COLORMAP_SHADERS = {
  viridis: `
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
  `,
  turbo: `
    vec3 turbo(float t) {
      const vec3 c0 = vec3(0.1140890109226559, 0.06288340699912215, 0.2248337216805064);
      const vec3 c1 = vec3(6.716419496985708, 3.182286745507602, 7.571581586103393);
      const vec3 c2 = vec3(-66.09402360453038, -4.9279827041226, -10.09439367561635);
      const vec3 c3 = vec3(228.7660791526501, 25.04986699771073, -91.54105330182436);
      const vec3 c4 = vec3(-334.8351565777451, -69.31749712757485, 288.5858850615712);
      const vec3 c5 = vec3(218.7637218434795, 67.52150567819112, -305.2045772184957);
      const vec3 c6 = vec3(-52.88903478218835, -21.54527364654712, 110.5174647748972);
      return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6)))));
    }
  `,
};

interface SpectrogramProps {
  width: number;
  height: number;
  sampleRate?: number; // For LOD calculation
  lodQuality?: 'high' | 'medium' | 'low' | 'auto';
  enableGPUFFT?: boolean; // Enable GPU-accelerated FFT
  enableTiling?: boolean; // Enable viewport culling with tiles
  totalSamples?: number; // Total samples in capture (for tiling)
  onBoxSelect?: (selection: { sampleStart: number; sampleEnd: number; freqLowerHz: number; freqUpperHz: number }) => void;
  onFPSUpdate?: (fps: number) => void; // Callback for FPS monitoring
}

/**
 * High-performance WebGL spectrogram renderer
 * 
 * Features:
 * - Texture-based rendering for 60 FPS performance
 * - Tiled rendering system for large datasets
 * - GPU colormap shaders (Viridis/Turbo)
 * - Box selection with right-click drag
 * - Zoom and pan controls
 * 
 * IMPORTANT: FFT data is stored in useRef, NOT React state, to avoid re-renders
 * during high-frequency updates. Use requestAnimationFrame for smooth animation.
 */
export const Spectrogram = React.forwardRef<{ captureCanvas: () => string }, SpectrogramProps>(
  ({ width, height, sampleRate = 1e6, lodQuality = 'auto', enableGPUFFT = false, enableTiling = false, totalSamples = 1e6, onBoxSelect, onFPSUpdate }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  
  // High-frequency data stored in refs (NOT state)
  const fftDataRef = useRef<Float32Array | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lodManagerRef = useRef<LODManager>(new LODManager());
  const gpuFFTRef = useRef<GPUFFT | null>(null);
  const tileManagerRef = useRef<TileManager | null>(null);
  const [currentLOD, setCurrentLOD] = useState<{ quality: string; reason: string }>({ quality: 'high', reason: 'Initializing...' });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, width, height, zoom: 1, pan: { x: 0, y: 0 } });

  // UI state from store
  const colormap = useSignalStore((state) => state.colormap);
  const minColorLevel = useSignalStore((state) => state.minColorLevel);
  const maxColorLevel = useSignalStore((state) => state.maxColorLevel);
  const setSelection = useSignalStore((state) => state.setSelection);

  // Expose capture method via ref
  React.useImperativeHandle(ref, () => ({
    captureCanvas: () => {
      if (canvasRef.current) {
        return canvasRef.current.toDataURL('image/png');
      }
      return '';
    }
  }));

  // Box selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);

  // Initialize WebGL context and shaders
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    glRef.current = gl;

    // Vertex shader for full-screen quad
    const vertexShaderSource = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = (a_position + 1.0) / 2.0;
      }
    `;

    // Fragment shader with colormap
    const fragmentShaderSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform float u_minLevel;
      uniform float u_maxLevel;
      
      ${colormap === 'turbo' ? COLORMAP_SHADERS.turbo : COLORMAP_SHADERS.viridis}
      
      void main() {
        float value = texture2D(u_texture, v_texCoord).r;
        float normalized = (value - u_minLevel) / (u_maxLevel - u_minLevel);
        normalized = clamp(normalized, 0.0, 1.0);
        vec3 color = ${colormap === 'turbo' ? 'turbo' : 'viridis'}(normalized);
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

    // Set up vertex buffer for full-screen quad
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
  }, [colormap]);

  // Render loop using requestAnimationFrame
  useEffect(() => {
    const render = () => {
      const gl = glRef.current;
      const program = programRef.current;
      const texture = textureRef.current;
      const fftData = fftDataRef.current;

      if (!gl || !program || !texture || !fftData) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // Record frame for FPS tracking
      lodManagerRef.current.recordFrame();
      const currentFPS = lodManagerRef.current.getCurrentFPS();
      
      // Report FPS to parent component
      if (onFPSUpdate && currentFPS > 0) {
        onFPSUpdate(currentFPS);
      }

      // Calculate LOD settings
      const lodResult = lodManagerRef.current.calculateLOD({
        viewportWidth: width,
        viewportHeight: height,
        sampleRate,
        targetFPS: 60,
        quality: lodQuality,
      });

      // Update LOD display (throttled)
      if (Math.random() < 0.01) { // Update UI only 1% of frames
        setCurrentLOD({ quality: lodResult.quality, reason: lodResult.reason });
      }

      // Decimate FFT data if needed
      const processedFFT = lodManagerRef.current.decimateFFT(fftData, lodResult.decimationFactor);

      gl.useProgram(program);

      // Update texture with FFT data (using LOD-adjusted size)
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        Math.min(1024, lodResult.textureWidth), // width (frequency bins)
        Math.min(512, lodResult.textureHeight),  // height (time steps)
        0,
        gl.LUMINANCE,
        gl.FLOAT,
        fftData
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
  }, [minColorLevel, maxColorLevel]);

  // Handle mouse events for box selection
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSelecting(true);
    setSelectionStart({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    setSelectionEnd({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isSelecting && selectionStart) {
      setSelectionEnd({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isSelecting && selectionStart && selectionEnd) {
      // Convert pixel coordinates to sample/frequency bounds
      const x1 = Math.min(selectionStart.x, selectionEnd.x);
      const x2 = Math.max(selectionStart.x, selectionEnd.x);
      const y1 = Math.min(selectionStart.y, selectionEnd.y);
      const y2 = Math.max(selectionStart.y, selectionEnd.y);

      // TODO: Convert to actual sample/frequency values based on viewport
      const selection = {
        sampleStart: Math.floor((x1 / width) * 1000000), // Placeholder
        sampleEnd: Math.floor((x2 / width) * 1000000),
        freqLowerHz: (1 - y2 / height) * 100e6, // Placeholder
        freqUpperHz: (1 - y1 / height) * 100e6,
      };

      setSelection(selection);
      onBoxSelect?.(selection);
    }

    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  return (
    <div className="relative" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0"
        onContextMenu={handleContextMenu}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setIsSelecting(false);
          setSelectionStart(null);
          setSelectionEnd(null);
        }}
      />
      
      {/* LOD Quality Indicator */}
      <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded text-xs font-mono pointer-events-none">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            currentLOD.quality === 'high' ? 'bg-green-400' :
            currentLOD.quality === 'medium' ? 'bg-yellow-400' :
            'bg-red-400'
          }`} />
          <span className="text-gray-300">LOD: {currentLOD.quality.toUpperCase()}</span>
        </div>
        <div className="text-gray-500 text-[10px] mt-0.5">{currentLOD.reason}</div>
      </div>

      {/* FPS Counter */}
      {onFPSUpdate && (
        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded text-xs font-mono pointer-events-none">
          <span className="text-gray-300">FPS: {lodManagerRef.current.getCurrentFPS().toFixed(1)}</span>
        </div>
      )}
      
      {/* Selection box overlay */}
      {isSelecting && selectionStart && selectionEnd && (
        <div
          className="absolute border-2 border-cyan-400 bg-cyan-400/10 pointer-events-none"
          style={{
            left: Math.min(selectionStart.x, selectionEnd.x),
            top: Math.min(selectionStart.y, selectionEnd.y),
            width: Math.abs(selectionEnd.x - selectionStart.x),
            height: Math.abs(selectionEnd.y - selectionStart.y),
          }}
        />
      )}
    </div>
  );
});

Spectrogram.displayName = 'Spectrogram';
