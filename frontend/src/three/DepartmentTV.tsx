/**
 * DepartmentTV — a wall-mounted flat-screen in each floor showing what
 * the agents on that floor are currently working on.
 *
 * Data comes straight from GET /api/v1/agents (already loaded in agentStore).
 * The TV cycles through each dept agent every 4 seconds, animating the
 * name + current_focus line using Html overlay (so real text renders sharp).
 */

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Agent } from "../store/agentStore";

const STATUS_COLOURS: Record<string, string> = {
  active:  "#22c55e",
  warning: "#f59e0b",
  paused:  "#9ca3af",
  strike:  "#ef4444",
};

const DEPT_ACCENT: Record<string, string> = {
  engineering: "#3b82f6",
  marketing:   "#f59e0b",
  product:     "#10b981",
};

const ROTATE_EVERY_MS = 4000;

interface DepartmentTVProps {
  /** World-space position of the TV centre. */
  position: [number, number, number];
  /** Rotation in radians around Y (so it faces into the room). */
  rotationY: number;
  /** Department agents to display. */
  agents: Agent[];
  /** Department label shown at top of screen. */
  label: string;
}

export default function DepartmentTV({
  position,
  rotationY,
  agents,
  label,
}: DepartmentTVProps) {
  const bezelRef  = useRef<THREE.Mesh>(null);
  const glowRef   = useRef<THREE.Mesh>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const lastRotateRef = useRef(0);

  const accent = DEPT_ACCENT[agents[0]?.department ?? "engineering"];

  // Cycle through agents on a timer
  useFrame((state) => {
    const now = state.clock.elapsedTime * 1000;
    if (now - lastRotateRef.current > ROTATE_EVERY_MS) {
      lastRotateRef.current = now;
      setActiveIdx((i) => (i + 1) % Math.max(agents.length, 1));
    }

    // Subtle screen glow pulse
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.12 + Math.sin(state.clock.elapsedTime * 1.5) * 0.04;
    }
  });

  const current = agents[activeIdx];

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* ── Bezel / casing ── */}
      <mesh ref={bezelRef} castShadow>
        <boxGeometry args={[3.2, 1.9, 0.08]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* ── Outer frame highlight ── */}
      <mesh position={[0, 0, 0.042]}>
        <boxGeometry args={[3.22, 1.92, 0.01]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.35}
          toneMapped={false}
        />
      </mesh>

      {/* ── Screen surface — emissive glow ── */}
      <mesh ref={glowRef} position={[0, 0, 0.045]}>
        <boxGeometry args={[3.0, 1.72, 0.005]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive={accent}
          emissiveIntensity={0.14}
        />
      </mesh>

      {/* ── Wall bracket ── */}
      <mesh position={[0, -1.08, -0.06]}>
        <boxGeometry args={[0.22, 0.22, 0.14]} />
        <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* ── HTML overlay — the actual content ── */}
      <Html
        position={[0, 0, 0.08]}
        transform
        occlude={false}
        scale={0.021}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            width: "280px",
            height: "162px",
            background: "linear-gradient(160deg, #0b1222 0%, #0f1e33 100%)",
            borderRadius: "4px",
            padding: "10px 12px",
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: accent,
                boxShadow: `0 0 6px ${accent}`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "9px",
                fontWeight: 700,
                color: accent,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {label} — live focus
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: "7px", color: "#475569" }}>
              {agents.length} agent{agents.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Divider */}
          <div style={{ height: "1px", background: `${accent}33` }} />

          {/* Active agent card */}
          {current ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: STATUS_COLOURS[current.status] ?? "#9ca3af",
                    boxShadow: `0 0 4px ${STATUS_COLOURS[current.status] ?? "#9ca3af"}`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#e2e8f0" }}>
                  {current.name}
                </span>
                <span
                  style={{
                    fontSize: "8px",
                    color: "#64748b",
                    textTransform: "capitalize",
                    marginLeft: "2px",
                  }}
                >
                  · {current.role.replace(/_/g, " ")}
                </span>
              </div>

              <div
                style={{
                  fontSize: "9.5px",
                  color: "#94a3b8",
                  lineHeight: 1.45,
                  maxHeight: "52px",
                  overflow: "hidden",
                }}
              >
                {current.current_focus || "No active task."}
              </div>

              {/* Token burn bar */}
              <div style={{ marginTop: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                  <span style={{ fontSize: "7px", color: "#475569" }}>Token budget</span>
                  <span style={{ fontSize: "7px", color: accent, fontWeight: 600 }}>
                    {Math.round((current.tokens_used_today / current.daily_token_budget) * 100)}%
                  </span>
                </div>
                <div
                  style={{
                    background: "#1e293b",
                    borderRadius: "2px",
                    height: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(
                        Math.round((current.tokens_used_today / current.daily_token_budget) * 100),
                        100
                      )}%`,
                      height: "100%",
                      background: `linear-gradient(90deg, ${accent}88, ${accent})`,
                      borderRadius: "2px",
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: "#475569", fontSize: "9px", marginTop: "8px" }}>
              No agents assigned.
            </div>
          )}

          {/* Bottom: agent dots */}
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            {agents.map((a, i) => (
              <div
                key={a.agent_id}
                title={a.name}
                style={{
                  width: i === activeIdx ? "14px" : "5px",
                  height: "5px",
                  borderRadius: "3px",
                  background: i === activeIdx ? accent : "#1e293b",
                  border: `1px solid ${i === activeIdx ? accent : "#334155"}`,
                  transition: "width 0.3s ease",
                }}
              />
            ))}
          </div>
        </div>
      </Html>
    </group>
  );
}
