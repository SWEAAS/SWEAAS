import * as THREE from "three";

const BUILDINGS = [
  { x: 30,  z: -24, w: 8,  d: 8,  h: 16, color: "#94a3b8" },
  { x: 26,  z: 24,  w: 10, d: 7,  h: 11, color: "#a1a1aa" },
  { x: -26, z: -20, w: 7,  d: 7,  h: 8,  color: "#d6d3d1" },
  { x: -30, z: 22,  w: 9,  d: 8,  h: 13, color: "#cbd5e1" },
  { x: 2,   z: -34, w: 12, d: 8,  h: 15, color: "#e2e8f0" },
  { x: 6,   z: 32,  w: 8,  d: 10, h: 9,  color: "#fafaf9" },
  { x: 35,  z: 2,   w: 7,  d: 9,  h: 14, color: "#f1f5f9" },
  { x: -34, z: 4,   w: 11, d: 7,  h: 7,  color: "#f5f5f4" },
] as const;

function CityBuilding({ x, z, w, d, h, color }: typeof BUILDINGS[number]) {
  const windowRows = Math.floor(h / 1.3);
  const windowCols = Math.floor(w / 1.6);

  return (
    <group position={[x, 0, z]}>
      {/* Body */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>

      {/* Glass facade front */}
      <mesh position={[0, h / 2, d / 2 + 0.01]}>
        <planeGeometry args={[w - 0.5, h - 0.5]} />
        <meshStandardMaterial color="#bfdbfe" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>

      {/* Windows – deterministic lit pattern */}
      {Array.from({ length: windowRows }, (_, row) =>
        Array.from({ length: windowCols }, (_, col) => {
          const wy = 1.5 + row * 1.3;
          if (wy > h - 1) return null;
          const lit = ((row * 7 + col * 13) % 3) !== 0;
          return (
            <mesh key={`${row}-${col}`} position={[-w / 2 + 1 + col * 1.6, wy, d / 2 + 0.02]}>
              <planeGeometry args={[0.7, 0.6]} />
              <meshStandardMaterial
                color={lit ? "#fef9c3" : "#1e293b"}
                emissive={lit ? "#fef9c3" : "#000000"}
                emissiveIntensity={lit ? 0.12 : 0}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        })
      )}

      {/* Entrance recess */}
      <mesh position={[0, 1, d / 2 + 0.02]}>
        <planeGeometry args={[2, 2]} />
        <meshStandardMaterial color="#1e293b" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* Roof cap */}
      <mesh position={[0, h + 0.1, 0]} receiveShadow>
        <boxGeometry args={[w + 0.3, 0.2, d + 0.3]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>

      {/* Rooftop antenna */}
      <mesh position={[w * 0.3, h + 1.5, -d * 0.2]}>
        <cylinderGeometry args={[0.04, 0.04, 2.8, 4]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
    </group>
  );
}

/** Ground-level roads (simple flat strips). */
function Roads() {
  return (
    <group>
      {/* N-S road */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4, 100]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      {/* E-W road */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} receiveShadow>
        <planeGeometry args={[4, 100]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      {/* Sidewalks */}
      {[-2.5, 2.5].map((off, i) => (
        <mesh key={`ns-${i}`} position={[off, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[0.8, 100]} />
          <meshStandardMaterial color="#d6d3d1" />
        </mesh>
      ))}
      {[-2.5, 2.5].map((off, i) => (
        <mesh key={`ew-${i}`} position={[0, 0.015, off]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} receiveShadow>
          <planeGeometry args={[0.8, 100]} />
          <meshStandardMaterial color="#d6d3d1" />
        </mesh>
      ))}
    </group>
  );
}

/** Street lamps near intersections. */
function StreetLamps() {
  const positions: [number, number, number][] = [
    [6, 0, 6], [-6, 0, 6], [6, 0, -6], [-6, 0, -6],
    [18, 0, 0], [-18, 0, 0], [0, 0, 18], [0, 0, -18],
  ];
  return (
    <group>
      {positions.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 2, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 4, 6]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
          <mesh position={[0, 4.2, 0]}>
            <sphereGeometry args={[0.2, 8, 8]} />
            <meshStandardMaterial color="#fef9c3" emissive="#fef9c3" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function CityBuildings() {
  return (
    <group>
      {BUILDINGS.map((b, i) => <CityBuilding key={i} {...b} />)}
      <Roads />
      <StreetLamps />
    </group>
  );
}
