/**
 * Shared GLB loader + clone helper for seated office workers.
 *
 * In v1 the Ellie GLB (CTO hero) and Worker GLB (rank-and-file) have not
 * been exported yet. Callers (AgentAvatar) probe each asset's availability
 * and fall back to the procedural seated figure when the probe reports
 * missing — which is the default ship state until the user runs the
 * Blender export scripts (see scripts/blender/README.md).
 *
 * When the GLBs land at the documented paths, availability flips via a
 * module-scoped listener and AgentAvatar swaps to the GLB render path.
 * Cloning uses THREE.SkeletonUtils.clone — NOT InstancedMesh — because
 * InstancedMesh does not support skinning.
 */
import { useSyncExternalStore } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export const ELLIE_MODEL_URL = "/models/characters/ellie-seated.glb";
export const WORKER_MODEL_URL = "/models/characters/worker-seated.glb";

type Status = "unknown" | "ok" | "missing";
const assetStatus = new Map<string, Status>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

async function probe(url: string): Promise<boolean> {
  const cached = assetStatus.get(url);
  if (cached === "ok") return true;
  if (cached === "missing") return false;
  try {
    const res = await fetch(url, { method: "HEAD" });
    // Vite dev (and most SPA hosts) return 200 + index.html for any unknown
    // path — the SPA fallback. A real GLB must NOT be HTML; if the response
    // looks like HTML we treat the asset as missing so useGLTF never tries
    // to parse `<!doctype html>` as a glTF binary.
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const looksLikeHtml = contentType.includes("text/html");
    const status: Status = res.ok && !looksLikeHtml ? "ok" : "missing";
    assetStatus.set(url, status);
    notify();
    return status === "ok";
  } catch {
    assetStatus.set(url, "missing");
    notify();
    return false;
  }
}

if (typeof window !== "undefined") {
  void probe(ELLIE_MODEL_URL);
  void probe(WORKER_MODEL_URL);
}

export function hasWorkerAsset(url: string): boolean {
  return assetStatus.get(url) === "ok";
}

/**
 * React hook that returns true once the asset's HEAD probe has resolved
 * with a 2xx. Re-renders the component when availability flips.
 */
export function useWorkerAssetAvailable(url: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => hasWorkerAsset(url),
    () => false,
  );
}

export function cloneWorkerScene(source: THREE.Object3D): THREE.Object3D {
  return cloneSkeleton(source);
}

export interface WorkerVariation {
  skinTint: THREE.Color;
  shirtColor: THREE.Color;
  hairColor: THREE.Color;
  pantsColor: THREE.Color;
}

const SKIN_TONES = ["#f5c5a3", "#e8b894", "#d4956a", "#c68642", "#a8703f", "#8d5524"];
const HAIR_COLORS = ["#2c1b0e", "#1a1a1a", "#8b5e3c", "#4a3728", "#c8a96e", "#6b4020"];
const DEPT_SHIRT: Record<string, string> = {
  engineering: "#3b82f6",
  marketing: "#f59e0b",
  product: "#10b981",
  support: "#9233ea",
};
const DEPT_PANTS: Record<string, string> = {
  engineering: "#1e3a8a",
  marketing: "#7c2d12",
  product: "#065f46",
  support: "#4c1d95",
};

export function variationFromAgent(agentId: string, department: string): WorkerVariation {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  const absHash = Math.abs(hash);
  return {
    skinTint: new THREE.Color(SKIN_TONES[absHash % SKIN_TONES.length]),
    hairColor: new THREE.Color(HAIR_COLORS[(absHash >> 3) % HAIR_COLORS.length]),
    shirtColor: new THREE.Color(DEPT_SHIRT[department] ?? "#64748b"),
    pantsColor: new THREE.Color(DEPT_PANTS[department] ?? "#334155"),
  };
}

/**
 * Load a GLTF that is known to exist. Only call this when the probe has
 * already reported the asset as OK; otherwise useGLTF will suspend forever
 * on a 404.
 */
export function useWorkerGLTF(url: string) {
  return useGLTF(url);
}
