/**
 * Seated office worker rendered at a desk anchor. A full workstation (desk,
 * chair, monitor, keyboard) is drawn around each worker so the scene reads
 * as a real office even before the optional Ellie / Y-Bot GLBs are dropped
 * into /models/characters/.
 *
 * Two render paths:
 *   1. GLB (preferred) — when hasWorkerAsset() is true, useOptionalGLTF
 *      returns the shared scene; we SkeletonUtils.clone() it per agent and
 *      drive an AnimationMixer.
 *   2. Procedural fallback (default today) — an upgraded seated figure with
 *      PBR materials, realistic proportions, and a gentle typing idle.
 *
 * The desk + chair + monitor geometry is always drawn procedurally so the
 * GLB characters sit inside a real workstation regardless of what's loaded.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { Agent } from "../store/agentStore";
import {
  ELLIE_MODEL_URL,
  WORKER_MODEL_URL,
  cloneWorkerScene,
  useWorkerAssetAvailable,
  useWorkerGLTF,
  variationFromAgent,
  type WorkerVariation,
} from "./useWorkerModel";

interface AgentAvatarProps {
  agent: Agent;
  position: [number, number, number];
  rotationY: number;
  isHeroCTO: boolean;
  highlighted?: boolean;
  onClick: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  warning: "#f59e0b",
  paused: "#9ca3af",
  strike: "#ef4444",
};

// Shared base geometries — one allocation serves every worker in the scene.
const TORSO_GEO = new THREE.BoxGeometry(0.52, 0.58, 0.3);
const HIPS_GEO = new THREE.BoxGeometry(0.44, 0.18, 0.28);
const UPPER_ARM_GEO = new THREE.CapsuleGeometry(0.075, 0.3, 4, 10);
const FOREARM_GEO = new THREE.CapsuleGeometry(0.065, 0.26, 4, 10);
const THIGH_GEO = new THREE.CapsuleGeometry(0.09, 0.34, 4, 10);
const SHIN_GEO = new THREE.CapsuleGeometry(0.08, 0.32, 4, 10);
const SHOE_GEO = new THREE.BoxGeometry(0.14, 0.08, 0.26);
const NECK_GEO = new THREE.CylinderGeometry(0.07, 0.078, 0.09, 12);
const HEAD_GEO = new THREE.SphereGeometry(0.16, 20, 16);
const EAR_GEO = new THREE.SphereGeometry(0.035, 8, 8);
const HAIR_GEO = new THREE.SphereGeometry(0.172, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2.05);
const COLLAR_GEO = new THREE.TorusGeometry(0.12, 0.025, 8, 16, Math.PI);
const STATUS_DOT_GEO = new THREE.SphereGeometry(0.05, 12, 10);
const EYE_WHITE_GEO = new THREE.SphereGeometry(0.028, 10, 8);
const EYE_IRIS_GEO = new THREE.SphereGeometry(0.016, 8, 6);

// Workstation geometry.
const DESK_TOP_GEO = new THREE.BoxGeometry(1.5, 0.04, 0.8);
const DESK_LEG_GEO = new THREE.BoxGeometry(0.05, 0.72, 0.05);
const CHAIR_SEAT_GEO = new THREE.BoxGeometry(0.52, 0.06, 0.5);
const CHAIR_BACK_GEO = new THREE.BoxGeometry(0.52, 0.62, 0.05);
const CHAIR_POST_GEO = new THREE.CylinderGeometry(0.035, 0.035, 0.38, 10);
const CHAIR_BASE_GEO = new THREE.CylinderGeometry(0.25, 0.28, 0.04, 20);
const MONITOR_STAND_GEO = new THREE.BoxGeometry(0.05, 0.28, 0.05);
const MONITOR_BASE_GEO = new THREE.BoxGeometry(0.3, 0.02, 0.2);
const MONITOR_SCREEN_GEO = new THREE.BoxGeometry(0.72, 0.44, 0.04);
const KEYBOARD_GEO = new THREE.BoxGeometry(0.5, 0.02, 0.16);
const MOUSE_GEO = new THREE.BoxGeometry(0.08, 0.03, 0.13);

const DESK_MAT = new THREE.MeshStandardMaterial({ color: "#8a6a48", roughness: 0.6, metalness: 0.05 });
const DESK_LEG_MAT = new THREE.MeshStandardMaterial({ color: "#3f3a33", roughness: 0.5, metalness: 0.4 });
const CHAIR_MAT = new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.55, metalness: 0.1 });
const CHAIR_BASE_MAT = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.35, metalness: 0.6 });
const MONITOR_FRAME_MAT = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.4, metalness: 0.3 });
const MONITOR_SCREEN_MAT = new THREE.MeshStandardMaterial({ color: "#0ea5e9", emissive: "#38bdf8", emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.0 });
const KEYBOARD_MAT = new THREE.MeshStandardMaterial({ color: "#374151", roughness: 0.7, metalness: 0.1 });
const SHOE_MAT = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.6, metalness: 0.1 });
const EYE_WHITE_MAT = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.2 });
const IRIS_MAT = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.25 });

function buildSkinMat(v: WorkerVariation) {
  return new THREE.MeshStandardMaterial({ color: v.skinTint, roughness: 0.65, metalness: 0.0 });
}
function buildShirtMat(v: WorkerVariation) {
  return new THREE.MeshStandardMaterial({ color: v.shirtColor, roughness: 0.7, metalness: 0.0 });
}
function buildPantsMat(v: WorkerVariation) {
  return new THREE.MeshStandardMaterial({ color: v.pantsColor, roughness: 0.75, metalness: 0.0 });
}
function buildHairMat(v: WorkerVariation) {
  return new THREE.MeshStandardMaterial({ color: v.hairColor, roughness: 0.75, metalness: 0.05 });
}

function Workstation({ highlighted }: { highlighted: boolean }) {
  // Desk + chair + monitor are always rendered, regardless of character
  // source. Positioned in the avatar's local space: the worker sits at
  // (0, 0, 0) facing -Z; desk sits in front at z≈-0.55, chair behind at
  // z≈+0.25, monitor on desk.
  return (
    <group>
      {/* Desk surface */}
      <mesh geometry={DESK_TOP_GEO} material={DESK_MAT} position={[0, 0.3, -0.55]} castShadow receiveShadow />
      {/* Desk legs */}
      <mesh geometry={DESK_LEG_GEO} material={DESK_LEG_MAT} position={[-0.7, -0.06, -0.3]} castShadow />
      <mesh geometry={DESK_LEG_GEO} material={DESK_LEG_MAT} position={[0.7, -0.06, -0.3]} castShadow />
      <mesh geometry={DESK_LEG_GEO} material={DESK_LEG_MAT} position={[-0.7, -0.06, -0.8]} castShadow />
      <mesh geometry={DESK_LEG_GEO} material={DESK_LEG_MAT} position={[0.7, -0.06, -0.8]} castShadow />
      {/* Chair */}
      <mesh geometry={CHAIR_SEAT_GEO} material={CHAIR_MAT} position={[0, -0.03, 0.02]} castShadow />
      <mesh geometry={CHAIR_BACK_GEO} material={CHAIR_MAT} position={[0, 0.32, 0.27]} castShadow />
      <mesh geometry={CHAIR_POST_GEO} material={CHAIR_BASE_MAT} position={[0, -0.23, 0.02]} />
      <mesh geometry={CHAIR_BASE_GEO} material={CHAIR_BASE_MAT} position={[0, -0.44, 0.02]} />
      {/* Monitor */}
      <mesh geometry={MONITOR_BASE_GEO} material={MONITOR_FRAME_MAT} position={[0, 0.33, -0.55]} />
      <mesh geometry={MONITOR_STAND_GEO} material={MONITOR_FRAME_MAT} position={[0, 0.49, -0.55]} />
      <mesh geometry={MONITOR_SCREEN_GEO} material={MONITOR_SCREEN_MAT} position={[0, 0.82, -0.7]} castShadow />
      {/* Keyboard + mouse */}
      <mesh geometry={KEYBOARD_GEO} material={KEYBOARD_MAT} position={[0, 0.33, -0.25]} />
      <mesh geometry={MOUSE_GEO} material={KEYBOARD_MAT} position={[0.33, 0.33, -0.25]} />
      {/* Highlight ring — shows up when this workstation is framed by the
          camera stepper. Sits flat on the floor right around the chair so
          you can clearly see WHICH desk the camera is showing you. We pull
          the local Y down to -SEAT_Y so it lands at floor level in world
          space, and bump the ring slightly toward the chair (+Z, behind
          the worker) so the desk's footprint doesn't clip it from view. */}
      {highlighted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.44, 0.15]} renderOrder={2}>
          <ringGeometry args={[1.05, 1.45, 64]} />
          <meshBasicMaterial
            color="#1B47D6"
            transparent
            opacity={0.85}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

function ProceduralSeatedPerson({
  variation,
  highlighted,
  typingPhase,
}: {
  variation: WorkerVariation;
  highlighted: boolean;
  typingPhase: number;
}) {
  const skinMat = useMemo(() => buildSkinMat(variation), [variation]);
  const shirtMat = useMemo(() => buildShirtMat(variation), [variation]);
  const pantsMat = useMemo(() => buildPantsMat(variation), [variation]);
  const hairMat = useMemo(() => buildHairMat(variation), [variation]);

  // Small typing flutter: each arm rotates ±0.06 rad around its shoulder
  // pivot. Phase is passed in so the parent can offset per-agent so workers
  // don't type in unison.
  const leftArmTwitch = Math.sin(typingPhase) * 0.05;
  const rightArmTwitch = Math.sin(typingPhase + 0.8) * 0.05;

  return (
    <group>
      {/* Seated hips — z=0.02 aligns with chair seat centre. Slight forward
          lean (torso rotation-x=0.18) so the worker reads as typing. */}
      <group position={[0, 0.06, 0.02]}>
        <mesh geometry={HIPS_GEO} material={pantsMat} castShadow />
      </group>

      {/* Thighs are horizontal (rotation.x = Math.PI/2) resting on the seat;
          shins drop vertically from the knee. */}
      <group position={[-0.13, 0.07, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh geometry={THIGH_GEO} material={pantsMat} position={[0, 0, -0.17]} castShadow />
      </group>
      <group position={[0.13, 0.07, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh geometry={THIGH_GEO} material={pantsMat} position={[0, 0, -0.17]} castShadow />
      </group>
      <group position={[-0.13, -0.11, -0.2]}>
        <mesh geometry={SHIN_GEO} material={pantsMat} position={[0, -0.16, 0]} castShadow />
        <mesh geometry={SHOE_GEO} material={SHOE_MAT} position={[0, -0.36, -0.06]} castShadow />
      </group>
      <group position={[0.13, -0.11, -0.2]}>
        <mesh geometry={SHIN_GEO} material={pantsMat} position={[0, -0.16, 0]} castShadow />
        <mesh geometry={SHOE_GEO} material={SHOE_MAT} position={[0, -0.36, -0.06]} castShadow />
      </group>

      {/* Torso leans forward over keyboard. Pivot at hips.
          Convention: worker faces -Z, so all face features (eyes, hair sweep,
          collar) and arm reach must point toward -Z. The previous version
          had eyes / collar on +Z and arms rotating backward, which made the
          worker look like they were sitting backward at the desk. */}
      <group position={[0, 0.16, 0.02]} rotation={[0.2, 0, 0]}>
        <mesh geometry={TORSO_GEO} material={shirtMat} position={[0, 0.29, 0]} castShadow />
        {/* Collar detail — at the front of the neck. */}
        <mesh geometry={COLLAR_GEO} material={skinMat} position={[0, 0.52, -0.12]} rotation={[Math.PI / 2, Math.PI, 0]} />

        {/* Arms reach FORWARD (toward -Z, where the keyboard is).
            Upper arm pivots at the shoulder; mesh Y is set to -0.225 so the
            top rounded cap of the capsule sits exactly at the shoulder
            pivot (no "handle" bump on top of the torso). Rotation +0.55
            tilts the upper arm forward; the forearm then bends a further
            +1.0 rad so the hand lands roughly on the keyboard at desk
            height. */}
        <group position={[-0.3, 0.48, 0.0]} rotation={[0.55 + leftArmTwitch, 0, 0.1]}>
          <mesh geometry={UPPER_ARM_GEO} material={shirtMat} position={[0, -0.225, 0]} castShadow />
          <group position={[0, -0.42, 0]} rotation={[1.0, 0, 0]}>
            <mesh geometry={FOREARM_GEO} material={skinMat} position={[0, -0.18, 0]} castShadow />
            {/* Hand: small sphere at the wrist so the limb terminates
                cleanly on the keyboard rather than in a bare capsule cap. */}
            <mesh material={skinMat} position={[0, -0.36, 0]} castShadow>
              <sphereGeometry args={[0.07, 12, 10]} />
            </mesh>
          </group>
        </group>
        <group position={[0.3, 0.48, 0.0]} rotation={[0.55 + rightArmTwitch, 0, -0.1]}>
          <mesh geometry={UPPER_ARM_GEO} material={shirtMat} position={[0, -0.225, 0]} castShadow />
          <group position={[0, -0.42, 0]} rotation={[1.0, 0, 0]}>
            <mesh geometry={FOREARM_GEO} material={skinMat} position={[0, -0.18, 0]} castShadow />
            <mesh material={skinMat} position={[0, -0.36, 0]} castShadow>
              <sphereGeometry args={[0.07, 12, 10]} />
            </mesh>
          </group>
        </group>

        {/* Neck + head, pivot slightly tilted down (reading screen).
            Eye + hair offsets are negative-Z because the face points -Z
            (same direction the desk and monitor sit relative to the
            worker). */}
        <group position={[0, 0.6, 0.01]}>
          <mesh geometry={NECK_GEO} material={skinMat} castShadow />
          <group position={[0, 0.12, -0.02]} rotation={[-0.1, 0, 0]}>
            <mesh geometry={HEAD_GEO} material={skinMat} castShadow />
            {/* Ears */}
            <mesh geometry={EAR_GEO} material={skinMat} position={[-0.155, 0, 0]} />
            <mesh geometry={EAR_GEO} material={skinMat} position={[0.155, 0, 0]} />
            {/* Eyes — front of head (negative Z). */}
            <mesh geometry={EYE_WHITE_GEO} material={EYE_WHITE_MAT} position={[-0.055, 0.015, -0.135]} />
            <mesh geometry={EYE_IRIS_GEO} material={IRIS_MAT} position={[-0.055, 0.015, -0.15]} />
            <mesh geometry={EYE_WHITE_GEO} material={EYE_WHITE_MAT} position={[0.055, 0.015, -0.135]} />
            <mesh geometry={EYE_IRIS_GEO} material={IRIS_MAT} position={[0.055, 0.015, -0.15]} />
            {/* Hair dome — slight bias toward the BACK of the head so the
                forehead is exposed (looks like hair swept back). */}
            <mesh geometry={HAIR_GEO} material={hairMat} position={[0, 0.04, 0.015]} castShadow />
          </group>
        </group>
      </group>

      {highlighted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.45, 0.02]}>
          <torusGeometry args={[0.32, 0.02, 8, 32]} />
          <meshBasicMaterial color="#1B47D6" transparent opacity={0.75} />
        </mesh>
      )}
    </group>
  );
}

function GLBSeatedPerson({
  url,
  variation,
}: {
  url: string;
  variation: WorkerVariation;
}) {
  const gltf = useWorkerGLTF(url);
  const cloned = useMemo(() => {
    const clone = cloneWorkerScene(gltf.scene);
    clone.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh || obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material instanceof THREE.MeshStandardMaterial) {
          const mat = obj.material.clone();
          // Gentle per-agent tint. We do not touch the diffuse map; we tint
          // the material color which multiplies into the map.
          const name = obj.material.name.toLowerCase();
          if (name.includes("shirt") || name.includes("top")) {
            mat.color.copy(variation.shirtColor);
          } else if (name.includes("pants") || name.includes("trouser")) {
            mat.color.copy(variation.pantsColor);
          } else if (name.includes("hair")) {
            mat.color.copy(variation.hairColor);
          } else if (name.includes("skin") || name.includes("body")) {
            mat.color.copy(variation.skinTint);
          }
          obj.material = mat;
        }
      }
    });
    return clone;
  }, [gltf, variation]);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  useEffect(() => {
    const mixer = new THREE.AnimationMixer(cloned);
    for (const clip of gltf.animations ?? []) {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
    }
    mixer.setTime(Math.random() * 2.5);
    mixerRef.current = mixer;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [gltf, cloned]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
  });

  return <primitive object={cloned} />;
}

export default function AgentAvatar({
  agent,
  position,
  rotationY,
  isHeroCTO,
  highlighted = false,
  onClick,
}: AgentAvatarProps) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  const variation = useMemo(
    () => variationFromAgent(agent.agent_id, agent.department ?? "engineering"),
    [agent.agent_id, agent.department],
  );

  // Stable per-agent phase offset so nearby workers don't type in sync.
  const phaseOffset = useMemo(() => {
    let h = 0;
    for (let i = 0; i < agent.agent_id.length; i++) h = (h * 31 + agent.agent_id.charCodeAt(i)) | 0;
    return (Math.abs(h) % 1000) / 159;
  }, [agent.agent_id]);

  const [typingPhase, setTypingPhase] = useState(phaseOffset);
  useFrame((state) => {
    setTypingPhase(phaseOffset + state.clock.elapsedTime * 7);
  });

  const statusColor = STATUS_COLORS[agent.status] ?? "#22c55e";
  const usagePercent = Math.min(
    Math.round((agent.tokens_used_today / Math.max(agent.daily_token_budget, 1)) * 100),
    100,
  );

  const ellieAvailable = useWorkerAssetAvailable(ELLIE_MODEL_URL);
  const workerAvailable = useWorkerAssetAvailable(WORKER_MODEL_URL);
  const heroGlbAvailable = isHeroCTO && ellieAvailable;
  const staffGlbAvailable = !isHeroCTO && workerAvailable;

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[0, rotationY, 0]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
    >
      <Workstation highlighted={highlighted} />
      {heroGlbAvailable ? (
        <GLBSeatedPerson url={ELLIE_MODEL_URL} variation={variation} />
      ) : staffGlbAvailable ? (
        <GLBSeatedPerson url={WORKER_MODEL_URL} variation={variation} />
      ) : (
        <ProceduralSeatedPerson
          variation={variation}
          highlighted={highlighted}
          typingPhase={typingPhase}
        />
      )}

      {/* Small status dot on the monitor corner — tells you active/paused */}
      <mesh geometry={STATUS_DOT_GEO} position={[0.3, 1.0, -0.67]}>
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={0.7}
        />
      </mesh>

      {hovered && (
        <Html position={[0, 2.2, 0]} center distanceFactor={12} zIndexRange={[30, 0]}>
          <div
            style={{
              background: "rgba(255,255,255,0.96)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(226,232,244,0.9)",
              borderRadius: 10,
              padding: "6px 10px",
              fontFamily: "inherit",
              boxShadow: "0 6px 20px rgba(12,21,38,0.15)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1f1638" }}>{agent.name}</div>
            <div style={{ fontSize: 10, color: "#7a7390", textTransform: "capitalize" }}>
              {agent.role.replace(/_/g, " ")}
            </div>
            <div style={{ fontSize: 9, color: "#4D5E80", marginTop: 2 }}>
              {usagePercent}% budget used
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
