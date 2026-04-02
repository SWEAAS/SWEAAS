import { useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { Agent } from "../store/agentStore";

// ─── Appearance pools ────────────────────────────────────────────────────────

const SKIN_TONES = ["#f5c5a3", "#d4956a", "#c68642", "#8d5524", "#fde8d8"];
const HAIR_COLORS = ["#2c1b0e", "#1a1a1a", "#8b5e3c", "#4a3728", "#c8a96e"];

// ─── Y-offset constants ───────────────────────────────────────────────────────
//
// Character anatomy (all relative to group root):
//   foot bottom  = root + 0.00   (root IS the foot contact point)
//   hips mesh    = root + 0.88
//   torso centre = root + 0.95 + 0.18 = root + 1.13
//   head centre  = root + 0.95 + 0.68 = root + 1.63
//
// Floor fi surface world-Y = fi*4 + 0.025
//   STAND_Y(fi): root placed so feet touch floor → fi*4 + 0.025
//
// Chair seat (Workstation placed at [dx, fi*4+0.05, dz]):
//   seat mesh y = 0.38, half-height = 0.035 → seat top local = 0.415
//   seat top world-Y = fi*4 + 0.05 + 0.415 = fi*4 + 0.465
//   For sitting: hips (root+0.88) rest on seat top (fi*4+0.465)
//   → root = fi*4 + 0.465 - 0.88 = fi*4 - 0.415
//
// Staircase step i (floorBase = fi*4):
//   step centre world-Y = floorBase + i*0.5 + 0.25
//   step top world-Y    = floorBase + i*0.5 + 0.50
//   agent standing on step: root = step top = floorBase + i*0.5 + 0.50

const STAND_Y = (fi: number) => fi * 4 + 0.025;
const SEAT_Y  = (fi: number) => fi * 4 - 0.415;
const STEP_Y  = (floorBase: number, stepIdx: number) => floorBase + stepIdx * 0.5 + 0.50;

// ─── Path helpers ────────────────────────────────────────────────────────────

function samplePath(
  path: [number, number, number][],
  t: number
): [number, number, number] {
  const n = path.length;
  if (!n) return [0, 0, 0];
  const wrapped = ((t % 1) + 1) % 1;
  const scaled = wrapped * n;
  const seg = Math.min(Math.floor(scaled), n - 1);
  const frac = scaled - Math.floor(scaled);
  const a = path[seg];
  const b = path[(seg + 1) % n];
  if (!a || !b) return path[0];
  return [
    a[0] + (b[0] - a[0]) * frac,
    a[1] + (b[1] - a[1]) * frac,
    a[2] + (b[2] - a[2]) * frac,
  ];
}

function sampleYaw(path: [number, number, number][], t: number): number {
  const eps = 0.005;
  const p1 = samplePath(path, t);
  const p2 = samplePath(path, (t + eps) % 1);
  const dx = p2[0] - p1[0];
  const dz = p2[2] - p1[2];
  return Math.abs(dx) < 0.0001 && Math.abs(dz) < 0.0001
    ? 0
    : Math.atan2(dx, dz);
}

// ─── Path definitions ─────────────────────────────────────────────────────────
//
// Staircase geometry (Staircase.tsx, flight f):
//   X = 4.5, STEP_H = 0.5, STEP_D = 0.52
//   step i:  stepZ = zStart + zDir*i*0.5,  stepY_centre = f*4 + i*0.5 + 0.25
//
// Flight 0 (eng→mkt): zStart=2.0, zDir=-1  → z goes 2.0 down to -1.5 over 8 steps
// Flight 1 (mkt→prd): zStart=-2.0, zDir=+1 → z goes -2.0 up to 1.5  over 8 steps
//
// Agent root Y on step i = STEP_Y(floorBase, i) = floorBase + i*0.5 + 1.29
// We pre-bake 8 stair waypoints per flight so the character steps on each tread.

function buildStairPoints(
  floorBase: number,
  xPos: number,
  zStart: number,
  zDir: number
): [number, number, number][] {
  return Array.from({ length: 9 }, (_, i) => [
    xPos,
    STEP_Y(floorBase, i),
    zStart + zDir * i * 0.5,
  ] as [number, number, number]);
}

// Flight 0: eng floor (base=0) → mkt floor top
const STAIR_UP_A   = buildStairPoints(0, 4.5, 2.0, -1);
// Flight 1: mkt floor (base=4) → prd floor top
const STAIR_UP_B   = buildStairPoints(4, 4.5, -2.0, 1);
// Descend = reversed
const STAIR_DOWN_B = [...STAIR_UP_B].reverse();
const STAIR_DOWN_A = [...STAIR_UP_A].reverse();

// Full product circuit — every segment lands the character on a real surface
const PRODUCT_PATH: [number, number, number][] = [
  // Eng floor: walk toward staircase
  [2.5,  STAND_Y(0), 1.5],
  [4.2,  STAND_Y(0), 2.0],
  // Climb flight A — 9 step waypoints
  ...STAIR_UP_A,
  // Mkt floor: visit desks
  [2.0,  STAND_Y(1), -1.0],
  [-1.5, STAND_Y(1),  0.5],
  [4.2,  STAND_Y(1), -2.0],
  // Climb flight B — 9 step waypoints
  ...STAIR_UP_B,
  // Prd floor: walk around
  [0,    STAND_Y(2),  0.5],
  [-2.0, STAND_Y(2), -0.5],
  [4.2,  STAND_Y(2),  2.0],
  // Descend flight B
  ...STAIR_DOWN_B,
  [4.2,  STAND_Y(1), -2.0],
  // Descend flight A
  ...STAIR_DOWN_A,
];
const PRODUCT_CYCLE_S = 90;

// Marketing patrol — flat on floor fi=1
const MARKETING_PATH: [number, number, number][] = [
  [-3.0, STAND_Y(1),  0.5],
  [ 3.0, STAND_Y(1),  0.5],
  [ 3.0, STAND_Y(1), -1.8],
  [-3.0, STAND_Y(1), -1.8],
];
const MARKETING_CYCLE_S = 18;

// ─── Status / clothing colours ────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:  "#22c55e",
  warning: "#f59e0b",
  paused:  "#9ca3af",
  strike:  "#ef4444",
};
const SHIRT: Record<string, string> = {
  engineering: "#3b82f6",
  marketing:   "#f59e0b",
  product:     "#10b981",
};
const PANTS: Record<string, string> = {
  engineering: "#1e3a8a",
  marketing:   "#7c2d12",
  product:     "#065f46",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface AgentAvatarProps {
  agent: Agent;
  /** For engineering: exact world-space desk seat position.
   *  For marketing/product: initial spawn (overridden every frame by path). */
  position: [number, number, number];
  agentIndex: number;
  numInDept: number;
  /** Floor index 0/1/2 — needed for seated Y calculation. */
  floorIndex: number;
  onClick: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgentAvatar({
  agent,
  position,
  agentIndex,
  numInDept,
  floorIndex,
  onClick,
}: AgentAvatarProps) {
  const groupRef      = useRef<THREE.Group>(null);
  const headRef       = useRef<THREE.Group>(null);
  const torsoRef      = useRef<THREE.Group>(null);
  const leftArmRef    = useRef<THREE.Group>(null);
  const rightArmRef   = useRef<THREE.Group>(null);
  const leftLegRef    = useRef<THREE.Group>(null);
  const rightLegRef   = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const seed = useMemo(
    () => agent.agent_id.split("").reduce((a, c) => a + c.charCodeAt(0), 0),
    [agent.agent_id]
  );
  const skinTone   = SKIN_TONES[seed % SKIN_TONES.length];
  const hairColor  = HAIR_COLORS[(seed + 2) % HAIR_COLORS.length];
  const shirtColor = SHIRT[agent.department] ?? "#94a3b8";
  const pantsColor = PANTS[agent.department] ?? "#374151";
  const statusColor = STATUS_COLORS[agent.status] ?? "#22c55e";

  const dept        = agent.department;
  const isProduct   = dept === "product";
  const isMarketing = dept === "marketing";
  const isEngineer  = dept === "engineering";
  const usesPhone   = isMarketing && agentIndex % 2 === 0;

  const pathProgress = useRef(agentIndex / Math.max(numInDept, 1));

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;

    // ── Engineering: SEATED at desk ──────────────────────────────────────────
    if (isEngineer) {
      // Root at SEAT_Y so hips (root+0.88) land exactly on chair seat top
      groupRef.current.position.set(
        position[0],
        SEAT_Y(floorIndex),
        position[2]
      );
      groupRef.current.rotation.y = 0; // face monitor (monitor is at -z, chair opens toward +z)

      // Torso leans forward over keyboard
      if (torsoRef.current) torsoRef.current.rotation.x = 0.28;

      // Legs: thighs rotate ~90° forward (horizontal, resting on seat),
      // then lower leg hangs down → achieved by rotating leg group to ~-PI/2
      // so the capsule (centred at y=-0.38 from pivot) projects forward/down
      if (leftLegRef.current)  leftLegRef.current.rotation.x  = -Math.PI / 2 + 0.15;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.PI / 2 + 0.15;

      // Arms reach toward keyboard with typing flutter
      const wt = t * 7 + seed;
      if (leftArmRef.current)  leftArmRef.current.rotation.x  = -0.65 + Math.sin(wt) * 0.06;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -0.65 + Math.sin(wt + 1.1) * 0.06;

      // Head occasionally glances at monitor
      if (headRef.current) {
        headRef.current.rotation.x = Math.sin(t * 0.38 + seed) > 0.72 ? -0.22 : 0.04;
      }
      return;
    }

    // ── Marketing: walk patrol ────────────────────────────────────────────────
    if (isMarketing) {
      pathProgress.current = (pathProgress.current + delta / MARKETING_CYCLE_S) % 1;
      const pos = samplePath(MARKETING_PATH, pathProgress.current);
      const yaw = sampleYaw(MARKETING_PATH, pathProgress.current);
      groupRef.current.position.set(pos[0], pos[1], pos[2]);
      groupRef.current.rotation.y = yaw;

      if (torsoRef.current) torsoRef.current.rotation.x = 0;
      if (leftLegRef.current)  leftLegRef.current.rotation.x  =  Math.sin(t * 3.5) * 0.38;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -Math.sin(t * 3.5) * 0.38;

      if (usesPhone) {
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = -2.1;
          rightArmRef.current.rotation.z = -0.4;
        }
        if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(t * 3.5 + Math.PI) * 0.25;
      } else {
        if (leftArmRef.current)  leftArmRef.current.rotation.x  = -0.85;
        if (rightArmRef.current) rightArmRef.current.rotation.x = -0.85;
      }
      if (headRef.current) headRef.current.rotation.x = 0;
      return;
    }

    // ── Product: staircase circuit ────────────────────────────────────────────
    if (isProduct) {
      pathProgress.current = (pathProgress.current + delta / PRODUCT_CYCLE_S) % 1;
      const pos = samplePath(PRODUCT_PATH, pathProgress.current);
      const yaw = sampleYaw(PRODUCT_PATH, pathProgress.current);
      groupRef.current.position.set(...pos);
      groupRef.current.rotation.y = yaw;

      if (torsoRef.current) torsoRef.current.rotation.x = 0;
      const wt = t * 4.5;
      if (leftLegRef.current)   leftLegRef.current.rotation.x   =  Math.sin(wt) * 0.44;
      if (rightLegRef.current)  rightLegRef.current.rotation.x  = -Math.sin(wt) * 0.44;
      if (leftArmRef.current)   leftArmRef.current.rotation.x   = -Math.sin(wt) * 0.28;
      if (rightArmRef.current)  rightArmRef.current.rotation.x  =  Math.sin(wt) * 0.28;
      if (headRef.current) headRef.current.rotation.x = 0;
    }
  });

  const usagePercent = Math.min(
    Math.round((agent.tokens_used_today / agent.daily_token_budget) * 100),
    100
  );

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* ══ LEGS (pivot at hip) ══ */}
      <group ref={leftLegRef} position={[-0.11, 0.82, 0]}>
        <mesh position={[0, -0.38, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.60, 4, 8]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0, -0.785, 0.06]}>
          <boxGeometry args={[0.11, 0.07, 0.19]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      </group>

      <group ref={rightLegRef} position={[0.11, 0.82, 0]}>
        <mesh position={[0, -0.38, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.60, 4, 8]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0, -0.785, 0.06]}>
          <boxGeometry args={[0.11, 0.07, 0.19]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      </group>

      {/* ══ HIPS ══ */}
      <mesh position={[0, 0.88, 0]} castShadow>
        <boxGeometry args={[0.31, 0.14, 0.22]} />
        <meshStandardMaterial color={pantsColor} />
      </mesh>

      {/* ══ TORSO (pivot for lean) ══ */}
      <group ref={torsoRef} position={[0, 0.95, 0]}>
        <mesh position={[0, 0.18, 0]} castShadow>
          <boxGeometry args={[0.37, 0.43, 0.22]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>

        {/* ══ ARMS (attached to torso so they lean with it) ══ */}
        <group ref={leftArmRef} position={[-0.255, 0.33, 0]}>
          <mesh position={[0, -0.25, 0]} castShadow>
            <capsuleGeometry args={[0.063, 0.38, 4, 8]} />
            <meshStandardMaterial color={skinTone} />
          </mesh>
          {!usesPhone && isMarketing && (
            <mesh position={[0, -0.46, 0.09]} rotation={[-0.45, 0, 0]}>
              <planeGeometry args={[0.19, 0.25]} />
              <meshStandardMaterial color="white" side={THREE.DoubleSide} />
            </mesh>
          )}
        </group>

        <group ref={rightArmRef} position={[0.255, 0.33, 0]}>
          <mesh position={[0, -0.25, 0]} castShadow>
            <capsuleGeometry args={[0.063, 0.38, 4, 8]} />
            <meshStandardMaterial color={skinTone} />
          </mesh>
          {usesPhone && (
            <mesh position={[0, -0.17, 0.07]}>
              <boxGeometry args={[0.07, 0.13, 0.018]} />
              <meshStandardMaterial color="#1e293b" />
            </mesh>
          )}
          {!usesPhone && isMarketing && (
            <mesh position={[0, -0.46, 0.09]} rotation={[-0.45, 0, 0]}>
              <planeGeometry args={[0.19, 0.25]} />
              <meshStandardMaterial color="white" side={THREE.DoubleSide} />
            </mesh>
          )}
        </group>

        {/* ══ NECK ══ */}
        <mesh position={[0, 0.49, 0]}>
          <cylinderGeometry args={[0.062, 0.068, 0.1, 8]} />
          <meshStandardMaterial color={skinTone} />
        </mesh>

        {/* ══ HEAD ══ */}
        <group ref={headRef} position={[0, 0.68, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.17, 16, 16]} />
            <meshStandardMaterial color={skinTone} />
          </mesh>
          {/* Left eye sclera */}
          <mesh position={[-0.068, 0.022, 0.144]}>
            <sphereGeometry args={[0.034, 8, 8]} />
            <meshStandardMaterial color="white" />
          </mesh>
          <mesh position={[-0.068, 0.022, 0.156]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#0a0a0a" />
          </mesh>
          <mesh position={[-0.057, 0.032, 0.163]}>
            <sphereGeometry args={[0.006, 4, 4]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
          </mesh>
          {/* Right eye sclera */}
          <mesh position={[0.068, 0.022, 0.144]}>
            <sphereGeometry args={[0.034, 8, 8]} />
            <meshStandardMaterial color="white" />
          </mesh>
          <mesh position={[0.068, 0.022, 0.156]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#0a0a0a" />
          </mesh>
          <mesh position={[0.079, 0.032, 0.163]}>
            <sphereGeometry args={[0.006, 4, 4]} />
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
          </mesh>
          {/* Smile */}
          <mesh position={[0, -0.055, 0.157]}>
            <boxGeometry args={[0.065, 0.013, 0.005]} />
            <meshStandardMaterial color="#7c3f12" />
          </mesh>
          {/* Hair dome */}
          <mesh position={[0, 0.09, -0.02]}>
            <sphereGeometry args={[0.178, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
            <meshStandardMaterial color={hairColor} />
          </mesh>
        </group>
      </group>

      {/* ══ STATUS DOT ══ */}
      <mesh position={[0.18, 1.88, 0]}>
        <sphereGeometry args={[0.045]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={0.8}
        />
      </mesh>

      {/* ══ NAME LABEL ══ */}
      <Billboard position={[0, 2.1, 0]}>
        <Text fontSize={0.16} color="#1e293b" anchorY="bottom">
          {agent.name}
        </Text>
      </Billboard>

      {/* ══ HOVER TOOLTIP ══ */}
      {hovered && (
        <Html position={[0, 2.45, 0]} center>
          <div className="bg-white/95 rounded-lg shadow-lg border border-sweaas-border px-3 py-2 min-w-[160px] pointer-events-none">
            <p className="text-xs font-semibold text-sweaas-text">{agent.name}</p>
            <p className="text-[10px] text-sweaas-text-secondary capitalize">
              {agent.role.replace(/_/g, " ")}
            </p>
            <div className="mt-1.5">
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${usagePercent}%`, backgroundColor: shirtColor }}
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
