import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { Agent } from "../store/agentStore";

interface AgentAvatarProps {
  agent: Agent;
  position: [number, number, number];
  onClick: () => void;
}

const statusColors: Record<string, string> = {
  active: "#22c55e",
  warning: "#f59e0b",
  paused: "#9ca3af",
  strike: "#ef4444",
};

export default function AgentAvatar({
  agent,
  position,
  onClick,
}: AgentAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const color = statusColors[agent.status] ?? "#22c55e";

  useFrame((state) => {
    if (!groupRef.current) return;
    // Idle bobbing animation
    const t = state.clock.elapsedTime;
    groupRef.current.position.y =
      position[1] + Math.sin(t * 2 + position[0]) * 0.05;

    // Working animation: slight rotation
    if (agent.status === "active") {
      groupRef.current.rotation.y = Math.sin(t * 1.5 + position[0]) * 0.1;
    }
  });

  const usagePercent = Math.round(
    (agent.tokens_used_today / agent.daily_token_budget) * 100
  );

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Body */}
      <mesh castShadow position={[0, 0, 0]}>
        <capsuleGeometry args={[0.2, 0.5, 4, 8]} />
        <meshStandardMaterial
          color={hovered ? "#60a5fa" : "#94a3b8"}
          emissive={hovered ? "#2563eb" : "#000000"}
          emissiveIntensity={hovered ? 0.3 : 0}
        />
      </mesh>

      {/* Head */}
      <mesh castShadow position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>

      {/* Status indicator */}
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.06]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
        />
      </mesh>

      {/* Name label */}
      <Billboard position={[0, 1.1, 0]}>
        <Text fontSize={0.15} color="#1e293b" anchorY="bottom">
          {agent.name}
        </Text>
      </Billboard>

      {/* Hover tooltip */}
      {hovered && (
        <Html position={[0, 1.5, 0]} center>
          <div className="bg-white/95 rounded-lg shadow-lg border border-sweaas-border px-3 py-2 min-w-[160px] pointer-events-none">
            <p className="text-xs font-semibold text-sweaas-text">
              {agent.name}
            </p>
            <p className="text-[10px] text-sweaas-text-secondary">
              {agent.role.replace(/_/g, " ")}
            </p>
            <div className="mt-1">
              <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(usagePercent, 100)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <p className="text-[10px] text-sweaas-text-secondary mt-0.5">
                {usagePercent}% budget used
              </p>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
