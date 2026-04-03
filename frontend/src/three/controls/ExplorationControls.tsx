import { useEffect, useMemo, useRef } from "react";
import { PointerLockControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const WALK_SPEED = 6;
const VERTICAL_SPEED = 4;
const keys: Record<string, boolean> = {};

interface ExplorationControlsProps {
  mode?: "overview" | "walkthrough";
  walkthroughStart?: [number, number, number];
  minY?: number;
  maxY?: number;
}

export default function ExplorationControls({
  mode = "overview",
  walkthroughStart = [0, 1.7, 9],
  minY = -Infinity,
  maxY = Infinity,
}: ExplorationControlsProps) {
  const { camera } = useThree();
  const move = useRef(new THREE.Vector3());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  const walkthroughStartVec = useMemo(
    () => new THREE.Vector3(...walkthroughStart),
    [walkthroughStart],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (mode !== "walkthrough") {
      return;
    }

    camera.position.copy(walkthroughStartVec);
    camera.lookAt(0, walkthroughStartVec.y, 0);
  }, [camera, mode, walkthroughStartVec]);

  useFrame((_, delta) => {
    if (mode !== "walkthrough") {
      return;
    }

    move.current.set(0, 0, 0);
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;

    if (forward.current.lengthSq() > 0) {
      forward.current.normalize();
    }

    right.current.crossVectors(forward.current, camera.up).normalize();

    if (keys["w"] || keys["arrowup"]) move.current.add(forward.current);
    if (keys["s"] || keys["arrowdown"]) move.current.sub(forward.current);
    if (keys["d"] || keys["arrowright"]) move.current.add(right.current);
    if (keys["a"] || keys["arrowleft"]) move.current.sub(right.current);

    if (move.current.lengthSq() > 0) {
      move.current.normalize().multiplyScalar(WALK_SPEED * delta);
      camera.position.add(move.current);
    }

    if (keys["q"]) camera.position.y += VERTICAL_SPEED * delta;
    if (keys["e"]) camera.position.y -= VERTICAL_SPEED * delta;

    camera.position.y = THREE.MathUtils.clamp(camera.position.y, minY, maxY);
  });

  if (mode !== "walkthrough") {
    return null;
  }

  return <PointerLockControls />;
}
