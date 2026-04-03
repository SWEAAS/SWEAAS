import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { Agent } from "../store/agentStore";

const DEPT_ACCENT: Record<string, string> = {
  engineering: "#3b82f6",
  marketing: "#f59e0b",
  product: "#10b981",
  support: "#8b5cf6",
};
const DEPT_WALL: Record<string, string> = {
  engineering: "#dbeafe",
  marketing: "#fef3c7",
  product: "#d1fae5",
  support: "#ede9fe",
};

const ROLE_ITEMS: Record<string, number[]> = {
  cto: [4, 1, 2],
  engineering_manager: [2, 0, 7],
  frontend_dev: [1, 0, 6],
  backend_architect: [8, 0, 2],
  devops: [8, 1, 0],
  qa_tester: [1, 2, 0],
  marketing_manager: [4, 0, 6],
  growth_analyst: [6, 1, 0],
  product_manager: [6, 2, 0],
  product_ops: [7, 1, 0],
  support_manager: [5, 1, 0],
  customer_support: [5, 0, 1],
};

const ITEM_SPOTS: [number, number, number][] = [
  [-0.4, 0.51, 0.1],
  [0.45, 0.51, 0.1],
  [-0.4, 0.51, -0.15],
];

// ─── Desk item components ────────────────────────────────────────────────────

function CoffeeMug({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.035, 0.03, 0.07, 8]} />
        <meshStandardMaterial color="#fafaf9" />
      </mesh>
      <mesh position={[0, 0.028, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.008, 8]} />
        <meshStandardMaterial color="#4a2c0a" />
      </mesh>
      <mesh position={[0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.02, 0.005, 4, 8, Math.PI]} />
        <meshStandardMaterial color="#fafaf9" />
      </mesh>
    </group>
  );
}

function DeskPlant({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (ref.current) ref.current.rotation.z = Math.sin(s.clock.elapsedTime * 1.2) * 0.04;
  });
  return (
    <group position={position} ref={ref}>
      <mesh>
        <cylinderGeometry args={[0.04, 0.032, 0.05, 8]} />
        <meshStandardMaterial color="#b45309" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
    </group>
  );
}

function BookStack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh><boxGeometry args={[0.1, 0.025, 0.07]} /><meshStandardMaterial color="#1e3a8a" /></mesh>
      <mesh position={[0.005, 0.025, 0]}><boxGeometry args={[0.09, 0.02, 0.07]} /><meshStandardMaterial color="#dc2626" /></mesh>
      <mesh position={[-0.003, 0.045, 0]}><boxGeometry args={[0.085, 0.018, 0.07]} /><meshStandardMaterial color="#059669" /></mesh>
    </group>
  );
}

function PictureFrame({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh><boxGeometry args={[0.12, 0.09, 0.008]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh position={[0, 0, 0.005]}><boxGeometry args={[0.09, 0.065, 0.004]} /><meshStandardMaterial color="#bfdbfe" /></mesh>
    </group>
  );
}

function Trophy({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh><boxGeometry args={[0.05, 0.015, 0.05]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.025, 0.012, 0.07, 8]} /><meshStandardMaterial color="#eab308" metalness={0.7} roughness={0.25} /></mesh>
      <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.015, 6, 6]} /><meshStandardMaterial color="#eab308" emissive="#eab308" emissiveIntensity={0.3} metalness={0.7} /></mesh>
    </group>
  );
}

function Headset({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.04, 0.006, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[-0.04, -0.01, 0]}><sphereGeometry args={[0.018, 6, 6]} /><meshStandardMaterial color="#374151" /></mesh>
      <mesh position={[0.04, -0.01, 0]}><sphereGeometry args={[0.018, 6, 6]} /><meshStandardMaterial color="#374151" /></mesh>
    </group>
  );
}

function StickyNotes({ position }: { position: [number, number, number] }) {
  const colors = ["#fde047", "#fb923c", "#a78bfa", "#34d399"];
  return (
    <group position={position}>
      {colors.map((c, i) => (
        <mesh key={i} position={[(i % 2) * 0.035 - 0.018, 0, Math.floor(i / 2) * 0.035 - 0.018]}>
          <boxGeometry args={[0.03, 0.003, 0.03]} />
          <meshStandardMaterial color={c} />
        </mesh>
      ))}
    </group>
  );
}

function DeskLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh><cylinderGeometry args={[0.03, 0.035, 0.01, 8]} /><meshStandardMaterial color="#374151" /></mesh>
      <mesh position={[0, 0.06, 0]}><cylinderGeometry args={[0.004, 0.004, 0.1, 6]} /><meshStandardMaterial color="#9ca3af" /></mesh>
      <mesh position={[0.02, 0.12, 0]} rotation={[0, 0, -Math.PI / 6]}>
        <coneGeometry args={[0.03, 0.04, 8, 1, true]} />
        <meshStandardMaterial color="#374151" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function ServerModel({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh><boxGeometry args={[0.06, 0.08, 0.04]} /><meshStandardMaterial color="#1e293b" /></mesh>
      <mesh position={[0, 0.02, 0.021]}><sphereGeometry args={[0.005, 4, 4]} /><meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.8} /></mesh>
      <mesh position={[0, 0, 0.021]}><sphereGeometry args={[0.005, 4, 4]} /><meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.8} /></mesh>
    </group>
  );
}

const ITEMS = [CoffeeMug, DeskPlant, BookStack, PictureFrame, Trophy, Headset, StickyNotes, DeskLamp, ServerModel];

// ─── Main component ──────────────────────────────────────────────────────────

interface AgentOfficeProps {
  agent: Agent;
  position: [number, number, number];
  onClick: () => void;
}

export default function AgentOffice({ agent, position, onClick }: AgentOfficeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const scaleRef = useRef(1);
  const glowRef = useRef<THREE.Mesh>(null);

  const accent = DEPT_ACCENT[agent.department] ?? "#94a3b8";
  const wallColor = DEPT_WALL[agent.department] ?? "#f1f5f9";
  const itemSet = ROLE_ITEMS[agent.role] ?? [0, 1, 2];

  useFrame((state, delta) => {
    const target = hovered ? 1.025 : 1;
    scaleRef.current += (target - scaleRef.current) * Math.min(delta * 12, 1);
    if (groupRef.current) groupRef.current.scale.setScalar(scaleRef.current);

    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.15 + Math.sin(state.clock.elapsedTime * 1.8) * 0.05;
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* ── Cubicle walls ── */}
      <mesh position={[0, 0.65, -1.1]} castShadow>
        <boxGeometry args={[2.3, 1.3, 0.05]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[-1.15, 0.65, -0.25]} castShadow>
        <boxGeometry args={[0.05, 1.3, 1.75]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[1.15, 0.65, -0.25]} castShadow>
        <boxGeometry args={[0.05, 1.3, 1.75]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>

      {/* Department accent strips */}
      <mesh position={[0, 1.32, -1.1]}>
        <boxGeometry args={[2.35, 0.04, 0.06]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[-1.15, 1.32, -0.25]}>
        <boxGeometry args={[0.06, 0.04, 1.8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[1.15, 1.32, -0.25]}>
        <boxGeometry args={[0.06, 0.04, 1.8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.15} />
      </mesh>

      {/* ── Desk ── */}
      <mesh position={[0, 0.48, -0.15]} castShadow>
        <boxGeometry args={[1.25, 0.05, 0.75]} />
        <meshStandardMaterial color="#c8b89a" roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh position={[-0.55, 0.48, -0.55]} castShadow>
        <boxGeometry args={[0.4, 0.05, 0.45]} />
        <meshStandardMaterial color="#c8b89a" roughness={0.6} metalness={0.05} />
      </mesh>
      {([ [-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35] ] as [number, number][]).map(
        ([lx, lz], i) => (
          <mesh key={`leg-${i}`} position={[lx, 0.24, lz - 0.15]}>
            <cylinderGeometry args={[0.025, 0.025, 0.46, 6]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} />
          </mesh>
        )
      )}

      {/* ── Monitor ── */}
      <mesh position={[0.1, 0.88, -0.35]}>
        <boxGeometry args={[0.54, 0.38, 0.03]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh ref={glowRef} position={[0.1, 0.88, -0.335]}>
        <boxGeometry args={[0.48, 0.32, 0.01]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0.1, 0.67, -0.35]}>
        <cylinderGeometry args={[0.015, 0.015, 0.2, 6]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      <mesh position={[0.1, 0.57, -0.35]}>
        <boxGeometry args={[0.22, 0.02, 0.14]} />
        <meshStandardMaterial color="#374151" />
      </mesh>

      {/* ── Keyboard ── */}
      <mesh position={[0.05, 0.505, 0.05]}>
        <boxGeometry args={[0.36, 0.012, 0.14]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>

      {/* ── Chair ── */}
      <group rotation={[0, Math.PI, 0]} position={[0, 0, 0.4]}>
        <mesh position={[0, 0.38, 0]}><boxGeometry args={[0.44, 0.07, 0.42]} /><meshStandardMaterial color="#1e293b" /></mesh>
        <mesh position={[0, 0.63, -0.30]}><boxGeometry args={[0.42, 0.5, 0.06]} /><meshStandardMaterial color="#1e293b" /></mesh>
        {[-0.24, 0.24].map((cx, i) => (
          <mesh key={`arm-${i}`} position={[cx, 0.54, -0.14]}>
            <boxGeometry args={[0.05, 0.04, 0.32]} />
            <meshStandardMaterial color="#374151" />
          </mesh>
        ))}
        <mesh position={[0, 0.18, 0]}><cylinderGeometry args={[0.06, 0.06, 0.2, 6]} /><meshStandardMaterial color="#4b5563" /></mesh>
        <mesh position={[0, 0.06, 0]} rotation={[0, Math.PI / 6, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.03, 5]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      </group>

      {/* ── Nameplate ── */}
      <group position={[0, 1.15, -1.06]}>
        <mesh><boxGeometry args={[0.7, 0.12, 0.02]} /><meshStandardMaterial color={accent} /></mesh>
        <Text position={[0, 0, 0.015]} fontSize={0.05} color="white" anchorX="center" anchorY="middle" maxWidth={0.65}>
          {agent.name}
        </Text>
      </group>
      <Text position={[0, 1.01, -1.04]} fontSize={0.035} color="#64748b" anchorX="center" anchorY="middle" maxWidth={0.65}>
        {agent.role.replace(/_/g, " ")}
      </Text>

      {/* ── Personal items ── */}
      {itemSet.map((type, i) => {
        if (i >= ITEM_SPOTS.length) return null;
        const Comp = ITEMS[type];
        return Comp ? <Comp key={i} position={ITEM_SPOTS[i]} /> : null;
      })}

      {/* ── Status LED ── */}
      <mesh position={[0.5, 0.52, 0.18]}>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshStandardMaterial
          color={agent.status === "warning" ? "#f59e0b" : agent.status === "paused" ? "#9ca3af" : "#22c55e"}
          emissive={agent.status === "warning" ? "#f59e0b" : agent.status === "paused" ? "#9ca3af" : "#22c55e"}
          emissiveIntensity={0.6}
        />
      </mesh>

      {/* ── Floor mat ── */}
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[2.2, 0.01, 2.0]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}
