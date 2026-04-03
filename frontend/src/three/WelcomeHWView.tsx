import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  Sky,
  useGLTF,
  Html,
  useProgress,
} from "@react-three/drei";

type ModelName = "cycles" | "eevee";

const MODEL_PATHS: Record<ModelName, string> = {
  cycles: "/models/Building7Cycles.glb",
  eevee: "/models/Building7EEVEE.glb",
};

const MODEL_LABELS: Record<ModelName, string> = {
  cycles: "Cycles Render",
  eevee: "EEVEE Render",
};

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "#1B47D6", fontFamily: "inherit" }}>
        <div style={{ width: 48, height: 48, border: "3px solid #e2e8f0", borderTopColor: "#1B47D6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Loading model… {progress.toFixed(0)}%</p>
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

// ─── Stamp marker to prevent re-processing on HMR ──────────────────────────
const PROCESSED = "__hw_styled";

// ─── Procedural trees (Apple Park campus style) ─────────────────────────────

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

// U-shaped campus layout: one center building at the back,
// two side buildings, and two forward arms that open toward the camera.
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

  // Trees around each building in the U layout
  for (const [cx, cz] of BUILDING_LAYOUT) {
    // Perimeter ring per building
    for (let angle = 0; angle < Math.PI * 2; angle += 0.12) {
      const radius = 48 + rng() * 14;
      const x = cx + Math.cos(angle) * radius + (rng() - 0.5) * 3;
      const z = cz + Math.sin(angle) * radius + (rng() - 0.5) * 3;
      tryAdd(x, z, 1.8 + rng() * 1.5, 1.5 + rng() * 1.2);
    }
  }

  // Fill gaps between buildings with orchard-style scattered trees
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
          {/* Trunk */}
          <mesh
            geometry={TRUNK_GEO}
            material={TRUNK_MAT}
            position={[0, t.trunkH / 2, 0]}
            scale={[1, t.trunkH, 1]}
            castShadow
          />
          {/* Canopy */}
          <mesh
            geometry={CANOPY_GEOS[t.canopyGeo]}
            material={CANOPY_MATS[t.canopyMat]}
            position={[0, t.trunkH + t.canopyR * 0.6, 0]}
            scale={[t.canopyR, t.canopyR * 0.85, t.canopyR]}
            castShadow
          />
        </group>
      ))}
    </group>
  );
}

// ─── Grass patches (scattered ground detail) ────────────────────────────────

function GrassPatches() {
  const rng = seededRandom(99);
  const patches: { x: number; z: number; r: number; shade: string }[] = [];
  const shades = ["#4a8c35", "#3d7a2a", "#5a9a44", "#3a7030", "#4e9038"];
  for (let i = 0; i < 150; i++) {
    const x = (rng() - 0.5) * 400;
    const z = (rng() - 0.5) * 400;
    if (insideAnyBuilding(x, z)) continue;
    patches.push({
      x, z,
      r: 2 + rng() * 6,
      shade: shades[Math.floor(rng() * shades.length)],
    });
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

// ─── Walking paths ──────────────────────────────────────────────────────────

function WalkingPaths() {
  const pathMat = new THREE.MeshStandardMaterial({ color: "#d4cfc6", roughness: 0.8, metalness: 0 });
  const paths: { x: number; z: number; w: number; h: number; rot: number }[] = [];

  // Back spine of the U
  paths.push({ x: 0, z: 0, w: 3.5, h: 220, rot: Math.PI / 2 });
  // Left and right arms of the U
  paths.push({ x: -135, z: 58, w: 3.5, h: 140, rot: 0 });
  paths.push({ x: 135, z: 58, w: 3.5, h: 140, rot: 0 });
  // Courtyard entry path
  paths.push({ x: 0, z: 120, w: 18, h: 3.5, rot: 0 });

  // Ring paths around each building
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

// ─── BuildingModel (+ campus copies) ────────────────────────────────────────

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

function BuildingModel({ path }: { path: string }) {
  const gltf = useGLTF(path);
  const groupRef = useRef<THREE.Group>(null);
  const [copies, setCopies] = useState<THREE.Object3D[]>([]);

  useEffect(() => {
    const scene = gltf.scene;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(scene as any)[PROCESSED]) {
      applyMaterials(scene);
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      scene.position.sub(center);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (scene as any)[PROCESSED] = true;
    }

    // Create building copies using the explicit U-shaped layout
    const clones: THREE.Object3D[] = [];
    for (const [cx, cz] of BUILDING_LAYOUT) {
      if (cx === 0 && cz === 0) continue;
      const clone = scene.clone(true);
      applyMaterials(clone);
      clone.position.set(cx + scene.position.x, scene.position.y, cz + scene.position.z);
      clones.push(clone);
    }
    setCopies(clones);
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

// ─── Page ───────────────────────────────────────────────────────────────────

export default function WelcomeHWView() {
  const [activeModel, setActiveModel] = useState<ModelName>("cycles");

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 60px)" }}>
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 40, display: "flex", gap: 8, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(226,232,244,0.9)", borderRadius: 12, padding: 6, boxShadow: "0 4px 16px rgba(12,21,38,0.07)" }}>
        {(Object.keys(MODEL_PATHS) as ModelName[]).map((key) => {
          const active = activeModel === key;
          return (
            <button key={key} onClick={() => setActiveModel(key)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(195,208,248,0.9)", background: active ? "#1B47D6" : "rgba(255,255,255,0.9)", color: active ? "#fff" : "#1B47D6", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s, color 0.15s" }}>
              {MODEL_LABELS[key]}
            </button>
          );
        })}
      </div>

      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 40, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(226,232,244,0.9)", borderRadius: 10, padding: "10px 18px", boxShadow: "0 4px 16px rgba(12,21,38,0.07)" }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#1f1638", margin: 0, letterSpacing: "-0.02em" }}>Welcome to HQ</p>
        <p style={{ fontSize: 11, color: "#7a7390", margin: "2px 0 0", fontWeight: 500 }}>3D Building Preview — {MODEL_LABELS[activeModel]}</p>
      </div>

      <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 40, background: "rgba(255,255,255,0.88)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(226,232,244,0.9)", borderRadius: 10, padding: "6px 16px", boxShadow: "0 4px 16px rgba(12,21,38,0.07)" }}>
        <p style={{ fontSize: 11, color: "#4D5E80", margin: 0, fontWeight: 500 }}>
          <span style={{ color: "#1B47D6", fontWeight: 700 }}>Controls:</span>{" "}Drag to orbit · Scroll to zoom · Right-drag to pan
        </p>
      </div>

      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 135, 260], fov: 42 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        style={{ background: "#c8e0f0" }}
      >
        {/* Warm golden-hour sunshine sky */}
        <Sky sunPosition={[80, 45, 60]} turbidity={4} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.8} />
        <Environment preset="park" resolution={256}>
          <Lightformer intensity={2.2} color="#fff3d4" position={[18, 18, 10]} rotation={[0, Math.PI / 3, 0]} scale={[20, 20, 1]} />
          <Lightformer intensity={1.0} color="#c7e4ff" position={[-16, 10, -12]} rotation={[0, -Math.PI / 4, 0]} scale={[14, 10, 1]} />
          <Lightformer intensity={0.6} color="#ffe8b0" position={[0, 30, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[40, 40, 1]} />
        </Environment>

        <ambientLight intensity={0.4} color="#fff8e8" />
        <hemisphereLight args={["#87ceeb", "#4a8c35", 0.55]} position={[0, 40, 0]} />
        {/* Main sun — warm directional */}
        <directionalLight position={[60, 80, 50]} intensity={2.5} color="#fff4d6" castShadow shadow-bias={-0.0001} shadow-normalBias={0.03} shadow-mapSize={[2048, 2048]} shadow-camera-far={380} shadow-camera-left={-220} shadow-camera-right={220} shadow-camera-top={220} shadow-camera-bottom={-220} />
        {/* Fill light — cooler sky bounce */}
        <directionalLight position={[-20, 25, -15]} intensity={0.4} color="#b8dcff" />

        {/* Lush green ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[600, 600]} />
          <meshStandardMaterial color="#5a9a3e" roughness={0.92} />
        </mesh>

        <GrassPatches />
        <WalkingPaths />
        <Trees />

        <ContactShadows position={[0, 0.02, 40]} scale={120} blur={2.5} opacity={0.12} far={28} resolution={512} color="#4f6f2f" />

        <Suspense fallback={<Loader />}>
          <BuildingModel key={activeModel} path={MODEL_PATHS[activeModel]} />
        </Suspense>

        <OrbitControls target={[0, 0, 40]} enablePan enableZoom enableRotate maxPolarAngle={Math.PI / 2.05} minDistance={40} maxDistance={420} />
      </Canvas>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

useGLTF.preload(MODEL_PATHS.cycles);
