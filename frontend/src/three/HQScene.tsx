import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Sky } from "@react-three/drei";
import Building from "./Building";
import Floor from "./Floor";
import AgentAvatar from "./AgentAvatar";
import Staircase from "./Staircase";
import ExplorationControls from "./controls/ExplorationControls";
import { useProjectStore } from "../store/projectStore";
import type { Agent } from "../store/agentStore";

// ─── Layout constants ────────────────────────────────────────────────────────

/** x positions of the 4 desk columns (matches Building Workstation positions). */
const DESK_X = [-3.5, -1.5, 0.5, 2.5] as const;
/** z positions per desk row (back to front, matches Building DESK_ROW_Z). */
const DESK_ROW_Z = [-0.8, -2.6, -3.5] as const;
/** Maximum agents that fit inside (3 rows × 4 desks). */
const MAX_INSIDE = 12;

// Root Y so hips (root+0.88) rest on chair seat top (fi*4 + 0.465)
const SEAT_ROOT_Y = (fi: number) => fi * 4 - 0.415;

// Root Y for standing on the floor surface (fi*4 + 0.025)
const STAND_ROOT_Y = (fi: number) => fi * 4 + 0.025;

function engDeskPos(idx: number, fi: number): [number, number, number] {
  const col = idx % 4;
  const row = Math.floor(idx / 4);
  const deskZ = DESK_ROW_Z[Math.min(row, 2)];
  // Chair seat is at z+0.52 within the workstation group; character sits there
  return [DESK_X[col], SEAT_ROOT_Y(fi), deskZ + 0.52];
}

function outsidePos(idx: number): [number, number, number] {
  const col = idx % 3;
  const row = Math.floor(idx / 3);
  return [-9 + col * 2.5, STAND_ROOT_Y(0), 2 - row * 3];
}

// ─── Floor definitions ───────────────────────────────────────────────────────

const FLOORS = [
  { dept: "engineering", color: "#dbeafe" },
  { dept: "marketing",   color: "#fef3c7" },
  { dept: "product",     color: "#d1fae5" },
] as const;

// ─── Props ───────────────────────────────────────────────────────────────────

interface HQSceneProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
}

// ─── Scene ───────────────────────────────────────────────────────────────────

export default function HQScene({ agents, onAgentClick }: HQSceneProps) {
  const companyName =
    useProjectStore((s) => s.currentProject?.name) ?? "SWEAAS HQ";

  const engineeringAgents = agents.filter((a) => a.department === "engineering");
  const marketingAgents   = agents.filter((a) => a.department === "marketing");
  const productAgents     = agents.filter((a) => a.department === "product");

  // Engineering desk rows needed (1–3 inside, overflow → outside)
  const insideEngAgents   = engineeringAgents.slice(0, MAX_INSIDE);
  const outsideEngAgents  = engineeringAgents.slice(MAX_INSIDE);
  const engDeskRows       = Math.max(1, Math.min(3, Math.ceil(insideEngAgents.length / 4)));
  const mktDeskRows       = Math.max(1, Math.min(3, Math.ceil(marketingAgents.length / 4)));
  const prodDeskRows      = Math.max(1, Math.min(3, Math.ceil(productAgents.length / 4)));

  return (
    <Canvas
      camera={{ position: [15, 12, 15], fov: 50 }}
      shadows
      style={{ background: "#e8f0fe" }}
    >
      <Sky sunPosition={[100, 50, 100]} />
      <Environment preset="city" />

      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />

      {/* Green grass ground */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
      >
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#d4e6b5" />
      </mesh>

      {/* Building */}
      <Building
        engDeskRows={engDeskRows}
        mktDeskRows={mktDeskRows}
        prodDeskRows={prodDeskRows}
        companyName={companyName}
      />

      {/* Internal staircase */}
      <Staircase />

      {/* ── Floors + agents ── */}
      {FLOORS.map((f, fi) => {
        const yBase = fi * 4;
        const deptAgents =
          f.dept === "engineering" ? insideEngAgents
          : f.dept === "marketing"   ? marketingAgents
          : productAgents;

        return (
          <group key={fi}>
            <Floor position={[0, yBase, 0]} color={f.color} />

            {deptAgents.map((agent, j) => {
              // Engineering: static desk seat position (AgentAvatar will seat them)
              // Marketing/product: initial spawn position (overridden every frame by path)
              const pos: [number, number, number] =
                f.dept === "engineering"
                  ? engDeskPos(j, fi)
                  : f.dept === "marketing"
                    ? [-3.0, STAND_ROOT_Y(fi), 0.5]  // path overrides each frame
                    : [2.5,  STAND_ROOT_Y(fi), 1.5]; // path overrides each frame

              return (
                <AgentAvatar
                  key={agent.agent_id}
                  agent={agent}
                  position={pos}
                  agentIndex={j}
                  numInDept={deptAgents.length}
                  floorIndex={fi}
                  onClick={() => onAgentClick(agent)}
                />
              );
            })}
          </group>
        );
      })}

      {/* ── Overflow engineering agents (outside building) ── */}
      {outsideEngAgents.map((agent, j) => (
        <AgentAvatar
          key={agent.agent_id}
          agent={agent}
          position={outsidePos(j)}
          agentIndex={insideEngAgents.length + j}
          numInDept={engineeringAgents.length}
          floorIndex={0}
          onClick={() => onAgentClick(agent)}
        />
      ))}

      <ExplorationControls />
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        maxPolarAngle={Math.PI / 2.1}
        minDistance={5}
        maxDistance={50}
      />
    </Canvas>
  );
}
