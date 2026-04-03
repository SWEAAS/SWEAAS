import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─── Sub-components ──────────────────────────────────────────────────────────

function ParkTree({ position, height = 2.5 }: { position: [number, number, number]; height?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, height * 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, height * 0.7, 6]} />
        <meshStandardMaterial color="#78350f" />
      </mesh>
      <mesh position={[0, height * 0.75, 0]} castShadow>
        <coneGeometry args={[height * 0.35, height * 0.55, 8]} />
        <meshStandardMaterial color="#15803d" />
      </mesh>
      <mesh position={[0, height * 0.92, 0]} castShadow>
        <coneGeometry args={[height * 0.22, height * 0.3, 8]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>
    </group>
  );
}

function FlowerBed({ position, color = "#f43f5e" }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh receiveShadow>
        <boxGeometry args={[2, 0.12, 1.5]} />
        <meshStandardMaterial color="#5c3d1a" />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[
          Math.cos(i * Math.PI / 4) * 0.5 + (i % 2) * 0.15,
          0.15,
          Math.sin(i * Math.PI / 4) * 0.35,
        ]}>
          <sphereGeometry args={[0.1, 6, 6]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

function EnergyBeam({ x, z, height }: { x: number; z: number; height: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      const mat = ref.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.22 + Math.sin(state.clock.elapsedTime * 2 + x) * 0.08;
    }
  });
  return (
    <mesh ref={ref} position={[x, -height / 2, z]}>
      <cylinderGeometry args={[0.15, 0.45, height, 8]} />
      <meshStandardMaterial
        color="#3b82f6"
        emissive="#3b82f6"
        emissiveIntensity={0.5}
        transparent
        opacity={0.25}
      />
    </mesh>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface FloatingPlatformProps {
  position: [number, number, number];
  radius?: number;
}

export default function FloatingPlatform({ position, radius = 22 }: FloatingPlatformProps) {
  const py = position[1];
  const beamR = radius * 0.7;

  const trees: [number, number, number][] = [
    [-12, 0.1, -10], [-14, 0.1, 5], [12, 0.1, -8], [14, 0.1, 7],
    [-10, 0.1, 12], [10, 0.1, 12], [-8, 0.1, -14], [8, 0.1, -14],
    [-16, 0.1, -2], [16, 0.1, -2], [-6, 0.1, 16], [6, 0.1, 16],
    [-18, 0.1, 8], [18, 0.1, 8], [-15, 0.1, -12], [15, 0.1, -12],
  ];

  return (
    <group position={position}>
      {/* ── Platform disc ── */}
      <mesh position={[0, -0.5, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[radius, radius * 0.85, 2, 48]} />
        <meshStandardMaterial color="#78716c" roughness={0.9} />
      </mesh>

      {/* ── Grass surface ── */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[radius - 0.3, radius - 0.3, 0.1, 48]} />
        <meshStandardMaterial color="#86efac" />
      </mesh>

      {/* ── Rocky underside stalactites ── */}
      {Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2;
        const r = radius * (0.3 + (i % 4) * 0.1);
        return (
          <mesh key={`rock-${i}`} position={[
            Math.cos(angle) * r,
            -2 - (i % 5) * 0.7,
            Math.sin(angle) * r,
          ]} rotation={[0, angle, Math.PI]}>
            <coneGeometry args={[1.2 + (i % 3) * 0.5, 1.5 + (i % 4) * 1.2, 5]} />
            <meshStandardMaterial color="#78716c" roughness={0.95} />
          </mesh>
        );
      })}

      {/* ── Walking paths (cross pattern) ── */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.2, radius * 1.7]} />
        <meshStandardMaterial color="#d6d3d1" />
      </mesh>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} receiveShadow>
        <planeGeometry args={[2.2, radius * 1.7]} />
        <meshStandardMaterial color="#d6d3d1" />
      </mesh>

      {/* ── Trees ── */}
      {trees.map((tp, i) => (
        <ParkTree key={i} position={tp} height={2 + (i % 3) * 0.8} />
      ))}

      {/* ── Flower beds ── */}
      <FlowerBed position={[-9, 0.06, 7]} color="#f43f5e" />
      <FlowerBed position={[9, 0.06, -7]} color="#a78bfa" />
      <FlowerBed position={[-7, 0.06, -9]} color="#fbbf24" />
      <FlowerBed position={[7, 0.06, 9]} color="#34d399" />

      {/* ── Park benches ── */}
      {([[-5, 4], [5, -4], [-4, -5], [4, 5]] as [number, number][]).map(([bx, bz], i) => (
        <group key={`bench-${i}`} position={[bx, 0.06, bz]}>
          <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.8, 0.05, 0.3]} /><meshStandardMaterial color="#78350f" /></mesh>
          <mesh position={[0, 0.45, -0.13]}><boxGeometry args={[0.8, 0.35, 0.04]} /><meshStandardMaterial color="#78350f" /></mesh>
          {[-0.32, 0.32].map((lx, j) => (
            <mesh key={j} position={[lx, 0.12, 0]}>
              <boxGeometry args={[0.04, 0.24, 0.28]} />
              <meshStandardMaterial color="#374151" />
            </mesh>
          ))}
        </group>
      ))}

      {/* ── Fountain ── */}
      <group position={[13, 0.06, 13]}>
        <mesh><cylinderGeometry args={[1.5, 1.5, 0.3, 16]} /><meshStandardMaterial color="#94a3b8" /></mesh>
        <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[1.3, 1.3, 0.15, 16]} /><meshStandardMaterial color="#3b82f6" transparent opacity={0.55} /></mesh>
        <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.08, 0.08, 0.8, 8]} /><meshStandardMaterial color="#94a3b8" /></mesh>
      </group>

      {/* ── Energy beams to ground ── */}
      <EnergyBeam x={-beamR} z={-beamR} height={py} />
      <EnergyBeam x={beamR}  z={-beamR} height={py} />
      <EnergyBeam x={-beamR} z={beamR}  height={py} />
      <EnergyBeam x={beamR}  z={beamR}  height={py} />

      {/* ── Edge glow ring ── */}
      <mesh position={[0, -0.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius - 0.5, 0.18, 8, 48]} />
        <meshStandardMaterial
          color="#3b82f6"
          emissive="#3b82f6"
          emissiveIntensity={0.4}
          transparent
          opacity={0.45}
        />
      </mesh>

      {/* ── Underside glow disc ── */}
      <mesh position={[0, -1.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.6, 32]} />
        <meshStandardMaterial
          color="#3b82f6"
          emissive="#3b82f6"
          emissiveIntensity={0.2}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
