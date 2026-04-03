import { Suspense, useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  Sky,
  useGLTF,
  Center,
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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          color: "#1B47D6",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            border: "3px solid #e2e8f0",
            borderTopColor: "#1B47D6",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
          Loading model… {progress.toFixed(0)}%
        </p>
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
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fbm(x: number, y: number, octaves: number): number {
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * smoothNoise(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return val;
}

function makeNoiseNormalMap(
  key: string, size: number, scale: number, intensity: number, octaves = 4,
): THREE.DataTexture {
  const cached = texCache.get(key);
  if (cached) return cached;

  const data = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      heights[y * size + x] = fbm(x / size * scale, y / size * scale, octaves);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const xp = heights[y * size + ((x + 1) % size)];
      const xm = heights[y * size + ((x - 1 + size) % size)];
      const yp = heights[((y + 1) % size) * size + x];
      const ym = heights[((y - 1 + size) % size) * size + x];
      const dx = (xm - xp) * intensity;
      const dy = (ym - yp) * intensity;
      data[idx]     = Math.min(255, Math.max(0, (dx * 0.5 + 0.5) * 255));
      data[idx + 1] = Math.min(255, Math.max(0, (dy * 0.5 + 0.5) * 255));
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

function makeBrushedMetalNormalMap(key: string, size: number, intensity: number): THREE.DataTexture {
  const cached = texCache.get(key);
  if (cached) return cached;

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const rowNoise = hash2d(0, y) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const microNoise = (hash2d(x * 7, y * 13) * 2 - 1) * 0.3;
      const dx = (rowNoise + microNoise) * intensity;
      data[idx]     = Math.min(255, Math.max(0, (dx * 0.5 + 0.5) * 255));
      data[idx + 1] = 128;
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

function makeWoodGrainNormalMap(key: string, size: number, intensity: number): THREE.DataTexture {
  const cached = texCache.get(key);
  if (cached) return cached;

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const grain = Math.sin((y / size) * Math.PI * 40 + smoothNoise(x / size * 8, y / size * 2) * 6);
      const dx = (hash2d(x * 3, y * 5) * 2 - 1) * 0.15 * intensity;
      const dy = grain * intensity;
      data[idx]     = Math.min(255, Math.max(0, (dx * 0.5 + 0.5) * 255));
      data[idx + 1] = Math.min(255, Math.max(0, (dy * 0.5 + 0.5) * 255));
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

function makeStippleNormalMap(key: string, size: number, intensity: number): THREE.DataTexture {
  const cached = texCache.get(key);
  if (cached) return cached;

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const n1 = smoothNoise(x / size * 20, y / size * 20);
      const n2 = smoothNoise(x / size * 40 + 100, y / size * 40 + 100) * 0.5;
      const combined = (n1 + n2) * intensity;
      const dx = (hash2d(x + 1, y) - hash2d(x - 1, y)) * combined;
      const dy = (hash2d(x, y + 1) - hash2d(x, y - 1)) * combined;
      data[idx]     = Math.min(255, Math.max(0, (dx * 0.5 + 0.5) * 255));
      data[idx + 1] = Math.min(255, Math.max(0, (dy * 0.5 + 0.5) * 255));
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

// ─── Material definitions ───────────────────────────────────────────────────

interface MatDef {
  color: string;
  metalness: number;
  roughness: number;
  opacity?: number;
  transparent?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  normalMap?: () => THREE.DataTexture;
  normalScale?: number;
  envMapIntensity?: number;
}

const MATERIALS: Record<string, MatDef> = {
  // Structural — concrete
  Grey:          { color: "#9a9590", metalness: 0, roughness: 0.85,
                   normalMap: () => makeNoiseNormalMap("concrete-heavy", 256, 12, 1.8, 5), normalScale: 0.6 },
  White:         { color: "#e8e4df", metalness: 0, roughness: 0.75,
                   normalMap: () => makeNoiseNormalMap("concrete-light", 256, 10, 1.2, 4), normalScale: 0.4 },
  "White.003":   { color: "#e8e4df", metalness: 0, roughness: 0.75,
                   normalMap: () => makeNoiseNormalMap("concrete-light", 256, 10, 1.2, 4), normalScale: 0.4 },
  "1":           { color: "#d5d0c9", metalness: 0, roughness: 0.7,
                   normalMap: () => makeNoiseNormalMap("concrete-mid", 256, 8, 1.0, 4), normalScale: 0.35 },

  // Metal
  Alu:           { color: "#b8bcc4", metalness: 0.9, roughness: 0.25, envMapIntensity: 1.5,
                   normalMap: () => makeBrushedMetalNormalMap("brushed-alu", 256, 0.8), normalScale: 0.3 },
  "Plastic.001": { color: "#2d2d30", metalness: 0.7, roughness: 0.35 },

  // Pavement
  Black:         { color: "#2a2a2a", metalness: 0, roughness: 0.9,
                   normalMap: () => makeNoiseNormalMap("asphalt", 256, 16, 2.0, 5), normalScale: 0.5 },
  PlasticPav:    { color: "#5c5856", metalness: 0, roughness: 0.85,
                   normalMap: () => makeNoiseNormalMap("sidewalk", 256, 14, 1.5, 4), normalScale: 0.4 },

  // Glass
  Glass:         { color: "#c8dced", metalness: 0.15, roughness: 0.02,
                   opacity: 0.3, transparent: true, envMapIntensity: 2.0 },
  Glass2:        { color: "#a0c0d8", metalness: 0.15, roughness: 0.02,
                   opacity: 0.2, transparent: true, envMapIntensity: 2.0 },

  // Organic
  "Green.003":   { color: "#5a8a42", metalness: 0, roughness: 0.9,
                   normalMap: () => makeStippleNormalMap("grass", 256, 1.5), normalScale: 0.5 },
  Wood1:         { color: "#7a5030", metalness: 0, roughness: 0.45,
                   normalMap: () => makeWoodGrainNormalMap("walnut", 256, 0.9), normalScale: 0.4 },

  // Emissive
  Display:       { color: "#000000", metalness: 0, roughness: 0.3,
                   emissive: "#4aa0ff", emissiveIntensity: 2.0 },
  Lights:        { color: "#000000", metalness: 0, roughness: 0.3,
                   emissive: "#fff0d0", emissiveIntensity: 2.5 },
  "2.White.000": { color: "#000000", metalness: 0, roughness: 0.3,
                   emissive: "#60b0ff", emissiveIntensity: 1.5 },
  "2.White.005": { color: "#000000", metalness: 0, roughness: 0.3,
                   emissive: "#ff9040", emissiveIntensity: 2.0 },
};

const FALLBACK_MAT: MatDef = {
  color: "#404045", metalness: 0.5, roughness: 0.6,
};

// ─── BuildingModel ──────────────────────────────────────────────────────────

function BuildingModel({ path }: { path: string }) {
  const { scene } = useGLTF(path);

  useMemo(() => {
    const matCache = new Map<string, THREE.MeshStandardMaterial>();

    function buildMaterial(name: string, def: MatDef): THREE.MeshStandardMaterial {
      const cached = matCache.get(name);
      if (cached) return cached;

      const mat = new THREE.MeshStandardMaterial({
        color: def.color,
        metalness: def.metalness,
        roughness: def.roughness,
        opacity: def.opacity ?? 1,
        transparent: def.transparent ?? false,
        side: THREE.DoubleSide,
        name,
      });

      if (def.emissive) {
        mat.emissive = new THREE.Color(def.emissive);
        mat.emissiveIntensity = def.emissiveIntensity ?? 1;
      }
      if (def.envMapIntensity !== undefined) {
        mat.envMapIntensity = def.envMapIntensity;
      }
      if (def.normalMap) {
        mat.normalMap = def.normalMap();
        mat.normalScale = new THREE.Vector2(def.normalScale ?? 1, def.normalScale ?? 1);
      }

      matCache.set(name, mat);
      return mat;
    }

    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;

      const override = (mat: THREE.Material): THREE.Material => {
        const def = MATERIALS[mat.name];
        if (def) return buildMaterial(mat.name, def);
        if (!mat.name) return buildMaterial("__fallback", FALLBACK_MAT);
        return mat;
      };

      if (Array.isArray(child.material)) {
        child.material = child.material.map(override);
      } else {
        child.material = override(child.material);
      }
    });
  }, [scene]);

  return (
    <Center>
      <primitive object={scene} />
    </Center>
  );
}

export default function WelcomeHWView() {
  const [activeModel, setActiveModel] = useState<ModelName>("cycles");

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 60px)" }}>
      {/* Model switcher */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 40,
          display: "flex",
          gap: 8,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(226,232,244,0.9)",
          borderRadius: 12,
          padding: 6,
          boxShadow: "0 4px 16px rgba(12,21,38,0.07)",
        }}
      >
        {(Object.keys(MODEL_PATHS) as ModelName[]).map((key) => {
          const active = activeModel === key;
          return (
            <button
              key={key}
              onClick={() => setActiveModel(key)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid rgba(195,208,248,0.9)",
                background: active ? "#1B47D6" : "rgba(255,255,255,0.9)",
                color: active ? "#fff" : "#1B47D6",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {MODEL_LABELS[key]}
            </button>
          );
        })}
      </div>

      {/* Title badge */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 40,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(226,232,244,0.9)",
          borderRadius: 10,
          padding: "10px 18px",
          boxShadow: "0 4px 16px rgba(12,21,38,0.07)",
        }}
      >
        <p
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#1f1638",
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Welcome to HQ
        </p>
        <p style={{ fontSize: 11, color: "#7a7390", margin: "2px 0 0", fontWeight: 500 }}>
          3D Building Preview — {MODEL_LABELS[activeModel]}
        </p>
      </div>

      {/* Controls hint */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 40,
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(226,232,244,0.9)",
          borderRadius: 10,
          padding: "6px 16px",
          boxShadow: "0 4px 16px rgba(12,21,38,0.07)",
        }}
      >
        <p style={{ fontSize: 11, color: "#4D5E80", margin: 0, fontWeight: 500 }}>
          <span style={{ color: "#1B47D6", fontWeight: 700 }}>Controls:</span>{" "}
          Drag to orbit · Scroll to zoom · Right-drag to pan
        </p>
      </div>

      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [30, 20, 30], fov: 50 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        style={{ background: "#dce6f5" }}
      >
        <Sky sunPosition={[100, 60, 80]} />
        <Environment preset="city" resolution={256}>
          <Lightformer
            intensity={1.8}
            color="#fff6e5"
            position={[18, 18, 10]}
            rotation={[0, Math.PI / 3, 0]}
            scale={[18, 18, 1]}
          />
          <Lightformer
            intensity={1.25}
            color="#c7e4ff"
            position={[-16, 10, -12]}
            rotation={[0, -Math.PI / 4, 0]}
            scale={[14, 10, 1]}
          />
        </Environment>

        <ambientLight intensity={0.35} />
        <hemisphereLight args={["#dbeafe", "#b4c790", 0.5]} position={[0, 40, 0]} />
        <directionalLight
          position={[20, 50, 20]}
          intensity={2}
          castShadow
          shadow-bias={-0.00008}
          shadow-normalBias={0.02}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={120}
          shadow-camera-left={-50}
          shadow-camera-right={50}
          shadow-camera-top={60}
          shadow-camera-bottom={-20}
        />
        <directionalLight position={[-15, 30, -10]} intensity={0.5} color="#b8dcff" />

        {/* Ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#d4e6b5" />
        </mesh>

        <ContactShadows
          position={[0, 0.02, 0]}
          scale={40}
          blur={2.8}
          opacity={0.3}
          far={30}
          resolution={1024}
          color="#6b7ea5"
        />

        <Suspense fallback={<Loader />}>
          <BuildingModel key={activeModel} path={MODEL_PATHS[activeModel]} />
        </Suspense>

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          maxPolarAngle={Math.PI / 2.05}
          minDistance={5}
          maxDistance={100}
        />
      </Canvas>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

useGLTF.preload(MODEL_PATHS.cycles);
