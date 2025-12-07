/**
 * GPU-Accelerated Waterfall Display
 * 
 * Scrolling waterfall visualization for frequency-hopping signals
 * Uses WebGL2 texture scrolling for smooth 60 FPS rendering
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Play, Pause, Trash2 } from 'lucide-react';

interface WaterfallDisplayProps {
  width?: number;
  height?: number;
  fftSize?: number;
  colormap?: 'viridis' | 'turbo' | 'plasma';
  scrollSpeed?: number; // pixels per second
  retentionSeconds?: number; // how many seconds of history to keep
}

/**
 * Viridis colormap shader (0-1 input -> RGB output)
 */
const viridisColormap = `
  vec3 viridis(float t) {
    const vec3 c0 = vec3(0.2777273272234177, 0.005407344544966578, 0.3340998053353061);
    const vec3 c1 = vec3(0.1050930431085774, 1.404613529898575, 1.384590162594685);
    const vec3 c2 = vec3(-0.3308618287255563, 0.214847559468213, 0.09509516302823659);
    const vec3 c3 = vec3(-4.634230498983486, -5.799100973351585, -19.33244095627987);
    const vec3 c4 = vec3(6.228269936347081, 14.17993336680509, 56.69055260068105);
    const vec3 c5 = vec3(4.776384997670288, -13.74514537774601, -65.35303263337234);
    const vec3 c6 = vec3(-5.435455855934631, 4.645852612178535, 26.3124352495832);
    
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
  }
`;

/**
 * Turbo colormap shader (0-1 input -> RGB output)
 */
const turboColormap = `
  vec3 turbo(float t) {
    const vec3 c0 = vec3(0.1140890109226559, 0.06288340699912215, 0.2248337216805064);
    const vec3 c1 = vec3(6.716419496985708, 3.182286745507602, 7.571581586103393);
    const vec3 c2 = vec3(-66.09402360453038, -4.9279827041226, -10.09439367561635);
    const vec3 c3 = vec3(228.7660791526501, 25.04986699771073, -91.54105330182436);
    const vec3 c4 = vec3(-334.8351565777451, -69.31749712757485, 288.5858850615712);
    const vec3 c5 = vec3(218.7637218434795, 67.52150567819112, -305.2045772184957);
    const vec3 c6 = vec3(-52.88903478218835, -21.54527364654712, 110.5174647748972);
    
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
  }
`;

export function WaterfallDisplay({
  width = 512,
  height = 400,
  fftSize = 512,
  colormap = 'viridis',
  scrollSpeed = 60, // 60 pixels per second = 1 pixel per frame at 60 FPS
  retentionSeconds = 60,
}: WaterfallDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const framebufferRef = useRef<WebGLFramebuffer | null>(null);
  
  const [isPaused, setIsPaused] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  
  // Circular buffer for FFT history
  const fftBufferRef = useRef<Float32Array>(new Float32Array(fftSize * Math.ceil(retentionSeconds * 60))); // 60 FPS
  const bufferIndexRef = useRef(0);
  
  /**
   * Initialize WebGL2 context and shaders
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      console.error('WebGL2 not supported');
      return;
    }
    
    glRef.current = gl;
    
    // Vertex shader (fullscreen quad)
    const vertexShaderSource = `#version 300 es
      in vec2 a_position;
      out vec2 v_texCoord;
      
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_position * 0.5 + 0.5;
      }
    `;
    
    // Fragment shader (scrolling waterfall with colormap)
    const fragmentShaderSource = `#version 300 es
      precision highp float;
      
      in vec2 v_texCoord;
      out vec4 fragColor;
      
      uniform sampler2D u_texture;
      uniform float u_scrollOffset;
      uniform float u_textureHeight;
      
      ${colormap === 'viridis' ? viridisColormap : turboColormap}
      
      void main() {
        // Apply scroll offset (vertical scrolling)
        float y = mod(v_texCoord.y + u_scrollOffset / u_textureHeight, 1.0);
        vec2 scrolledCoord = vec2(v_texCoord.x, y);
        
        // Sample texture (grayscale magnitude)
        float magnitude = texture(u_texture, scrolledCoord).r;
        
        // Apply colormap
        vec3 color = ${colormap === 'viridis' ? 'viridis' : 'turbo'}(magnitude);
        
        fragColor = vec4(color, 1.0);
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
    
    // Create fullscreen quad
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Create texture for waterfall data
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Initialize texture with zeros
    const textureHeight = Math.ceil(retentionSeconds * 60); // 60 FPS
    const emptyData = new Uint8Array(fftSize * textureHeight);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, fftSize, textureHeight, 0, gl.RED, gl.UNSIGNED_BYTE, emptyData);
    
    textureRef.current = texture;
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (gl) {
        gl.deleteProgram(program);
        gl.deleteTexture(texture);
      }
    };
  }, [fftSize, retentionSeconds, colormap]);
  
  /**
   * Render loop
   */
  useEffect(() => {
    if (isPaused) return;
    
    const render = (time: number) => {
      if (!glRef.current || !programRef.current || !textureRef.current) return;
      
      const gl = glRef.current;
      const program = programRef.current;
      
      // Calculate delta time
      const deltaTime = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = time;
      
      // Update scroll offset
      const newOffset = scrollOffset + scrollSpeed * deltaTime;
      setScrollOffset(newOffset);
      
      // Render
      gl.useProgram(program);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // Set uniforms
      const scrollOffsetLocation = gl.getUniformLocation(program, 'u_scrollOffset');
      const textureHeightLocation = gl.getUniformLocation(program, 'u_textureHeight');
      const textureLocation = gl.getUniformLocation(program, 'u_texture');
      
      gl.uniform1f(scrollOffsetLocation, newOffset);
      gl.uniform1f(textureHeightLocation, Math.ceil(retentionSeconds * 60));
      gl.uniform1i(textureLocation, 0);
      
      // Bind texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
      
      // Draw quad
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      
      animationFrameRef.current = requestAnimationFrame(render);
    };
    
    animationFrameRef.current = requestAnimationFrame(render);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPaused, scrollOffset, scrollSpeed, width, height, retentionSeconds]);
  
  /**
   * Add new FFT data to waterfall
   */
  const addWaterfallFFT = (fftData: Float32Array) => {
    if (!glRef.current || !textureRef.current) return;
    
    const gl = glRef.current;
    const texture = textureRef.current;
    
    // Normalize FFT data to 0-255 range
    const normalized = new Uint8Array(fftData.length);
    for (let i = 0; i < fftData.length; i++) {
      // Assume fftData is in dB scale (-100 to 0)
      const value = Math.max(0, Math.min(1, (fftData[i] + 100) / 100));
      normalized[i] = Math.floor(value * 255);
    }
    
    // Update texture (shift existing data down, add new line at top)
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, bufferIndexRef.current % Math.ceil(retentionSeconds * 60), fftSize, 1, gl.RED, gl.UNSIGNED_BYTE, normalized);
    
    bufferIndexRef.current++;
  };
  
  /**
   * Clear waterfall history
   */
  const clearWaterfall = () => {
    if (!glRef.current || !textureRef.current) return;
    
    const gl = glRef.current;
    const texture = textureRef.current;
    
    const textureHeight = Math.ceil(retentionSeconds * 60);
    const emptyData = new Uint8Array(fftSize * textureHeight);
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, fftSize, textureHeight, 0, gl.RED, gl.UNSIGNED_BYTE, emptyData);
    
    setScrollOffset(0);
    bufferIndexRef.current = 0;
  };
  
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsPaused(!isPaused)}
        >
          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          {isPaused ? 'Resume' : 'Pause'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={clearWaterfall}
        >
          <Trash2 className="w-4 h-4" />
          Clear
        </Button>
        <span className="text-xs text-muted-foreground">
          {retentionSeconds}s history • {scrollSpeed}px/s
        </span>
      </div>
      
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-border rounded bg-black"
      />
      
      <div className="text-xs text-muted-foreground space-y-1">
        <div className="flex justify-between">
          <span>Time</span>
          <span>Now</span>
        </div>
        <div className="flex justify-between">
          <span>↓ {retentionSeconds}s ago</span>
          <span>↑ 0s</span>
        </div>
      </div>
    </div>
  );
}

// Export for use in other components
export { WaterfallDisplay as default };
