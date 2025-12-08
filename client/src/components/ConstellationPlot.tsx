import React, { useRef, useEffect } from 'react';

interface ConstellationPlotProps {
  width: number;
  height: number;
}

type ConstellationPlotHandle = {
  captureCanvas: () => string;
  updateSamples: (samples: Float32Array, chunkIndex?: number) => void;
};

/**
 * WebGL constellation plot with persistence/trail effect
 * 
 * Implements ping-pong framebuffer technique to create analog CRT phosphor decay effect.
 * Symbols fade with 95% opacity decay per frame, creating trails that highlight
 * statistical density of constellation points.
 * 
 * IMPORTANT: IQ sample data is stored in useRef, NOT React state.
 * Use requestAnimationFrame for smooth 60 FPS animation.
 * 
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 */
export const ConstellationPlot = React.forwardRef<ConstellationPlotHandle, ConstellationPlotProps>(
  ({ width, height }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  
  // Ping-pong framebuffers for persistence effect
  const framebuffer1Ref = useRef<WebGLFramebuffer | null>(null);
  const framebuffer2Ref = useRef<WebGLFramebuffer | null>(null);
  const texture1Ref = useRef<WebGLTexture | null>(null);
  const texture2Ref = useRef<WebGLTexture | null>(null);
  const currentFramebufferRef = useRef<0 | 1>(0);

  // High-frequency IQ data stored in ref (NOT state)
  const iqDataRef = useRef<Float32Array>(new Float32Array(0));
  
  const renderRef = useRef<((timestamp?: number) => void) | null>(null);
  const animationFrameRef = useRef<number>(0);

  // Expose capture and update methods via ref
  React.useImperativeHandle(ref, () => ({
    captureCanvas: () => {
      if (canvasRef.current) {
        return canvasRef.current.toDataURL('image/png');
      }
      return '';
    },
    updateSamples: (samples: Float32Array, _chunkIndex?: number) => {
      // Limit the number of plotted points for performance; downsample if necessary
      const MAX_POINTS = 4096;
      const totalPoints = samples.length / 2;
      if (totalPoints > MAX_POINTS) {
        const stride = Math.ceil(totalPoints / MAX_POINTS);
        const decimatedPoints = Math.min(MAX_POINTS, Math.floor(totalPoints / stride));
        const downsampled = new Float32Array(decimatedPoints * 2);

        for (let i = 0, j = 0; i < samples.length && j < downsampled.length; i += stride * 2) {
          downsampled[j++] = samples[i];
          downsampled[j++] = samples[i + 1];
        }
        iqDataRef.current = downsampled;
      } else {
        iqDataRef.current = samples;
      }

      // Ensure the render loop picks up the new data promptly
      if (!animationFrameRef.current && renderRef.current) {
        animationFrameRef.current = requestAnimationFrame(renderRef.current);
      }
    }
  }));

  // Initialize WebGL context and ping-pong framebuffers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    glRef.current = gl;

    // Vertex shader for point rendering
    const vertexShaderSource = `
      attribute vec2 a_position;
      
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        gl_PointSize = 2.0;
      }
    `;

    // Fragment shader for point color
    const fragmentShaderSource = `
      precision mediump float;
      uniform vec4 u_color;
      
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        gl_FragColor = u_color;
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

    // Create ping-pong framebuffers and textures
    const createFramebufferTexture = () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );

      return { framebuffer, texture };
    };

    const fb1 = createFramebufferTexture();
    const fb2 = createFramebufferTexture();
    framebuffer1Ref.current = fb1.framebuffer;
    framebuffer2Ref.current = fb2.framebuffer;
    texture1Ref.current = fb1.texture;
    texture2Ref.current = fb2.texture;

    // Clear both framebuffers
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb1.framebuffer);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb2.framebuffer);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [width, height]);

  // Render loop with persistence effect
  useEffect(() => {
    const render = (_timestamp?: number) => {
      const gl = glRef.current;
      const program = programRef.current;
      const iqData = iqDataRef.current;

      if (!gl || !program || !iqData || iqData.length === 0) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const fb1 = framebuffer1Ref.current;
      const fb2 = framebuffer2Ref.current;
      const tex1 = texture1Ref.current;
      const tex2 = texture2Ref.current;

      if (!fb1 || !fb2 || !tex1 || !tex2) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // Ping-pong: read from one framebuffer, write to the other
      const readFramebuffer = currentFramebufferRef.current === 0 ? fb1 : fb2;
      const writeFramebuffer = currentFramebufferRef.current === 0 ? fb2 : fb1;
      const readTexture = currentFramebufferRef.current === 0 ? tex1 : tex2;

      // Render to write framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFramebuffer);
      gl.viewport(0, 0, width, height);

      // First, draw the previous frame with 95% opacity (decay effect)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      
      // TODO: Draw previous frame texture with 0.95 alpha
      // This requires a separate shader program for texture rendering

      // Then, draw new constellation points
      gl.useProgram(program);

      // Create vertex buffer with IQ data
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, iqData, gl.DYNAMIC_DRAW);

      const positionLoc = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

      // Set point color (bright cyan for new points)
      const colorLoc = gl.getUniformLocation(program, 'u_color');
      gl.uniform4f(colorLoc, 0.0, 1.0, 1.0, 1.0); // Cyan

      // Draw points
      gl.drawArrays(gl.POINTS, 0, iqData.length / 2);

      // Copy to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      
      // TODO: Render write framebuffer texture to screen
      // This requires a full-screen quad shader

      // Swap framebuffers
      currentFramebufferRef.current = currentFramebufferRef.current === 0 ? 1 : 0;

      animationFrameRef.current = requestAnimationFrame(render);
    };
    renderRef.current = render;
    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [width, height]);

  return (
    <div className="relative bg-black" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0"
      />
      
      {/* Axis labels */}
      <div className="absolute inset-0 pointer-events-none">
        {/* I axis (horizontal) */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 font-mono">
          I
        </div>
        {/* Q axis (vertical) */}
        <div className="absolute top-1/2 left-2 -translate-y-1/2 text-xs text-gray-400 font-mono">
          Q
        </div>
        
        {/* Grid lines */}
        <svg className="absolute inset-0 w-full h-full">
          {/* Center crosshair */}
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#333" strokeWidth="1" />
          <line x1={width / 2} y1="0" x2={width / 2} y2={height} stroke="#333" strokeWidth="1" />
          
          {/* Grid circles */}
          {[0.25, 0.5, 0.75, 1.0].map((r) => (
            <circle
              key={r}
              cx={width / 2}
              cy={height / 2}
              r={(r * width) / 2}
              fill="none"
              stroke="#222"
              strokeWidth="1"
            />
          ))}
        </svg>
      </div>
    </div>
  );
});

ConstellationPlot.displayName = 'ConstellationPlot';
