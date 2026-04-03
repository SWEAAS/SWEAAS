import { useRef } from "react";
import { Html, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Agent } from "../store/agentStore";

interface CTOOfficeProps {
  agent: Agent;
  position: [number, number, number];
  onClick: () => void;
}

function LoungeChair({
  position,
  rotation = 0,
}: {
  position: [number, number, number];
  rotation?: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.9, 0.12, 0.9]} />
        <meshStandardMaterial color="#d8dee9" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.72, -0.28]} castShadow>
        <boxGeometry args={[0.9, 0.72, 0.12]} />
        <meshStandardMaterial color="#d8dee9" roughness={0.8} />
      </mesh>
      <mesh position={[-0.4, 0.54, 0]} castShadow>
        <boxGeometry args={[0.1, 0.5, 0.82]} />
        <meshStandardMaterial color="#cfd8e3" roughness={0.8} />
      </mesh>
      <mesh position={[0.4, 0.54, 0]} castShadow>
        <boxGeometry args={[0.1, 0.5, 0.82]} />
        <meshStandardMaterial color="#cfd8e3" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.08, 5]} />
        <meshStandardMaterial color="#5b6470" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Planter({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!ref.current) {
      return;
    }

    ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.8 + position[0]) * 0.025;
  });

  return (
    <group ref={ref} position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.24, 0.28, 0.42, 18]} />
        <meshStandardMaterial color="#b89367" roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow>
        <sphereGeometry args={[0.34, 18, 16]} />
        <meshStandardMaterial color="#3f7f5a" roughness={0.95} />
      </mesh>
      <mesh position={[-0.12, 0.64, 0.03]} castShadow>
        <sphereGeometry args={[0.2, 14, 12]} />
        <meshStandardMaterial color="#59a66d" roughness={0.95} />
      </mesh>
      <mesh position={[0.14, 0.58, -0.08]} castShadow>
        <sphereGeometry args={[0.18, 14, 12]} />
        <meshStandardMaterial color="#4f9765" roughness={0.95} />
      </mesh>
    </group>
  );
}

function Pendant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, -0.55, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 1.1, 8]} />
        <meshStandardMaterial color="#b8c2d1" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, -1.12, 0]}>
        <cylinderGeometry args={[0.24, 0.28, 0.18, 24]} />
        <meshStandardMaterial
          color="#fff4d6"
          emissive="#ffe7ad"
          emissiveIntensity={0.45}
          roughness={0.4}
        />
      </mesh>
      <pointLight position={[0, -1.1, 0]} intensity={0.5} distance={5} color="#ffe5b4" />
    </group>
  );
}

export default function CTOOffice({ agent, position, onClick }: CTOOfficeProps) {
  const screenGlowRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const pulse = 0.2 + Math.sin(state.clock.elapsedTime * 1.3) * 0.06;

    if (screenGlowRef.current) {
      const material = screenGlowRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = pulse;
    }

    if (haloRef.current) {
      const material = haloRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.32 + Math.sin(state.clock.elapsedTime * 1.8) * 0.08;
    }
  });

  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <mesh position={[0, 0.01, 0]} receiveShadow>
        <boxGeometry args={[12.8, 0.04, 8.8]} />
        <meshPhysicalMaterial
          color="#edf4ff"
          roughness={0.4}
          metalness={0.08}
          clearcoat={0.28}
          clearcoatRoughness={0.34}
        />
      </mesh>

      <mesh position={[0, 0.03, 0.8]} receiveShadow>
        <boxGeometry args={[7.2, 0.015, 4.2]} />
        <meshStandardMaterial color="#d6b98f" roughness={0.85} />
      </mesh>

      <mesh position={[0, 1.45, -4.18]} castShadow>
        <boxGeometry args={[11.6, 2.9, 0.16]} />
        <meshStandardMaterial color="#132033" roughness={0.72} />
      </mesh>

      <mesh position={[-5.1, 1.35, -1.2]} castShadow>
        <boxGeometry args={[0.12, 2.7, 5.8]} />
        <meshPhysicalMaterial
          color="#dbeafe"
          transparent
          opacity={0.18}
          transmission={0.92}
          roughness={0.04}
          metalness={0}
          ior={1.45}
          thickness={0.4}
        />
      </mesh>
      <mesh position={[5.1, 1.35, -1.2]} castShadow>
        <boxGeometry args={[0.12, 2.7, 5.8]} />
        <meshPhysicalMaterial
          color="#dbeafe"
          transparent
          opacity={0.18}
          transmission={0.92}
          roughness={0.04}
          metalness={0}
          ior={1.45}
          thickness={0.4}
        />
      </mesh>

      <group position={[0, 0, -0.2]}>
        <mesh position={[0, 0.74, -0.5]} castShadow>
          <boxGeometry args={[3.8, 0.1, 1.5]} />
          <meshStandardMaterial color="#744d2f" roughness={0.5} metalness={0.08} />
        </mesh>
        <mesh position={[-1.55, 0.39, -0.5]} castShadow>
          <boxGeometry args={[0.14, 0.74, 1.34]} />
          <meshStandardMaterial color="#2f3746" metalness={0.48} roughness={0.35} />
        </mesh>
        <mesh position={[1.55, 0.39, -0.5]} castShadow>
          <boxGeometry args={[0.14, 0.74, 1.34]} />
          <meshStandardMaterial color="#2f3746" metalness={0.48} roughness={0.35} />
        </mesh>

        <mesh position={[0, 1.15, -1.02]} castShadow>
          <boxGeometry args={[2.5, 0.82, 0.06]} />
          <meshStandardMaterial color="#111827" metalness={0.18} roughness={0.36} />
        </mesh>
        <mesh ref={screenGlowRef} position={[0, 1.15, -0.98]}>
          <boxGeometry args={[2.28, 0.66, 0.02]} />
          <meshStandardMaterial color="#0f172a" emissive="#60a5fa" emissiveIntensity={0.2} />
        </mesh>
        <mesh position={[0, 0.88, -1.02]}>
          <cylinderGeometry args={[0.03, 0.03, 0.34, 10]} />
          <meshStandardMaterial color="#5b6470" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.7, -1.02]}>
          <boxGeometry args={[0.62, 0.04, 0.22]} />
          <meshStandardMaterial color="#343d4b" metalness={0.35} roughness={0.4} />
        </mesh>

        <mesh position={[0, 0.78, 0.2]} castShadow>
          <boxGeometry args={[0.54, 0.03, 0.18]} />
          <meshStandardMaterial color="#d7dde6" roughness={0.45} />
        </mesh>
        <mesh position={[1.08, 0.79, 0.1]} castShadow>
          <boxGeometry args={[0.24, 0.06, 0.24]} />
          <meshStandardMaterial color="#f6f7fb" roughness={0.6} />
        </mesh>
        <mesh position={[-1.08, 0.82, 0.1]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.1, 18]} />
          <meshStandardMaterial color="#ece7da" roughness={0.6} />
        </mesh>
        <mesh position={[-1.08, 0.87, 0.1]} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.02, 18]} />
          <meshStandardMaterial color="#3d2613" roughness={0.8} />
        </mesh>

        <group position={[0, 0, 1.12]} rotation={[0, Math.PI, 0]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[0.62, 0.08, 0.62]} />
            <meshStandardMaterial color="#202b39" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.86, -0.26]} castShadow>
            <boxGeometry args={[0.6, 0.84, 0.08]} />
            <meshStandardMaterial color="#202b39" roughness={0.45} />
          </mesh>
          <mesh position={[-0.34, 0.6, 0]} castShadow>
            <boxGeometry args={[0.08, 0.42, 0.56]} />
            <meshStandardMaterial color="#2a3545" roughness={0.45} />
          </mesh>
          <mesh position={[0.34, 0.6, 0]} castShadow>
            <boxGeometry args={[0.08, 0.42, 0.56]} />
            <meshStandardMaterial color="#2a3545" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.26, 10]} />
            <meshStandardMaterial color="#5b6470" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.06, 0]} rotation={[0, Math.PI / 5, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.05, 5]} />
            <meshStandardMaterial color="#3c4654" metalness={0.55} roughness={0.38} />
          </mesh>
        </group>
      </group>

      <group position={[-2.8, 0, 2.1]}>
        <LoungeChair position={[-0.7, 0, 0]} rotation={Math.PI / 10} />
        <LoungeChair position={[0.85, 0, 0.18]} rotation={-Math.PI / 7} />
        <mesh position={[0.1, 0.26, 0.08]} castShadow>
          <cylinderGeometry args={[0.52, 0.58, 0.08, 28]} />
          <meshStandardMaterial color="#7a5537" roughness={0.45} metalness={0.05} />
        </mesh>
        <mesh position={[0.1, 0.12, 0.08]}>
          <cylinderGeometry args={[0.14, 0.2, 0.24, 16]} />
          <meshStandardMaterial color="#606a78" metalness={0.55} roughness={0.36} />
        </mesh>
      </group>

      <group position={[3.8, 0, 2.2]}>
        <mesh position={[0, 1.05, 0]} castShadow>
          <boxGeometry args={[1.6, 2.1, 0.44]} />
          <meshStandardMaterial color="#7a5537" roughness={0.55} />
        </mesh>
        {[0.5, 0, -0.5].map((y, index) => (
          <mesh key={index} position={[0, 1.05 + y, 0.24]} castShadow>
            <boxGeometry args={[1.44, 0.04, 0.34]} />
            <meshStandardMaterial color="#9c7048" roughness={0.45} />
          </mesh>
        ))}
        {[
          [-0.42, 1.48, 0.06, "#dbeafe"],
          [0.2, 1.02, -0.06, "#fde68a"],
          [-0.12, 0.56, 0.02, "#c7d2fe"],
        ].map(([x, y, z, color], index) => (
          <mesh key={index} position={[x as number, y as number, z as number]} castShadow>
            <boxGeometry args={[0.34, 0.48, 0.2]} />
            <meshStandardMaterial color={color as string} roughness={0.9} />
          </mesh>
        ))}
      </group>

      <mesh position={[0, 1.48, -3.98]} castShadow>
        <boxGeometry args={[4.6, 1.9, 0.08]} />
        <meshStandardMaterial color="#0b1220" roughness={0.5} />
      </mesh>
      <mesh ref={haloRef} position={[0, 1.48, -3.93]}>
        <boxGeometry args={[4.25, 1.58, 0.03]} />
        <meshStandardMaterial color="#101b31" emissive="#3b82f6" emissiveIntensity={0.32} />
      </mesh>

      <Html
        position={[0, 1.48, -3.88]}
        transform
        occlude={false}
        scale={0.025}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            width: "360px",
            height: "126px",
            borderRadius: "10px",
            padding: "14px 16px",
            background: "linear-gradient(160deg, rgba(9,16,31,0.96), rgba(17,31,58,0.94))",
            border: "1px solid rgba(96,165,250,0.26)",
            color: "#dbeafe",
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            boxShadow: "0 20px 50px rgba(15,23,42,0.4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#93c5fd" }}>
              Executive Briefing
            </span>
            <span style={{ fontSize: "10px", color: "#7dd3fc" }}>Top Floor</span>
          </div>
          <div style={{ marginTop: "10px", fontSize: "18px", fontWeight: 700, color: "#f8fbff" }}>{agent.name}</div>
          <div style={{ marginTop: "4px", fontSize: "12px", color: "#cbd5e1", textTransform: "capitalize" }}>
            {agent.role.replace(/_/g, " ")}
          </div>
          <div style={{ marginTop: "12px", fontSize: "12px", lineHeight: 1.45, color: "#bfdbfe" }}>
            {agent.current_focus || "Coordinating strategy, architecture, and delivery across the team."}
          </div>
        </div>
      </Html>

      <Text
        position={[0, 2.78, -3.84]}
        fontSize={0.26}
        color="#eaf3ff"
        anchorX="center"
        anchorY="middle"
        maxWidth={5}
      >
        CTO Office
      </Text>

      <Pendant position={[-1.4, 3.1, -0.2]} />
      <Pendant position={[1.4, 3.1, -0.2]} />
      <rectAreaLight
        width={4.2}
        height={2.6}
        intensity={7}
        color="#9cd3ff"
        position={[-4.65, 1.75, -0.8]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <rectAreaLight
        width={4.2}
        height={2.6}
        intensity={5.5}
        color="#bfe2ff"
        position={[4.65, 1.75, -0.8]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <spotLight
        position={[0, 3.4, 1.6]}
        angle={0.42}
        penumbra={0.9}
        intensity={18}
        distance={12}
        decay={2}
        color="#ffe8c2"
      />
      <pointLight
        position={[0, 1.7, -3.2]}
        intensity={3.6}
        distance={8}
        decay={2}
        color="#5eb7ff"
      />
      <Planter position={[-4.2, 0.22, 3.2]} />
      <Planter position={[4.2, 0.22, -3.0]} />
    </group>
  );
}
