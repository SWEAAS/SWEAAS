/**
 * HQ interior scene — the Blender EEVEE building with real seated workers
 * at each desk, driven by the camera stepper.
 *
 * The previous version tiled 5 building copies in a U-shape and placed
 * agents as glowing pins on a lobby disc. That was a holdover from when
 * the HQ was a procedural campus exterior. Now the user is INSIDE the one
 * main building, walking the camera room to room — so the tiling is just
 * extra draw calls and the pins are gone.
 */
import { Suspense, useMemo } from "react";
import * as THREE from "three";
import {
  ContactShadows,
  Environment,
  Html,
  Lightformer,
  Sky,
  useGLTF,
  useProgress,
} from "@react-three/drei";
import AgentAvatar from "./AgentAvatar";
import CameraStepper from "./CameraStepper";
import GroundScenery from "./GroundScenery";
import type { Agent } from "../store/agentStore";
import { ROOMS, type DeskAssignment, type Stop } from "./tourStops";
import { useGlbAvailable } from "./useWorkerModel";

export const BUILDING_PATH = "/models/Building7EEVEE.glb";

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "#1B47D6", fontFamily: "inherit" }}>
        <div style={{ width: 48, height: 48, border: "3px solid #e2e8f0", borderTopColor: "#1B47D6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Loading headquarters… {progress.toFixed(0)}%</p>
      </div>
    </Html>
  );
}

// ─── Procedural textures (retained from prior version) ─────────────────────

const texCache = new Map<string, THREE.DataTexture>();

function hash2d(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263 + 1013904223) | 0;
  h = ((h >> 13) ^ h) | 0;
  h = (h * (h * h * 15731 + 789221) + 1376312589) | 0;
  return ((h >> 16) & 0x7fff) / 0x7fff;
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2d(ix, iy), n10 = hash2d(ix + 1, iy);
  const n01 = hash2d(ix, iy + 1), n11 = hash2d(ix + 1, iy + 1);
  return (n00 + (n10 - n00) * sx) + ((n01 + (n11 - n01) * sx) - (n00 + (n10 - n00) * sx)) * sy;
}

function fbm(x: number, y: number, octaves: number): number {
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) { val += amp * smoothNoise(x * freq, y * freq); amp *= 0.5; freq *= 2; }
  return val;
}

function makeNoiseNormal(key: string, size: number, scale: number, intensity: number, octaves = 4): THREE.DataTexture {
  if (texCache.has(key)) return texCache.get(key)!;
  const data = new Uint8Array(size * size * 4);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm(x / size * scale, y / size * scale, octaves);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const dx = (h[y * size + ((x - 1 + size) % size)] - h[y * size + ((x + 1) % size)]) * intensity;
    const dy = (h[((y - 1 + size) % size) * size + x] - h[((y + 1) % size) * size + x]) * intensity;
    data[i] = Math.min(255, Math.max(0, (dx * 0.5 + 0.5) * 255));
    data[i + 1] = Math.min(255, Math.max(0, (dy * 0.5 + 0.5) * 255));
    data[i + 2] = 255; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.needsUpdate = true;
  texCache.set(key, tex); return tex;
}

function makeBrushedNormal(key: string, size: number, intensity: number): THREE.DataTexture {
  if (texCache.has(key)) return texCache.get(key)!;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) { const r = hash2d(0, y) * 2 - 1; for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4; const dx = (r + (hash2d(x * 7, y * 13) * 2 - 1) * 0.3) * intensity;
    data[i] = Math.min(255, Math.max(0, (dx * 0.5 + 0.5) * 255)); data[i + 1] = 128; data[i + 2] = 255; data[i + 3] = 255;
  }}
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.needsUpdate = true;
  texCache.set(key, tex); return tex;
}

function makeWoodNormal(key: string, size: number, intensity: number): THREE.DataTexture {
  if (texCache.has(key)) return texCache.get(key)!;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const grain = Math.sin((y / size) * Math.PI * 40 + smoothNoise(x / size * 8, y / size * 2) * 6);
    data[i] = Math.min(255, Math.max(0, ((hash2d(x * 3, y * 5) * 2 - 1) * 0.15 * intensity * 0.5 + 0.5) * 255));
    data[i + 1] = Math.min(255, Math.max(0, (grain * intensity * 0.5 + 0.5) * 255));
    data[i + 2] = 255; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.needsUpdate = true;
  texCache.set(key, tex); return tex;
}

function makeStippleNormal(key: string, size: number, intensity: number): THREE.DataTexture {
  if (texCache.has(key)) return texCache.get(key)!;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const c = (smoothNoise(x / size * 20, y / size * 20) + smoothNoise(x / size * 40 + 100, y / size * 40 + 100) * 0.5) * intensity;
    data[i] = Math.min(255, Math.max(0, ((hash2d(x + 1, y) - hash2d(x - 1, y)) * c * 0.5 + 0.5) * 255));
    data[i + 1] = Math.min(255, Math.max(0, ((hash2d(x, y + 1) - hash2d(x, y - 1)) * c * 0.5 + 0.5) * 255));
    data[i + 2] = 255; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.needsUpdate = true;
  texCache.set(key, tex); return tex;
}

// ─── Material palette (EEVEE-matched Blender material names) ───────────────

interface MatDef {
  color: string; metalness: number; roughness: number;
  opacity?: number; transparent?: boolean;
  emissive?: string; emissiveIntensity?: number;
  normalTex?: THREE.DataTexture; normalScale?: number;
  envMapIntensity?: number;
}

const defs: Record<string, MatDef> = {
  Grey:          { color: "#9a9590", metalness: 0,    roughness: 0.85, normalTex: makeNoiseNormal("c-h", 256, 12, 1.8, 5), normalScale: 0.6 },
  White:         { color: "#e8e4df", metalness: 0,    roughness: 0.75, normalTex: makeNoiseNormal("c-l", 256, 10, 1.2, 4), normalScale: 0.4 },
  "White.003":   { color: "#e8e4df", metalness: 0,    roughness: 0.75, normalTex: makeNoiseNormal("c-l", 256, 10, 1.2, 4), normalScale: 0.4 },
  "1":           { color: "#d5d0c9", metalness: 0,    roughness: 0.7,  normalTex: makeNoiseNormal("c-m", 256, 8, 1.0, 4),  normalScale: 0.35 },
  Alu:           { color: "#b8bcc4", metalness: 0.9,  roughness: 0.25, normalTex: makeBrushedNormal("br", 256, 0.8), normalScale: 0.3, envMapIntensity: 1.5 },
  "Plastic.001": { color: "#2d2d30", metalness: 0.7,  roughness: 0.35 },
  Black:         { color: "#2a2a2a", metalness: 0,    roughness: 0.9,  normalTex: makeNoiseNormal("asp", 256, 16, 2.0, 5), normalScale: 0.5 },
  PlasticPav:    { color: "#5c5856", metalness: 0,    roughness: 0.85, normalTex: makeNoiseNormal("sw", 256, 14, 1.5, 4),  normalScale: 0.4 },
  Glass:         { color: "#c8dced", metalness: 0.15, roughness: 0.02, opacity: 0.3, transparent: true, envMapIntensity: 2.0 },
  Glass2:        { color: "#a0c0d8", metalness: 0.15, roughness: 0.02, opacity: 0.2, transparent: true, envMapIntensity: 2.0 },
  "Green.003":   { color: "#5a8a42", metalness: 0,    roughness: 0.9,  normalTex: makeStippleNormal("gr", 256, 1.5), normalScale: 0.5 },
  Wood1:         { color: "#7a5030", metalness: 0,    roughness: 0.45, normalTex: makeWoodNormal("wd", 256, 0.9), normalScale: 0.4 },
  Display:       { color: "#000000", metalness: 0,    roughness: 0.3,  emissive: "#4aa0ff", emissiveIntensity: 2.0 },
  Lights:        { color: "#000000", metalness: 0,    roughness: 0.3,  emissive: "#fff0d0", emissiveIntensity: 2.5 },
  "2.White.000": { color: "#000000", metalness: 0,    roughness: 0.3,  emissive: "#60b0ff", emissiveIntensity: 1.5 },
  "2.White.005": { color: "#000000", metalness: 0,    roughness: 0.3,  emissive: "#ff9040", emissiveIntensity: 2.0 },
};

function makeMat(d: MatDef, name: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: d.color, metalness: d.metalness, roughness: d.roughness,
    opacity: d.opacity ?? 1, transparent: d.transparent ?? false,
    side: THREE.DoubleSide, name,
  });
  if (d.emissive) { m.emissive = new THREE.Color(d.emissive); m.emissiveIntensity = d.emissiveIntensity ?? 1; }
  if (d.envMapIntensity !== undefined) m.envMapIntensity = d.envMapIntensity;
  if (d.normalTex) { m.normalMap = d.normalTex; m.normalScale = new THREE.Vector2(d.normalScale ?? 1, d.normalScale ?? 1); }
  return m;
}

const matByName = new Map<string, THREE.MeshStandardMaterial>();
for (const [n, d] of Object.entries(defs)) matByName.set(n, makeMat(d, n));
const fallbackMat = makeMat({ color: "#404045", metalness: 0.5, roughness: 0.6 }, "__fallback");

const processedScenes = new WeakSet<THREE.Object3D>();

function applyMaterials(scene: THREE.Object3D) {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const resolve = (mat: THREE.Material): THREE.Material => {
      if (mat.name && matByName.has(mat.name)) return matByName.get(mat.name)!;
      return fallbackMat;
    };
    if (Array.isArray(child.material)) {
      child.material = child.material.map(resolve);
    } else {
      child.material = resolve(child.material);
    }
  });
}

function LoadedBuildingModel() {
  const gltf = useGLTF(BUILDING_PATH);
  useMemo(() => {
    const scene = gltf.scene;
    if (!processedScenes.has(scene)) {
      applyMaterials(scene);
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      scene.position.sub(center);
      processedScenes.add(scene);
    }
  }, [gltf]);
  return <primitive object={gltf.scene} />;
}

/**
 * Gate the GLB load behind a content-type probe. Production (Amplify +
 * CloudFront) returns the SPA index.html with `200 OK` for any path that
 * isn't in the deploy bundle, and `useGLTF` will happily try to parse
 * `<!doctype html>` as a glTF binary and then throw. The thrown error
 * propagates out of Suspense, crashes the whole Canvas, and the user sees
 * the "3D scene failed to load" fallback.
 *
 * With this guard, a missing building quietly falls back to rendering
 * nothing for the building and the rest of the scene (workers, lights,
 * outdoor scenery) still renders. Dev + correctly-deployed prod see the
 * full GLB. A one-liner `console.warn` keeps the mis-deploy visible.
 */
let missingBuildingWarned = false;
function BuildingModel() {
  const available = useGlbAvailable(BUILDING_PATH);
  if (!available) {
    if (typeof window !== "undefined" && !missingBuildingWarned) {
      // eslint-disable-next-line no-console
      console.warn(
        `[HQ] Building GLB missing or served as HTML at ${BUILDING_PATH}. ` +
          `Rendering scene without the building shell. Check that the Amplify ` +
          `deploy zip contains frontend/dist/models/.`,
      );
      missingBuildingWarned = true;
    }
    return null;
  }
  return <LoadedBuildingModel />;
}

// ─── Room floor + ceiling lights (gives interior its own lighting) ─────────

function RoomAmbientLights() {
  // One soft overhead spot per room. Positions are the room bounds centers
  // lifted to ceiling height. Keeps characters readable even if the GLB
  // building has no interior lights.
  return (
    <group>
      {Object.values(ROOMS).map((room) => {
        const cx = (room.bounds.min[0] + room.bounds.max[0]) / 2;
        const cz = (room.bounds.min[2] + room.bounds.max[2]) / 2;
        return (
          <pointLight
            key={room.id}
            position={[cx, 3.6, cz]}
            intensity={18}
            distance={18}
            decay={1.4}
            color="#fff2d8"
            castShadow={false}
          />
        );
      })}
    </group>
  );
}

// ─── Workers — one AgentAvatar per desk assignment ─────────────────────────

interface WorkersProps {
  assignments: DeskAssignment[];
  highlightedAgentId: string | null;
  highlightedRoomId: string | null;
  onAgentClick: (agent: Agent) => void;
}

function Workers({ assignments, highlightedAgentId, highlightedRoomId, onAgentClick }: WorkersProps) {
  return (
    <group>
      {assignments.map(({ agent, anchor, isHeroCTO }) => {
        const isHighlighted =
          agent.agent_id === highlightedAgentId ||
          (highlightedAgentId === null && anchor.room === highlightedRoomId);
        return (
          <AgentAvatar
            key={agent.agent_id}
            agent={agent}
            position={anchor.position}
            rotationY={anchor.rotationY}
            isHeroCTO={isHeroCTO}
            highlighted={isHighlighted}
            onClick={() => onAgentClick(agent)}
          />
        );
      })}
    </group>
  );
}

// ─── Scene ─────────────────────────────────────────────────────────────────

interface WelcomeHWSceneProps {
  agents?: Agent[];
  assignments: DeskAssignment[];
  stops: Stop[];
  stopIndex: number;
  stepperActive: boolean;
  onAgentClick?: (agent: Agent) => void;
}

export default function WelcomeHWScene({
  assignments,
  stops,
  stopIndex,
  stepperActive,
  onAgentClick,
}: WelcomeHWSceneProps) {
  const currentStop = stops[stopIndex] ?? null;
  const highlightedAgentId = currentStop?.kind === "person" ? currentStop.agentId : null;
  const highlightedRoomId = currentStop?.roomId ?? null;

  return (
    <>
      <Sky sunPosition={[80, 45, 60]} turbidity={4} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.8} />

      <Suspense fallback={null}>
        <Environment preset="city" resolution={256}>
          <Lightformer intensity={2.2} color="#fff3d4" position={[18, 18, 10]} rotation={[0, Math.PI / 3, 0]} scale={[20, 20, 1]} />
          <Lightformer intensity={1.0} color="#c7e4ff" position={[-16, 10, -12]} rotation={[0, -Math.PI / 4, 0]} scale={[14, 10, 1]} />
          <Lightformer intensity={0.6} color="#ffe8b0" position={[0, 30, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[40, 40, 1]} />
        </Environment>
      </Suspense>

      <ambientLight intensity={0.9} color="#fff8e8" />
      <hemisphereLight args={["#d8e8ff", "#f0e6d0", 0.6]} position={[0, 40, 0]} />
      <directionalLight
        position={[60, 80, 50]}
        intensity={2.0}
        color="#fff4d6"
        castShadow
        shadow-bias={-0.0001}
        shadow-normalBias={0.03}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={380}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
      />
      <directionalLight position={[-20, 25, -15]} intensity={0.35} color="#b8dcff" />

      <RoomAmbientLights />

      {/* Ground — a large warm-grey plane to act as the base earth color
          underneath the grass patches and outside the campus footprint. The
          plane is unshaded slightly below the building so we can layer
          grass + paths on top without z-fighting. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color="#a89b80" roughness={1} />
      </mesh>

      {/* Trees, grass, paths — strictly outside the building footprint. */}
      <GroundScenery />

      <ContactShadows position={[0, 0.03, 0]} scale={90} blur={2.2} opacity={0.4} far={22} resolution={1024} color="#2b2322" />

      <Suspense fallback={<Loader />}>
        <BuildingModel />
      </Suspense>

      <Workers
        assignments={assignments}
        highlightedAgentId={highlightedAgentId}
        highlightedRoomId={highlightedRoomId}
        onAgentClick={(agent) => onAgentClick?.(agent)}
      />

      <CameraStepper
        stops={stops}
        currentIndex={stopIndex}
        assignments={assignments}
        active={stepperActive}
      />
    </>
  );
}

// NOTE: do NOT `useGLTF.preload(BUILDING_PATH)` here. If the building GLB
// is missing from the deploy bundle the preload starts fetching before our
// HEAD probe has a chance to report `missing`, and drei caches an errored
// loader promise that later resurfaces as a "3D scene failed to load"
// crash. BuildingModel gates the load behind useGlbAvailable() instead.
