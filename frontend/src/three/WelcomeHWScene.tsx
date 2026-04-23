/**
 * Campus exterior scene — the GLB-backed U-shaped office park with trees,
 * walking paths, and grass patches that lives at the "Campus" mode of the
 * unified /welcome-hw view.
 *
 * Extracted from the original WelcomeHWView so the outer view can swap
 * between this scene and the interactive office interior (HQScene) via
 * a single Canvas swap.
 *
 * Ships ONE GLB (`Building7Cycles.glb`) — the dev-facing Cycles/EEVEE
 * comparison toggle was removed because it shipped a 36 MB asset pair and
 * a tech-demo feeling to real users. See BUILDING_PATH below to change.
 */
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  ContactShadows,
  Environment,
  Html,
  Lightformer,
  OrbitControls,
  Sky,
  useGLTF,
  useProgress,
} from "@react-three/drei";
import ExplorationControls from "./controls/ExplorationControls";
import type { Agent } from "../store/agentStore";

// Single production GLB — the EEVEE export from Blender is the canonical
// SWEAAS headquarters model. The Cycles sibling (Building7Cycles.glb) is
// kept in public/models/ for the Blender pipeline but is not user-facing.
export const BUILDING_PATH = "/models/Building7EEVEE.glb";

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "#1B47D6", fontFamily: "inherit" }}>
        <div style={{ width: 48, height: 48, border: "3px solid #e2e8f0", borderTopColor: "#1B47D6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Loading campus… {progress.toFixed(0)}%</p>
      </div>
    </Html>
  );
}

// ─── Procedural texture generators ──────────────────────────────────────────

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

// ─── Material palette ───────────────────────────────────────────────────────

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

// Processed-scene marker — WeakSet avoids mutating the useGLTF-returned
// object with a string key, which React Compiler's immutability rule flags.
const processedScenes = new WeakSet<THREE.Object3D>();

// ─── Procedural trees, grass, paths ─────────────────────────────────────────

const TRUNK_MAT = new THREE.MeshStandardMaterial({ color: "#5c3a1e", roughness: 0.9, metalness: 0 });
const CANOPY_MATS = [
  new THREE.MeshStandardMaterial({ color: "#3d7a2a", roughness: 0.85, metalness: 0 }),
  new THREE.MeshStandardMaterial({ color: "#4a8c35", roughness: 0.85, metalness: 0 }),
  new THREE.MeshStandardMaterial({ color: "#2e6b20", roughness: 0.85, metalness: 0 }),
  new THREE.MeshStandardMaterial({ color: "#55943e", roughness: 0.85, metalness: 0 }),
  new THREE.MeshStandardMaterial({ color: "#3a7030", roughness: 0.85, metalness: 0 }),
];

const TRUNK_GEO = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
const CANOPY_GEOS = [
  new THREE.SphereGeometry(1, 8, 6),
  new THREE.DodecahedronGeometry(1, 0),
  new THREE.IcosahedronGeometry(1, 0),
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

interface TreeData { x: number; z: number; trunkH: number; canopyR: number; canopyGeo: number; canopyMat: number; canopyY: number; }

const BUILDING_LAYOUT: [number, number][] = [
  [0, 0],
  [-135, 0],
  [135, 0],
  [-135, 115],
  [135, 115],
];

function insideAnyBuilding(x: number, z: number): boolean {
  const halfW = 42;
  const halfD = 30;
  return BUILDING_LAYOUT.some(
    ([cx, cz]) => Math.abs(x - cx) < halfW && Math.abs(z - cz) < halfD,
  );
}

function generateTreePositions(): TreeData[] {
  const rng = seededRandom(42);
  const trees: TreeData[] = [];
  const minDist = 3.5;
  const tooClose = (x: number, z: number) =>
    trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < minDist * minDist);
  const tryAdd = (x: number, z: number, trunkH: number, canopyR: number) => {
    if (tooClose(x, z)) return;
    if (insideAnyBuilding(x, z)) return;
    trees.push({
      x, z, trunkH, canopyR,
      canopyGeo: Math.floor(rng() * CANOPY_GEOS.length),
      canopyMat: Math.floor(rng() * CANOPY_MATS.length),
      canopyY: 0,
    });
  };
  for (const [cx, cz] of BUILDING_LAYOUT) {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.12) {
      const radius = 48 + rng() * 14;
      const x = cx + Math.cos(angle) * radius + (rng() - 0.5) * 3;
      const z = cz + Math.sin(angle) * radius + (rng() - 0.5) * 3;
      tryAdd(x, z, 1.8 + rng() * 1.5, 1.5 + rng() * 1.2);
    }
  }
  for (let i = 0; i < 220; i++) {
    const x = (rng() - 0.5) * 350;
    const z = (rng() - 0.5) * 350;
    tryAdd(x, z, 1.5 + rng() * 2.0, 1.2 + rng() * 1.8);
  }
  for (const t of trees) t.canopyY = t.trunkH * 0.8;
  return trees;
}

const TREE_DATA = generateTreePositions();

function Trees() {
  return (
    <group>
      {TREE_DATA.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh geometry={TRUNK_GEO} material={TRUNK_MAT} position={[0, t.trunkH / 2, 0]} scale={[1, t.trunkH, 1]} castShadow />
          <mesh geometry={CANOPY_GEOS[t.canopyGeo]} material={CANOPY_MATS[t.canopyMat]} position={[0, t.trunkH + t.canopyR * 0.6, 0]} scale={[t.canopyR, t.canopyR * 0.85, t.canopyR]} castShadow />
        </group>
      ))}
    </group>
  );
}

function GrassPatches() {
  const rng = seededRandom(99);
  const patches: { x: number; z: number; r: number; shade: string }[] = [];
  const shades = ["#4a8c35", "#3d7a2a", "#5a9a44", "#3a7030", "#4e9038"];
  for (let i = 0; i < 150; i++) {
    const x = (rng() - 0.5) * 400;
    const z = (rng() - 0.5) * 400;
    if (insideAnyBuilding(x, z)) continue;
    patches.push({ x, z, r: 2 + rng() * 6, shade: shades[Math.floor(rng() * shades.length)] });
  }
  return (
    <group>
      {patches.map((p, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, rng() * Math.PI]} position={[p.x, 0.01, p.z]} receiveShadow>
          <circleGeometry args={[p.r, 12]} />
          <meshStandardMaterial color={p.shade} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function WalkingPaths() {
  const pathMat = new THREE.MeshStandardMaterial({ color: "#d4cfc6", roughness: 0.8, metalness: 0 });
  const paths: { x: number; z: number; w: number; h: number; rot: number }[] = [];
  paths.push({ x: 0, z: 0, w: 3.5, h: 220, rot: Math.PI / 2 });
  paths.push({ x: -135, z: 58, w: 3.5, h: 140, rot: 0 });
  paths.push({ x: 135, z: 58, w: 3.5, h: 140, rot: 0 });
  paths.push({ x: 0, z: 120, w: 18, h: 3.5, rot: 0 });
  for (const [cx, cz] of BUILDING_LAYOUT) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 34;
      paths.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, w: 2.2, h: 7, rot: -a });
    }
  }
  return (
    <group>
      {paths.map((p, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, p.rot]} position={[p.x, 0.02, p.z]} receiveShadow>
          <planeGeometry args={[p.w, p.h]} />
          <primitive object={pathMat} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

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

function BuildingModel() {
  const gltf = useGLTF(BUILDING_PATH);
  const groupRef = useRef<THREE.Group>(null);

  // Derive the extra U-shape copies once per gltf change. Using useMemo
  // (instead of useEffect + setState) avoids the set-state-in-effect
  // cascade and keeps the mutation of the gltf scene contained to this
  // single memo body.
  const copies = useMemo(() => {
    const scene = gltf.scene;
    if (!processedScenes.has(scene)) {
      applyMaterials(scene);
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      scene.position.sub(center);
      processedScenes.add(scene);
    }
    const clones: THREE.Object3D[] = [];
    for (const [cx, cz] of BUILDING_LAYOUT) {
      if (cx === 0 && cz === 0) continue;
      const clone = scene.clone(true);
      applyMaterials(clone);
      clone.position.set(cx + scene.position.x, scene.position.y, cz + scene.position.z);
      clones.push(clone);
    }
    return clones;
  }, [gltf]);

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene} />
      {copies.map((c, i) => (
        <primitive key={i} object={c} />
      ))}
    </group>
  );
}

// ─── Agent markers ──────────────────────────────────────────────────────────
//
// Agents live visually *inside* the main HQ building. Each agent is a small
// emissive pin with a floating name card. Clicking the pin opens the shared
// AgentChatPanel. The CTO gets a prominent spot slightly raised (exec
// floor); the rest fan out in a grid on the ground floor within the
// building's interior footprint (see `insideAnyBuilding` halfW=42, halfD=30).
//
// The pins use drei's `<Html>` for labels + an emissive sphere/cone for the
// 3D marker itself, so they're visible from any camera angle and survive
// the Blender material remap.

const DEPT_COLORS: Record<string, string> = {
  engineering: "#1B47D6",
  product: "#2ea06b",
  marketing: "#D97706",
  support: "#9233ea",
};

// Interior anchor for the agent roster — inside the center building of the
// U-shape layout. Tuned so the pins don't clip through walls / the floor
// of the Blender model.
const AGENT_MARKER_BASE: [number, number, number] = [0, 1.4, 0];
const AGENT_MARKER_SPACING = 3.2;
// Max half-extent of the center building's interior (matches
// `insideAnyBuilding` halfW/halfD) so the grid never spills outside.
const INTERIOR_HALF_W = 34;
const INTERIOR_HALF_D = 22;

function markerColor(agent: Agent): string {
  return DEPT_COLORS[agent.department] ?? "#1B47D6";
}

function AgentMarker({
  agent,
  position,
  onClick,
  isCto,
}: {
  agent: Agent;
  position: [number, number, number];
  onClick: (agent: Agent) => void;
  isCto: boolean;
}) {
  const color = markerColor(agent);
  const size = isCto ? 1.3 : 0.95;

  return (
    <group position={position}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick(agent);
        }}
        onPointerOver={(e) => {
          (e.object as THREE.Mesh & { cursor?: string }).cursor = "pointer";
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
        castShadow
      >
        <sphereGeometry args={[size, 24, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isCto ? 0.55 : 0.35}
          metalness={0.15}
          roughness={0.35}
        />
      </mesh>
      {/* Cone pointing down so the marker reads as a "pin" */}
      <mesh position={[0, -size * 0.75, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[size * 0.35, size * 0.7, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <Html
        center
        distanceFactor={28}
        position={[0, size + 1.6, 0]}
        zIndexRange={[30, 0]}
        occlude={false}
        pointerEvents="none"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.95)",
            border: `1px solid ${color}`,
            boxShadow: "0 4px 14px rgba(12,21,38,0.18)",
            color: "#1f1638",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "-0.01em" }}>
            {agent.name}
          </span>
          <span style={{ fontSize: 9, fontWeight: 600, color: color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {isCto ? "CTO" : agent.role.replace(/_/g, " ")}
          </span>
        </div>
      </Html>
    </group>
  );
}

function AgentMarkers({
  agents,
  onAgentClick,
}: {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
}) {
  const { cto, rest } = useMemo(() => {
    const cto = agents.find((a) => a.role === "cto" || a.hierarchy_level === "cto") ?? null;
    const rest = cto ? agents.filter((a) => a.agent_id !== cto.agent_id) : agents;
    return { cto, rest };
  }, [agents]);

  if (agents.length === 0) return null;

  // Grid arrangement inside the main building's interior footprint. Columns
  // scale with agent count so 4-agent and 40-agent teams both fit; grid is
  // clamped to the interior half-extents so no pin spills out a wall.
  const cols = Math.max(3, Math.ceil(Math.sqrt(rest.length)));
  const rows = Math.max(1, Math.ceil(rest.length / cols));
  const spacingX = Math.min(AGENT_MARKER_SPACING, (INTERIOR_HALF_W * 1.6) / Math.max(cols, 1));
  const spacingZ = Math.min(AGENT_MARKER_SPACING, (INTERIOR_HALF_D * 1.4) / Math.max(rows, 1));

  return (
    <group position={AGENT_MARKER_BASE}>
      {/* CTO sits at the head of the interior, slightly raised like an
          exec desk at the front of the room. */}
      {cto && (
        <AgentMarker
          agent={cto}
          position={[0, 1.6, -INTERIOR_HALF_D * 0.55]}
          onClick={onAgentClick}
          isCto
        />
      )}
      {rest.map((agent, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = (col - (cols - 1) / 2) * spacingX;
        const z = (row - (rows - 1) / 2) * spacingZ + INTERIOR_HALF_D * 0.12;
        return (
          <AgentMarker
            key={agent.agent_id}
            agent={agent}
            position={[x, 0.8, z]}
            onClick={onAgentClick}
            isCto={false}
          />
        );
      })}
      {/* Soft lobby-floor disc under the grid so the pins feel grounded on a
          real surface, not floating inside the model. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[Math.min(INTERIOR_HALF_W, INTERIOR_HALF_D) - 1, 48]} />
        <meshStandardMaterial color="#dcd6e4" roughness={0.9} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

// ─── Scene ─────────────────────────────────────────────────────────────────

interface WelcomeHWSceneProps {
  /** Agent roster — rendered as clickable pins on the plaza in front of HQ. */
  agents?: Agent[];
  /** Fired when a marker is clicked. The parent opens AgentChatPanel. */
  onAgentClick?: (agent: Agent) => void;
  /** Camera behaviour. Walkthrough uses pointer-lock + WASD. */
  cameraMode?: "overview" | "walkthrough";
  /** Enables OrbitControls auto-rotate for the scripted Tour mode. */
  autoRotate?: boolean;
}

/**
 * The canonical SWEAAS headquarters scene — Blender EEVEE campus GLB, trees,
 * paths, plaza, and (when agents are supplied) clickable agent pins.
 *
 * Rendered inside the parent view's `<Canvas>` so camera/Canvas config stays
 * consistent across mode switches without remounting WebGL.
 */
export default function WelcomeHWScene({
  agents = [],
  onAgentClick,
  cameraMode = "overview",
  autoRotate = false,
}: WelcomeHWSceneProps) {
  // Walkthrough drops the user just inside the main HQ at eye height.
  const walkthroughStart: [number, number, number] = [0, 1.7, 25];

  return (
    <>
      {/* Sky renders instantly — no remote assets, no Suspense needed. */}
      <Sky sunPosition={[80, 45, 60]} turbidity={4} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.8} />

      {/* The HDRI env preset loads from a remote URL and will suspend until
          ready. Wrap in its own Suspense with a null fallback so the rest of
          the scene (ground, trees, paths, agents) paints immediately without
          waiting for the environment to download. */}
      <Suspense fallback={null}>
        <Environment preset="park" resolution={256}>
          <Lightformer intensity={2.2} color="#fff3d4" position={[18, 18, 10]} rotation={[0, Math.PI / 3, 0]} scale={[20, 20, 1]} />
          <Lightformer intensity={1.0} color="#c7e4ff" position={[-16, 10, -12]} rotation={[0, -Math.PI / 4, 0]} scale={[14, 10, 1]} />
          <Lightformer intensity={0.6} color="#ffe8b0" position={[0, 30, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[40, 40, 1]} />
        </Environment>
      </Suspense>

      <ambientLight intensity={0.6} color="#fff8e8" />
      <hemisphereLight args={["#87ceeb", "#4a8c35", 0.7]} position={[0, 40, 0]} />
      <directionalLight position={[60, 80, 50]} intensity={2.5} color="#fff4d6" castShadow shadow-bias={-0.0001} shadow-normalBias={0.03} shadow-mapSize={[2048, 2048]} shadow-camera-far={380} shadow-camera-left={-220} shadow-camera-right={220} shadow-camera-top={220} shadow-camera-bottom={-220} />
      <directionalLight position={[-20, 25, -15]} intensity={0.4} color="#b8dcff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#5a9a3e" roughness={0.92} />
      </mesh>

      <GrassPatches />
      <WalkingPaths />
      <Trees />

      <ContactShadows position={[0, 0.02, 40]} scale={120} blur={2.5} opacity={0.12} far={28} resolution={512} color="#4f6f2f" />

      {/* GLB building is isolated in its own Suspense so the rest of the
          scene (trees/ground/agents) is visible while the ~18MB EEVEE model
          downloads on first visit. */}
      <Suspense fallback={<Loader />}>
        <BuildingModel />
      </Suspense>

      {/* Agent pins live inside the main building. Rendered outside the
          BuildingModel Suspense so they appear immediately even before the
          GLB finishes streaming in. */}
      {onAgentClick && agents.length > 0 && (
        <AgentMarkers agents={agents} onAgentClick={onAgentClick} />
      )}

      {cameraMode === "walkthrough" ? (
        <ExplorationControls
          mode="walkthrough"
          walkthroughStart={walkthroughStart}
          minY={1.5}
          maxY={45}
        />
      ) : (
        <OrbitControls
          target={[0, 2, 0]}
          enablePan
          enableZoom
          enableRotate
          maxPolarAngle={Math.PI / 2.05}
          minDistance={25}
          maxDistance={420}
          autoRotate={autoRotate}
          autoRotateSpeed={0.35}
        />
      )}
    </>
  );
}

// Preload the HQ GLB once at module load so the first render doesn't block
// on a ~18 MB download.
useGLTF.preload(BUILDING_PATH);
