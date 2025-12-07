import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';

interface SCFSurfaceProps {
  width: number;
  height: number;
  scfData?: Float32Array; // 2D matrix: Spectral Freq × Cyclic Freq
  spectralFreqCount?: number;
  cyclicFreqCount?: number;
}

/**
 * 3D surface mesh component for SCF visualization
 * Uses PlaneGeometry with Z-height displacement from SCF magnitude
 */
function SCFMesh({ 
  scfData, 
  spectralFreqCount = 128, 
  cyclicFreqCount = 128 
}: {
  scfData?: Float32Array;
  spectralFreqCount: number;
  cyclicFreqCount: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Generate geometry with Z-height from SCF data
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      10, // width
      10, // height
      spectralFreqCount - 1, // width segments
      cyclicFreqCount - 1 // height segments
    );

    if (scfData && scfData.length === spectralFreqCount * cyclicFreqCount) {
      const positions = geo.attributes.position;
      
      // Displace Z coordinate based on SCF magnitude
      for (let i = 0; i < positions.count; i++) {
        const scfValue = scfData[i] || 0;
        // Normalize and scale for visualization
        const zHeight = scfValue * 5; // Scale factor for visibility
        positions.setZ(i, zHeight);
      }
      
      positions.needsUpdate = true;
      geo.computeVertexNormals(); // Recompute normals for proper lighting
    }

    return geo;
  }, [scfData, spectralFreqCount, cyclicFreqCount]);

  // Rotate mesh slowly for better visualization
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.z += 0.001;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color="#00ffff"
        wireframe={false}
        side={THREE.DoubleSide}
        metalness={0.3}
        roughness={0.7}
      />
    </mesh>
  );
}

/**
 * Three.js 3D SCF Surface Visualization
 * 
 * Displays the Spectral Correlation Function as an interactive 3D surface.
 * The Z-height of each vertex represents the SCF magnitude at that
 * (spectral frequency, cyclic frequency) coordinate.
 * 
 * Features:
 * - PlaneGeometry with Z-displacement from SCF data
 * - OrbitControls for rotation, zoom, and pan
 * - Lighting for depth perception
 * - Grid for spatial reference
 * - Wireframe option for detailed inspection
 * 
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param scfData - 1D array of SCF magnitudes (row-major: spectral × cyclic)
 * @param spectralFreqCount - Number of spectral frequency bins
 * @param cyclicFreqCount - Number of cyclic frequency bins
 */
export function SCFSurface({ 
  width, 
  height, 
  scfData,
  spectralFreqCount = 128,
  cyclicFreqCount = 128
}: SCFSurfaceProps) {
  return (
    <div style={{ width, height }} className="bg-gray-900">
      <Canvas
        camera={{
          position: [15, 15, 15],
          fov: 50,
        }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <pointLight position={[-10, -10, -5]} intensity={0.5} color="#00ffff" />

        {/* SCF Surface Mesh */}
        <SCFMesh
          scfData={scfData}
          spectralFreqCount={spectralFreqCount}
          cyclicFreqCount={cyclicFreqCount}
        />

        {/* Reference Grid */}
        <Grid
          args={[20, 20]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#444444"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#666666"
          fadeDistance={50}
          fadeStrength={1}
          followCamera={false}
          position={[0, 0, -2]}
        />

        {/* Orbit Controls for interaction */}
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
          panSpeed={0.5}
          minDistance={5}
          maxDistance={50}
        />

        {/* Axes Helper */}
        <axesHelper args={[8]} />
      </Canvas>

      {/* Axis Labels */}
      <div className="absolute bottom-4 left-4 text-xs text-gray-400 font-mono space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-red-500" />
          <span>Spectral Frequency (f)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-green-500" />
          <span>Cyclic Frequency (α)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-blue-500" />
          <span>SCF Magnitude</span>
        </div>
      </div>

      {/* Controls Help */}
      <div className="absolute top-4 right-4 text-xs text-gray-400 font-mono space-y-1">
        <div>Left Click + Drag: Rotate</div>
        <div>Right Click + Drag: Pan</div>
        <div>Scroll: Zoom</div>
      </div>
    </div>
  );
}
