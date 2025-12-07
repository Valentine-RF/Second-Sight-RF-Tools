import { useEffect, useRef } from 'react';

interface WaterfallDisplayProps {
  width: number;
  height: number;
  data?: Float32Array; // FFT magnitude data
  colormap?: 'viridis' | 'turbo';
}

/**
 * WebGL-accelerated waterfall display showing time-domain signal evolution.
 * Uses scrolling texture technique for real-time updates.
 * 
 * Technical specs:
 * - Vertical axis: Time (newest at top, scrolls down)
 * - Horizontal axis: Frequency bins
 * - Color: Amplitude (dB scale)
 * - Update rate: 60 FPS via requestAnimationFrame
 * - Data storage: useRef to avoid re-renders (per best practices)
 */
export function WaterfallDisplay({ width, height, data, colormap = 'viridis' }: WaterfallDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationRef = useRef<number | null>(null);
  const dataBufferRef = useRef<Uint8Array | null>(null);
  const scrollOffsetRef = useRef(0);

  // Vertex shader for fullscreen quad
  const vertexShaderSource = `
    attribute vec2 a_position;
    varying vec2 v_texCoord;
    
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_position * 0.5 + 0.5;
    }
  `;

  // Fragment shader with waterfall rendering and colormap
  const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform float u_scrollOffset;
    varying vec2 v_texCoord;
    
    // Viridis colormap
    vec3 viridis(float t) {
      const vec3 c0 = vec3(0.267004, 0.004874, 0.329415);
      const vec3 c1 = vec3(0.127568, 0.566949, 0.550556);
      const vec3 c2 = vec3(0.993248, 0.906157, 0.143936);
      
      float t2 = t * t;
      float t3 = t2 * t;
      
      return c0 + t * (c1 - c0) + t2 * (c2 - c1);
    }
    
    // Turbo colormap
    vec3 turbo(float t) {
      const vec3 c0 = vec3(0.1140890109226559, 0.06288340699912215, 0.2248337216805064);
      const vec3 c1 = vec3(6.716419496985708, 3.182286745507602, 7.571581586103393);
      const vec3 c2 = vec3(-66.09402360453038, -4.9279827041226, -10.09439367561635);
      const vec3 c3 = vec3(228.7660791526501, 25.04986699771073, -91.54105330182436);
      
      return c0 + t * c1 + t * t * c2 + t * t * t * c3;
    }
    
    void main() {
      // Apply scroll offset to create waterfall effect
      vec2 scrolledCoord = vec2(v_texCoord.x, mod(v_texCoord.y + u_scrollOffset, 1.0));
      
      // Sample texture
      float intensity = texture2D(u_texture, scrolledCoord).r;
      
      // Apply colormap
      vec3 color = ${colormap === 'turbo' ? 'turbo(intensity)' : 'viridis(intensity)'};
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    glRef.current = gl;

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
    gl.useProgram(program);

    programRef.current = program;

    // Create fullscreen quad
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
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

    // Initialize with empty data
    const textureWidth = 512; // Frequency bins
    const textureHeight = 512; // Time samples
    const emptyData = new Uint8Array(textureWidth * textureHeight);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, textureWidth, textureHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, emptyData);

    textureRef.current = texture;
    dataBufferRef.current = emptyData;

    // Animation loop using requestAnimationFrame (per best practices)
    const render = () => {
      if (!gl || !program) return;

      // Update scroll offset for waterfall effect
      scrollOffsetRef.current += 0.002; // Scroll speed
      if (scrollOffsetRef.current > 1.0) {
        scrollOffsetRef.current -= 1.0;
      }

      // Set uniforms
      const scrollOffsetLocation = gl.getUniformLocation(program, 'u_scrollOffset');
      gl.uniform1f(scrollOffsetLocation, scrollOffsetRef.current);

      // Render
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (gl) {
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(positionBuffer);
        gl.deleteTexture(texture);
      }
    };
  }, [colormap]);

  // Update texture when new data arrives (using useRef to avoid re-renders)
  useEffect(() => {
    if (!data || !glRef.current || !textureRef.current || !dataBufferRef.current) return;

    const gl = glRef.current;
    const buffer = dataBufferRef.current;

    // Convert Float32Array to Uint8Array (normalize to 0-255)
    const normalized = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      // Assume data is in dB scale (-100 to 0)
      const normalized_val = Math.max(0, Math.min(255, ((data[i] + 100) / 100) * 255));
      normalized[i] = normalized_val;
    }

    // Scroll buffer down by one line
    const width = 512;
    const height = 512;
    for (let y = height - 1; y > 0; y--) {
      for (let x = 0; x < width; x++) {
        buffer[y * width + x] = buffer[(y - 1) * width + x];
      }
    }

    // Insert new data at top
    for (let x = 0; x < Math.min(width, normalized.length); x++) {
      buffer[x] = normalized[x];
    }

    // Update texture
    gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, buffer);
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full h-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
