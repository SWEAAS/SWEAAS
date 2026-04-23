/**
 * Canvas wrapper around WelcomeHWScene. Owns the ACES tone mapping, DPR,
 * and shadow settings so the inner scene stays purely declarative.
 */
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import WelcomeHWScene from "./WelcomeHWScene";
import type { Agent } from "../store/agentStore";

interface WelcomeHWCanvasProps {
  agents?: Agent[];
  onAgentClick?: (agent: Agent) => void;
  cameraMode?: "overview" | "walkthrough";
  autoRotate?: boolean;
}

export default function WelcomeHWCanvas({
  agents,
  onAgentClick,
  cameraMode = "overview",
  autoRotate = false,
}: WelcomeHWCanvasProps) {
  // Walkthrough drops the user just inside the HQ at eye height; overview
  // sits above the campus so the U-shape, trees, and surrounding paths are
  // all in frame. The previous overview preset (y=135, target z=40) pointed
  // the camera past the building and produced a near-blank sky render —
  // this version frames the main building at a sensible distance.
  const cameraPosition: [number, number, number] =
    cameraMode === "walkthrough" ? [0, 1.7, 25] : [0, 55, 130];
  const cameraFov = cameraMode === "walkthrough" ? 70 : 50;

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: cameraPosition, fov: cameraFov }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      shadows={{ type: THREE.PCFSoftShadowMap }}
      style={{ background: "#c8e0f0" }}
    >
      <WelcomeHWScene
        agents={agents}
        onAgentClick={onAgentClick}
        cameraMode={cameraMode}
        autoRotate={autoRotate}
      />
    </Canvas>
  );
}
