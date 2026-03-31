import { useRef } from "react";
import * as THREE from "three";

export default function Building() {
  const ref = useRef<THREE.Group>(null);

  return (
    <group ref={ref} position={[0, 0, 0]}>
      {/* Main tower */}
      <mesh position={[0, 6, 0]} castShadow>
        <boxGeometry args={[12, 12, 8]} />
        <meshStandardMaterial
          color="#f0f4ff"
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Glass panels per floor */}
      {[0, 4, 8].map((y, i) => (
        <group key={i}>
          {/* Floor slab */}
          <mesh position={[0, y, 0]} receiveShadow>
            <boxGeometry args={[12, 0.2, 8]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>

          {/* Window panels - front */}
          <mesh position={[0, y + 2, 4.05]}>
            <planeGeometry args={[11.5, 3.5]} />
            <meshStandardMaterial
              color="#93c5fd"
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Window panels - back */}
          <mesh position={[0, y + 2, -4.05]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[11.5, 3.5]} />
            <meshStandardMaterial
              color="#93c5fd"
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}

      {/* Roof */}
      <mesh position={[0, 12, 0]} receiveShadow>
        <boxGeometry args={[13, 0.3, 9]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>

      {/* Roof antenna */}
      <mesh position={[0, 13.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 3]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh position={[0, 15, 0]}>
        <sphereGeometry args={[0.15]} />
        <meshStandardMaterial color="#2563eb" emissive="#2563eb" emissiveIntensity={0.5} />
      </mesh>

      {/* Desk furniture per floor */}
      {[0.1, 4.1, 8.1].map((y, fi) =>
        [-3, -1, 1, 3].map((x, di) => (
          <group key={`${fi}-${di}`} position={[x, y, -1]}>
            {/* Desk */}
            <mesh position={[0, 0.5, 0]} castShadow>
              <boxGeometry args={[1.2, 0.05, 0.7]} />
              <meshStandardMaterial color="#d4a574" />
            </mesh>
            {/* Monitor */}
            <mesh position={[0, 0.8, -0.15]}>
              <boxGeometry args={[0.5, 0.35, 0.03]} />
              <meshStandardMaterial color="#1e293b" />
            </mesh>
            {/* Chair */}
            <mesh position={[0, 0.35, 0.5]}>
              <cylinderGeometry args={[0.2, 0.2, 0.05]} />
              <meshStandardMaterial color="#374151" />
            </mesh>
          </group>
        ))
      )}
    </group>
  );
}
