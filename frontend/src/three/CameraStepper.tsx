/**
 * Declarative room-by-room camera stepper.
 *
 * Thin wrapper around drei's <CameraControls> (which in turn wraps yomotsu's
 * camera-controls). The parent owns the active stop index; this component
 * translates stop changes into `fitToBox` (room) or `setLookAt` (person)
 * calls with smooth damping.
 *
 * A single CameraControls instance drives both Stepper and Overview modes:
 * users can always grab and drag; the stepper just posts transitions on top.
 *
 * Design note: we import CameraControls from drei so we get the R3F-idiomatic
 * <primitive>-less JSX form. The underlying class is the yomotsu one.
 */
import { useEffect, useMemo, useRef } from "react";
import { CameraControls } from "@react-three/drei";
import type CameraControlsLib from "camera-controls";
import {
  DESK_ANCHORS,
  HOT_DESK_ANCHORS,
  ROOMS,
  type Stop,
  type DeskAssignment,
} from "./tourStops";

interface CameraStepperProps {
  /** The full stop list from buildStops(). */
  stops: Stop[];
  /** Current stop index. The stepper watches this and transitions on change. */
  currentIndex: number;
  /** Current agent→desk assignments (to resolve person stops → world pos). */
  assignments: DeskAssignment[];
  /** When false the controls still work but ignore stop-driven transitions
   *  (Overview mode). */
  active: boolean;
}

const PERSON_OFFSET_X = 3.0;
const PERSON_OFFSET_Y = 2.1;
const PERSON_OFFSET_Z = 3.0;

function anchorById(id: string) {
  return (
    DESK_ANCHORS.find((a) => a.id === id) ??
    HOT_DESK_ANCHORS.find((a) => a.id === id) ??
    null
  );
}

function framePerson(
  controls: CameraControlsLib,
  anchorPos: [number, number, number],
  rotationY: number,
) {
  // Sit the camera in front of the worker at 3/4 angle so we see their face,
  // not the back of the monitor. `rotationY` describes which way the worker
  // faces: worker's forward vector = (sin ry, 0, cos ry) pointing from desk
  // toward where they look. We want the camera on the OPPOSITE side — in
  // front of the worker.
  const forwardX = Math.sin(rotationY);
  const forwardZ = Math.cos(rotationY);
  // Camera sits "in front of" the worker (from the worker's POV), shifted
  // to the right so we see a 3/4 face.
  const camX = anchorPos[0] - forwardX * PERSON_OFFSET_Z + forwardZ * PERSON_OFFSET_X;
  const camY = anchorPos[1] + PERSON_OFFSET_Y;
  const camZ = anchorPos[2] - forwardZ * PERSON_OFFSET_Z - forwardX * PERSON_OFFSET_X;
  const lookX = anchorPos[0];
  const lookY = anchorPos[1] + 1.3;
  const lookZ = anchorPos[2];
  void controls.setLookAt(camX, camY, camZ, lookX, lookY, lookZ, true);
}

export default function CameraStepper({
  stops,
  currentIndex,
  assignments,
  active,
}: CameraStepperProps) {
  const ref = useRef<CameraControlsLib | null>(null);

  const assignmentByAgent = useMemo(() => {
    const map = new Map<string, DeskAssignment>();
    for (const a of assignments) map.set(a.agent.agent_id, a);
    return map;
  }, [assignments]);

  useEffect(() => {
    const controls = ref.current;
    if (!controls || !active) return;
    const stop = stops[currentIndex];
    if (!stop) return;

    if (stop.kind === "room") {
      // Use the room's hand-authored camera offset rather than fitToBox.
      // fitToBox is fragile inside a building with columns and a low roof:
      // it routinely puts the camera through a wall or above the ceiling
      // because it's only trying to satisfy padding on the bounding box.
      const room = ROOMS[stop.roomId];
      const { min, max } = room.bounds;
      const cx = (min[0] + max[0]) / 2;
      const cy = (min[1] + max[1]) / 2;
      const cz = (min[2] + max[2]) / 2;
      const [ox, oy, oz] = room.cameraOffset;
      const [lx, ly, lz] = room.lookAtOffset;
      void controls.setLookAt(
        cx + ox, cy + oy, cz + oz,
        cx + lx, cy + ly, cz + lz,
        true,
      );
      return;
    }

    // Person stop
    const anchor = anchorById(stop.anchorId);
    if (!anchor) return;
    framePerson(ref.current!, anchor.position, anchor.rotationY);
  }, [currentIndex, stops, assignmentByAgent, active]);

  return (
    <CameraControls
      ref={(instance) => {
        ref.current = instance as CameraControlsLib | null;
      }}
      makeDefault
      smoothTime={0.55}
      draggingSmoothTime={0.12}
      minDistance={3}
      maxDistance={220}
      polarRotateSpeed={0.6}
      azimuthRotateSpeed={0.6}
      dollySpeed={0.8}
      truckSpeed={1.2}
    />
  );
}
