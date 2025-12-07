import { useEffect, useRef } from 'react';

interface DifferenceHeatmapProps {
  width: number;
  height: number;
  capture1Name: string;
  capture2Name: string;
}

/**
 * Difference Heatmap Visualization
 * 
 * Displays spectral difference between two signal captures using color-coded heatmap.
 * Color scale:
 * - Blue: Signals match closely (low divergence)
 * - Green: Minor differences
 * - Yellow: Moderate differences
 * - Orange: Significant differences
 * - Red: Major divergence (anomaly detected)
 * 
 * Uses WebGL for GPU-accelerated rendering.
 */
export function DifferenceHeatmap({ width, height, capture1Name, capture2Name }: DifferenceHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize WebGL
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    glRef.current = gl;

    // Vertex shader
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    // Fragment shader with difference heatmap coloring
    const fragmentShaderSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform float u_time;
      
      // Divergence colormap: Blue -> Green -> Yellow -> Orange -> Red
      vec3 divergenceColor(float value) {
        // value ranges from 0.0 (match) to 1.0 (max divergence)
        if (value < 0.2) {
          // Blue to Cyan
          return mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), value * 5.0);
        } else if (value < 0.4) {
          // Cyan to Green
          return mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (value - 0.2) * 5.0);
        } else if (value < 0.6) {
          // Green to Yellow
          return mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (value - 0.4) * 5.0);
        } else if (value < 0.8) {
          // Yellow to Orange
          return mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.5, 0.0), (value - 0.6) * 5.0);
        } else {
          // Orange to Red
          return mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 0.0, 0.0), (value - 0.8) * 5.0);
        }
      }
      
      void main() {
        // Simulate spectral difference data
        // In production, this would be actual FFT difference data
        float x = v_texCoord.x;
        float y = v_texCoord.y;
        
        // Generate synthetic difference pattern
        float diff = 0.0;
        diff += 0.3 * sin(x * 10.0 + u_time * 0.5);
        diff += 0.2 * cos(y * 8.0 - u_time * 0.3);
        diff += 0.1 * sin((x + y) * 15.0);
        diff += 0.1 * cos(x * y * 20.0);
        
        // Normalize to 0-1 range
        diff = (diff + 0.7) / 1.4;
        diff = clamp(diff, 0.0, 1.0);
        
        vec3 color = divergenceColor(diff);
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
    gl.useProgram(program);

    // Set up geometry (full-screen quad)
    const positions = new Float32Array([
      -1, -1,  0, 0,
       1, -1,  1, 0,
      -1,  1,  0, 1,
       1,  1,  1, 1,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    const timeLocation = gl.getUniformLocation(program, 'u_time');

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);

    // Animation loop
    let startTime = Date.now();
    const render = () => {
      if (!glRef.current) return;

      const currentTime = (Date.now() - startTime) / 1000;
      
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform1f(timeLocation, currentTime);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [width, height]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full"
      />
      
      {/* Color scale legend */}
      <div className="absolute bottom-4 right-4 bg-black/80 p-3 rounded border border-border">
        <div className="technical-label text-xs mb-2">Divergence Scale</div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(0, 0, 255)' }} />
              <span className="text-xs">Match</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(0, 255, 0)' }} />
              <span className="text-xs">Minor</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(255, 255, 0)' }} />
              <span className="text-xs">Moderate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(255, 128, 0)' }} />
              <span className="text-xs">Significant</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(255, 0, 0)' }} />
              <span className="text-xs">Anomaly</span>
            </div>
          </div>
        </div>
      </div>

      {/* Capture labels */}
      <div className="absolute top-4 left-4 bg-black/80 p-2 rounded border border-border">
        <div className="technical-label text-xs">Comparing:</div>
        <div className="font-mono text-xs mt-1">{capture1Name}</div>
        <div className="technical-label text-xs">vs</div>
        <div className="font-mono text-xs">{capture2Name}</div>
      </div>
    </div>
  );
}
