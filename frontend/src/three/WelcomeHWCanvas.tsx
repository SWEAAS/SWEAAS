/**
 * Canvas wrapper around WelcomeHWScene. Owns ACES tone mapping, DPR, and
 * shadow settings so the inner scene stays purely declarative.
 *
 * On mount the camera is positioned for a wide interior overview; the
 * CameraStepper then transitions it to the first room stop. Both modes —
 * Stepper and Overview — use the same CameraControls instance in the scene,
 * so no camera swap happens when the parent toggles mode.
 */
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import WelcomeHWScene from "./WelcomeHWScene";
import type { Agent } from "../store/agentStore";
import type { DeskAssignment, Stop } from "./tourStops";

interface WelcomeHWCanvasProps {
  agents?: Agent[];
  assignments: DeskAssignment[];
  stops: Stop[];
  stopIndex: number;
  stepperActive: boolean;
  onAgentClick?: (agent: Agent) => void;
}

// Stable references — moving these out of render avoids triggering Canvas
// remounts whenever the parent re-renders (Canvas treats `gl`, `camera`,
// `shadows` as identity-stable and re-runs the renderer setup on change).
const CAMERA_INIT = { position: [38, 28, 38] as [number, number, number], fov: 42 };
const GL_INIT = {
  antialias: true,
  alpha: false,
  powerPreference: "high-performance" as const,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.05,
};
const SHADOW_INIT = { type: THREE.PCFSoftShadowMap };
const DPR_RANGE: [number, number] = [1, 1.75];
const CANVAS_STYLE = { background: "#c8e0f0" };

export default function WelcomeHWCanvas({
  assignments,
  stops,
  stopIndex,
  stepperActive,
  onAgentClick,
}: WelcomeHWCanvasProps) {
  return (
    <Canvas
      dpr={DPR_RANGE}
      camera={CAMERA_INIT}
      gl={GL_INIT}
      shadows={SHADOW_INIT}
      style={CANVAS_STYLE}
    >
      <WelcomeHWScene
        assignments={assignments}
        stops={stops}
        stopIndex={stopIndex}
        stepperActive={stepperActive}
        onAgentClick={onAgentClick}
      />
    </Canvas>
  );
}
