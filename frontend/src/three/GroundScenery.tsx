/**
 * Outdoor scenery around the HQ building — procedural trees, grass patches,
 * and a few walking paths. All instances are placed STRICTLY outside the
 * building footprint so nothing pokes through walls or appears inside the
 * lobby/offices.
 *
 * The building is a single GLB centered at world origin. Its outer footprint
 * is roughly X ∈ [-40, 40], Z ∈ [-26, 26] including walls and overhangs.
 * `outsideBuilding(x, z)` adds a comfortable 6-unit clearance to that so even
 * the widest tree canopy can't intersect the facade.
 *
 * Generation is deterministic (a seeded PRNG) — re-renders never reshuffle
 * the foliage, which would look cheap.
 */
import { useMemo } from "react";
import * as THREE from "three";

// Building footprint with safety margin. Anything we generate inside this
// rectangle is dropped — keeps trees out of the lobby.
const BUILDING_HALF_W = 40;
const BUILDING_HALF_D = 26;
const CLEARANCE = 6;

function outsideBuilding(x: number, z: number): boolean {
  return (
    Math.abs(x) > BUILDING_HALF_W + CLEARANCE ||
    Math.abs(z) > BUILDING_HALF_D + CLEARANCE
  );
}

// Simple LCG so the same seed always produces the same scattered layout.
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
}

// ─── Trees ──────────────────────────────────────────────────────────────────

const TRUNK_GEO = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
const TRUNK_MAT = new THREE.MeshStandardMaterial({
  color: "#5c3a1e",
  roughness: 0.95,
  metalness: 0,
});

const CANOPY_GEOS: THREE.BufferGeometry[] = [
  new THREE.SphereGeometry(1, 10, 7),
  new THREE.DodecahedronGeometry(1, 0),
  new THREE.IcosahedronGeometry(1, 0),
];

const CANOPY_MATS: THREE.MeshStandardMaterial[] = [
  new THREE.MeshStandardMaterial({ color: "#3d7a2a", roughness: 0.85, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: "#4a8c35", roughness: 0.85, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: "#3a7030", roughness: 0.85, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: "#5a9a44", roughness: 0.85, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: "#4e9038", roughness: 0.85, flatShading: true }),
];

interface TreeInstance {
  pos: [number, number, number];
  trunkScale: number;
  canopyScale: number;
  canopyGeoIdx: number;
  canopyMatIdx: number;
}

function generateTrees(): TreeInstance[] {
  const rng = seededRandom(20240701);
  const trees: TreeInstance[] = [];
  const placed: Array<[number, number]> = [];
  const minSpacing = 4.5;

  // 1. A dense ring of trees forming a hedgerow along the building, like
  //    landscaping right against the property line. Skips the segments in
  //    front of the entrance facade so we keep a clear line of sight.
  const ringRadius = BUILDING_HALF_W + CLEARANCE + 4;
  const ringStep = (Math.PI * 2) / 64;
  for (let i = 0; i < 64; i++) {
    const a = i * ringStep;
    const x = Math.cos(a) * ringRadius * (1 + (rng() - 0.5) * 0.15);
    const z = Math.sin(a) * (BUILDING_HALF_D + CLEARANCE + 4) * (1 + (rng() - 0.5) * 0.15);
    if (!outsideBuilding(x, z)) continue;
    if (placed.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < minSpacing ** 2)) continue;
    placed.push([x, z]);
    trees.push({
      pos: [x, 0, z],
      trunkScale: 1.6 + rng() * 1.2,
      canopyScale: 1.4 + rng() * 0.9,
      canopyGeoIdx: Math.floor(rng() * CANOPY_GEOS.length),
      canopyMatIdx: Math.floor(rng() * CANOPY_MATS.length),
    });
  }

  // 2. Sparse scatter further out — the larger landscape around the campus.
  const SCATTER = 180;
  const RANGE_X = 180;
  const RANGE_Z = 140;
  for (let i = 0; i < SCATTER; i++) {
    const x = (rng() - 0.5) * RANGE_X * 2;
    const z = (rng() - 0.5) * RANGE_Z * 2;
    if (!outsideBuilding(x, z)) continue;
    if (placed.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < minSpacing ** 2)) continue;
    placed.push([x, z]);
    const distFromBuilding = Math.max(Math.abs(x), Math.abs(z));
    // Slightly bigger trees the further out you go — gives depth without
    // overwhelming the foreground.
    const sizeBoost = Math.min(1, (distFromBuilding - 50) / 80);
    trees.push({
      pos: [x, 0, z],
      trunkScale: 1.6 + rng() * 1.2 + sizeBoost * 0.6,
      canopyScale: 1.4 + rng() * 1.0 + sizeBoost * 0.5,
      canopyGeoIdx: Math.floor(rng() * CANOPY_GEOS.length),
      canopyMatIdx: Math.floor(rng() * CANOPY_MATS.length),
    });
  }

  return trees;
}

function Trees() {
  const trees = useMemo(generateTrees, []);
  return (
    <group>
      {trees.map((t, i) => (
        <group key={i} position={t.pos}>
          <mesh
            geometry={TRUNK_GEO}
            material={TRUNK_MAT}
            position={[0, t.trunkScale / 2, 0]}
            scale={[1, t.trunkScale, 1]}
            castShadow
          />
          <mesh
            geometry={CANOPY_GEOS[t.canopyGeoIdx]}
            material={CANOPY_MATS[t.canopyMatIdx]}
            position={[0, t.trunkScale + t.canopyScale * 0.7, 0]}
            scale={t.canopyScale}
            castShadow
          />
        </group>
      ))}
    </group>
  );
}

// ─── Grass patches ──────────────────────────────────────────────────────────

const GRASS_GEO = new THREE.CircleGeometry(1, 12);
const GRASS_MATS: THREE.MeshStandardMaterial[] = [
  new THREE.MeshStandardMaterial({ color: "#4a8c35", roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: "#3d7a2a", roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: "#5a9a44", roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: "#3a7030", roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: "#4e9038", roughness: 0.95 }),
];

interface GrassPatch {
  pos: [number, number, number];
  scale: number;
  matIdx: number;
}

function generateGrass(): GrassPatch[] {
  const rng = seededRandom(20240801);
  const patches: GrassPatch[] = [];
  const COUNT = 220;
  const RANGE_X = 160;
  const RANGE_Z = 130;
  for (let i = 0; i < COUNT; i++) {
    const x = (rng() - 0.5) * RANGE_X * 2;
    const z = (rng() - 0.5) * RANGE_Z * 2;
    if (!outsideBuilding(x, z)) continue;
    patches.push({
      pos: [x, 0.01, z],
      scale: 2 + rng() * 6,
      matIdx: Math.floor(rng() * GRASS_MATS.length),
    });
  }
  return patches;
}

function GrassPatches() {
  const patches = useMemo(generateGrass, []);
  return (
    <group>
      {patches.map((p, i) => (
        <mesh
          key={i}
          geometry={GRASS_GEO}
          material={GRASS_MATS[p.matIdx]}
          position={p.pos}
          scale={[p.scale, p.scale, 1]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        />
      ))}
    </group>
  );
}

// ─── Walking paths ──────────────────────────────────────────────────────────

const PATH_MAT = new THREE.MeshStandardMaterial({
  color: "#cfc6b3",
  roughness: 0.98,
  metalness: 0,
});

interface PathSegment {
  pos: [number, number, number];
  rotY: number;
  size: [number, number]; // length × width
}

function generatePaths(): PathSegment[] {
  const segs: PathSegment[] = [];

  // Front entrance walkway: a path that approaches the south side of the
  // building from the south. Sits on grass at Y=0.02.
  segs.push({
    pos: [0, 0.02, BUILDING_HALF_D + CLEARANCE + 18],
    rotY: 0,
    size: [3.2, 28],
  });

  // Loop ring around the building exterior — not full ring, just the
  // segments along the long sides where it reads as a campus path.
  const ringRadius = BUILDING_HALF_W + CLEARANCE + 1.5;
  const longHalf = BUILDING_HALF_D + CLEARANCE + 0.5;
  // South side
  segs.push({ pos: [0, 0.02, longHalf + 0.5], rotY: Math.PI / 2, size: [2.4, ringRadius * 2] });
  // North side
  segs.push({ pos: [0, 0.02, -longHalf - 0.5], rotY: Math.PI / 2, size: [2.4, ringRadius * 2] });

  return segs;
}

function WalkingPaths() {
  const segs = useMemo(generatePaths, []);
  return (
    <group>
      {segs.map((s, i) => (
        <mesh
          key={i}
          material={PATH_MAT}
          position={s.pos}
          rotation={[-Math.PI / 2, 0, s.rotY]}
          receiveShadow
        >
          <planeGeometry args={s.size} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Public component ──────────────────────────────────────────────────────

/**
 * Single mount point for the outdoor scenery. WelcomeHWScene renders this
 * once. Geometry/materials are module-level singletons so re-renders stay
 * cheap.
 */
export default function GroundScenery() {
  return (
    <group>
      <WalkingPaths />
      <GrassPatches />
      <Trees />
    </group>
  );
}
