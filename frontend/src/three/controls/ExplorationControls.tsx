import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const MOVE_SPEED = 0.15;
const keys: Record<string, boolean> = {};

export default function ExplorationControls() {
  const { camera } = useThree();
  const direction = useRef(new THREE.Vector3());

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

  useFrame(() => {
    direction.current.set(0, 0, 0);

    if (keys["w"] || keys["arrowup"]) direction.current.z -= 1;
    if (keys["s"] || keys["arrowdown"]) direction.current.z += 1;
    if (keys["a"] || keys["arrowleft"]) direction.current.x -= 1;
    if (keys["d"] || keys["arrowright"]) direction.current.x += 1;
    if (keys["q"]) direction.current.y += 1;
    if (keys["e"]) direction.current.y -= 1;

    if (direction.current.length() > 0) {
      direction.current.normalize().multiplyScalar(MOVE_SPEED);
      camera.position.add(direction.current);
    }
  });

  return null;
}
