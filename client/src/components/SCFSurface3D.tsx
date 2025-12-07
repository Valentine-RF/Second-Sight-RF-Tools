/**
 * SCF Surface 3D Visualization
 * 
 * Displays Spectral Correlation Function (SCF) from FAM algorithm
 * as an interactive 3D surface plot using Three.js
 */

import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';

interface SCFSurface3DProps {
  scfMagnitude: number[];  // Flattened 2D array
  spectralFreqs: number[];
  cyclicFreqs: number[];
  shape: {
    cyclic: number;
    spectral: number;
  };
  colormap?: 'viridis' | 'plasma' | 'hot';
}

/**
 * Convert normalized magnitude (0-1) to color using colormap
 */
function magnitudeToColor(value: number, colormap: string = 'viridis'): THREE.Color {
  // Clamp value to [0, 1]
  const v = Math.max(0, Math.min(1, value));
  
  if (colormap === 'hot') {
    // Hot colormap: black -> red -> yellow -> white
    if (v < 0.33) {
      return new THREE.Color(v * 3, 0, 0);
    } else if (v < 0.66) {
      return new THREE.Color(1, (v - 0.33) * 3, 0);
    } else {
      return new THREE.Color(1, 1, (v - 0.66) * 3);
    }
  } else if (colormap === 'plasma') {
    // Plasma-like colormap
    const r = Math.sqrt(v);
    const g = v * v * v;
    const b = Math.sin(v * Math.PI);
    return new THREE.Color(r, g, b);
  } else {
    // Viridis-like colormap (default)
    const r = v < 0.5 ? 0 : (v - 0.5) * 2;
    const g = v;
    const b = v < 0.5 ? v * 2 : 1 - (v - 0.5) * 2;
    return new THREE.Color(r, g, b);
  }
}

/**
 * Cross-section Slicing Plane Component
 */
function SlicingPlane({ shape, scfMagnitude }: { shape: { cyclic: number; spectral: number }; scfMagnitude: number[] }) {
  const [slicePosition, setSlicePosition] = useState(0);
  const planeRef = useRef<THREE.Mesh>(null);

  // Create 2D slice geometry
  const sliceGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(10, 3, shape.spectral - 1, 1);
    const positions = geo.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    // Sample SCF at slice position
    const sliceIdx = Math.floor(slicePosition * shape.cyclic);
    for (let i = 0; i < shape.spectral; i++) {
      const idx = sliceIdx * shape.spectral + i;
      const magnitude = scfMagnitude[idx] || 0;
      
      // Set Z-height
      positions.setZ(i, magnitude * 3);
      positions.setZ(i + shape.spectral, magnitude * 3);
      
      // Set color
      const color = new THREE.Color(magnitude, magnitude * 0.5, 1 - magnitude);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      colors[(i + shape.spectral) * 3] = color.r;
      colors[(i + shape.spectral) * 3 + 1] = color.g;
      colors[(i + shape.spectral) * 3 + 2] = color.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [slicePosition, shape, scfMagnitude]);

  return (
    <mesh
      ref={planeRef}
      geometry={sliceGeometry}
      position={[0, (slicePosition - 0.5) * 10, 0]}
      rotation={[-Math.PI / 4, 0, 0]}
    >
      <meshBasicMaterial
        vertexColors
        side={THREE.DoubleSide}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
}

/**
 * 3D Surface Mesh Component
 */
function SurfaceMesh({ scfMagnitude, spectralFreqs, cyclicFreqs, shape, colormap = 'viridis' }: SCFSurface3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Create geometry with Z-displacement based on SCF magnitude
  const geometry = useMemo(() => {
    const { cyclic, spectral } = shape;
    const geo = new THREE.PlaneGeometry(10, 10, spectral - 1, cyclic - 1);
    
    // Displace vertices based on SCF magnitude
    const positions = geo.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    
    for (let i = 0; i < positions.count; i++) {
      const magnitude = scfMagnitude[i] || 0;
      
      // Set Z-height based on magnitude
      positions.setZ(i, magnitude * 3);  // Scale factor for visibility
      
      // Set vertex color based on magnitude
      const color = magnitudeToColor(magnitude, colormap);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    
    return geo;
  }, [scfMagnitude, shape, colormap]);
  
  // Gentle rotation animation
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.1) * 0.05;
    }
  });
  
  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 4, 0, 0]}>
      <meshStandardMaterial
        vertexColors
        wireframe={false}
        side={THREE.DoubleSide}
        metalness={0.3}
        roughness={0.7}
      />
    </mesh>
  );
}

/**
 * Main SCF Surface 3D Component
 */
export default function SCFSurface3D(props: SCFSurface3DProps) {
  if (!props.scfMagnitude || props.scfMagnitude.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400">
        <div className="text-center">
          <p className="text-lg font-semibold">No SCF Data</p>
          <p className="text-sm mt-2">Select a signal region and run "Analyze Cycles"</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="w-full h-full bg-gray-950">
      <Canvas
        camera={{ position: [15, 15, 15], fov: 50 }}
        gl={{ antialias: true }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <pointLight position={[-10, -10, -5]} intensity={0.5} />
        
        {/* 3D Surface */}
        <SurfaceMesh {...props} />
        
        {/* Cross-section slicing plane */}
        <SlicingPlane shape={props.shape} scfMagnitude={props.scfMagnitude} />
        
        {/* Grid helper */}
        <Grid
          args={[20, 20]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#6b7280"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#9ca3af"
          fadeDistance={30}
          fadeStrength={1}
          followCamera={false}
        />
        
        {/* Orbit controls for rotation */}
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
          minDistance={5}
          maxDistance={50}
        />
      </Canvas>
      
      {/* Overlay labels */}
      <div className="absolute bottom-4 left-4 text-white text-xs space-y-1 pointer-events-none">
        <div className="bg-black/50 px-2 py-1 rounded">
          <span className="font-semibold">Spectral Frequency:</span> {props.spectralFreqs[0]?.toFixed(2)} - {props.spectralFreqs[props.spectralFreqs.length - 1]?.toFixed(2)} Hz
        </div>
        <div className="bg-black/50 px-2 py-1 rounded">
          <span className="font-semibold">Cyclic Frequency:</span> {props.cyclicFreqs[0]?.toFixed(2)} - {props.cyclicFreqs[props.cyclicFreqs.length - 1]?.toFixed(2)} Hz
        </div>
        <div className="bg-black/50 px-2 py-1 rounded">
          <span className="font-semibold">Shape:</span> {props.shape.cyclic} × {props.shape.spectral}
        </div>
      </div>
      
      {/* Controls hint */}
      <div className="absolute top-4 right-4 text-white text-xs bg-black/50 px-3 py-2 rounded pointer-events-none">
        <p className="font-semibold mb-1">Controls:</p>
        <p>Left-click + drag: Rotate</p>
        <p>Scroll: Zoom</p>
        <p>Right-click + drag: Pan</p>
      </div>
    </div>
  );
}
