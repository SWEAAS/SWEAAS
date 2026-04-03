import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  Sky,
} from "@react-three/drei";
import Building, {
  BUILDING_DEPTH,
  FLOOR_HEIGHT,
  type DepartmentFloor,
} from "./Building";
import Floor from "./Floor";
import AgentAvatar from "./AgentAvatar";
import AgentOffice from "./AgentOffice";
import CTOOffice from "./CTOOffice";
import Staircase from "./Staircase";
import DepartmentTV from "./DepartmentTV";
import CityBuildings from "./CityBuildings";
import FloatingPlatform from "./FloatingPlatform";
import ExplorationControls from "./controls/ExplorationControls";
import { useProjectStore } from "../store/projectStore";
import type { Agent } from "../store/agentStore";

// ─── Layout constants ────────────────────────────────────────────────────────

const PLATFORM_Y = 24;
const BUILDING_BASE_Y = PLATFORM_Y + 0.1;
const OFFICES_PER_ROW = 4;
const OFFICE_SPACING_X = 2.8;
const OFFICE_SPACING_Z = 3.2;

const ALL_DEPARTMENTS = [
  { dept: "engineering", color: "#dbeafe", glassColor: "#93c5fd", label: "Engineering" },
  { dept: "marketing",   color: "#fef3c7", glassColor: "#fcd34d", label: "Marketing"   },
  { dept: "product",     color: "#d1fae5", glassColor: "#6ee7b7", label: "Product"     },
  { dept: "support",     color: "#ede9fe", glassColor: "#c4b5fd", label: "Support"     },
] as const;

function officeGridPos(index: number, floorBaseY: number): [number, number, number] {
  const col = index % OFFICES_PER_ROW;
  const row = Math.floor(index / OFFICES_PER_ROW);
  return [
    -4.2 + col * OFFICE_SPACING_X,
    floorBaseY + 0.05,
    -1.5 + row * OFFICE_SPACING_Z,
  ];
}

const SEAT_ROOT_Y = (fi: number) => fi * FLOOR_HEIGHT - 0.415;

// ─── Props ───────────────────────────────────────────────────────────────────

interface HQSceneProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
  cameraMode: "overview" | "walkthrough";
}

// ─── Scene ───────────────────────────────────────────────────────────────────

export default function HQScene({
  agents,
  onAgentClick,
  cameraMode,
}: HQSceneProps) {
  const companyName =
    useProjectStore((s) => s.currentProject?.name) ?? "SWEAAS HQ";

  const ctoAgent = useMemo(
    () => agents.find((agent) => agent.role === "cto") ?? null,
    [agents],
  );

  const orgFloorAgents = useMemo(
    () => (ctoAgent ? agents.filter((agent) => agent.agent_id !== ctoAgent.agent_id) : agents),
    [agents, ctoAgent],
  );

  const departmentData = useMemo(() => {
    const byDept = new Map<string, Agent[]>();
    for (const a of orgFloorAgents) {
      const list = byDept.get(a.department) ?? [];
      list.push(a);
      byDept.set(a.department, list);
    }

    const floors: { meta: typeof ALL_DEPARTMENTS[number]; agents: Agent[] }[] = [];
    for (const meta of ALL_DEPARTMENTS) {
      const deptAgents = byDept.get(meta.dept) ?? [];
      if (deptAgents.length > 0) {
        floors.push({ meta, agents: deptAgents });
      }
    }
    return floors;
  }, [orgFloorAgents]);

  const buildingDepts: DepartmentFloor[] = [
    ...departmentData.map((d) => ({
      dept: d.meta.dept,
      agentCount: d.agents.length,
      color: d.meta.color,
      glassColor: d.meta.glassColor,
      label: d.meta.label,
    })),
    ...(ctoAgent
      ? [
          {
            dept: "executive",
            agentCount: 1,
            color: "#dbeafe",
            glassColor: "#60a5fa",
            label: "Executive",
          },
        ]
      : []),
  ];

  const floorCount = departmentData.length;
  const executiveFloorIndex = ctoAgent ? departmentData.length : -1;
  const totalFloorCount = buildingDepts.length;
  const walkthroughStart: [number, number, number] = [
    0,
    BUILDING_BASE_Y + 1.7,
    9,
  ];
  const cameraPosition: [number, number, number] =
    cameraMode === "walkthrough" ? walkthroughStart : [45, 40, 45];

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: cameraPosition, fov: cameraMode === "walkthrough" ? 70 : 50 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
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
        <Lightformer
          intensity={0.9}
          color="#9fd0ff"
          position={[0, 28, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[40, 40, 1]}
        />
      </Environment>

      <ambientLight intensity={0.28} />
      <hemisphereLight
        args={["#dbeafe", "#b4c790", 0.55]}
        position={[0, 40, 0]}
      />
      <directionalLight
        position={[20, 50, 20]}
        intensity={1.9}
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
      <directionalLight position={[-15, 30, -10]} intensity={0.45} color="#b8dcff" />
      <spotLight
        position={[0, BUILDING_BASE_Y + totalFloorCount * FLOOR_HEIGHT + 10, 8]}
        angle={0.48}
        penumbra={0.8}
        intensity={45}
        distance={70}
        decay={2}
        color="#fff1d6"
        castShadow
      />

      {/* ── Ground plane ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#d4e6b5" />
      </mesh>

      {/* ── City buildings at ground level ── */}
      <CityBuildings />

      {/* ── Floating platform ── */}
      <FloatingPlatform position={[0, PLATFORM_Y, 0]} />

      <ContactShadows
        position={[0, BUILDING_BASE_Y + 0.02, 0]}
        scale={22}
        blur={2.8}
        opacity={0.28}
        far={24}
        resolution={1024}
        color="#6b7ea5"
      />

      {/* ── HQ building + offices (all local to BUILDING_BASE_Y) ── */}
      <group position={[0, BUILDING_BASE_Y, 0]}>
        <Building departments={buildingDepts} companyName={companyName} />

        <Staircase floorCount={totalFloorCount} />

        {departmentData.map(({ meta, agents: deptAgents }, fi) => {
          const yBase = fi * FLOOR_HEIGHT;

          return (
            <group key={meta.dept}>
              <Floor position={[0, yBase, 0]} color={meta.color} />

              {deptAgents.length > 0 && (
                <DepartmentTV
                  position={[-1.5, yBase + 2.2, -(BUILDING_DEPTH / 2 - 0.18)]}
                  rotationY={0}
                  agents={deptAgents}
                  label={meta.label}
                />
              )}

              {deptAgents.map((agent, j) => {
                const offPos = officeGridPos(j, yBase);
                return (
                  <group key={agent.agent_id}>
                    <AgentOffice
                      agent={agent}
                      position={offPos}
                      onClick={() => onAgentClick(agent)}
                    />
                    <AgentAvatar
                      agent={agent}
                      position={[offPos[0], yBase, offPos[2] + 0.4]}
                      agentIndex={j}
                      numInDept={deptAgents.length}
                      floorIndex={fi}
                      forceSeated
                      onClick={() => onAgentClick(agent)}
                    />
                  </group>
                );
              })}
            </group>
          );
        })}

        {ctoAgent && (
          <group key={ctoAgent.agent_id}>
            <Floor position={[0, executiveFloorIndex * FLOOR_HEIGHT, 0]} color="#dbeafe" />
            <CTOOffice
              agent={ctoAgent}
              position={[0, executiveFloorIndex * FLOOR_HEIGHT + 0.03, 0]}
              onClick={() => onAgentClick(ctoAgent)}
            />
            <AgentAvatar
              agent={ctoAgent}
              position={[0, executiveFloorIndex * FLOOR_HEIGHT, 0.95]}
              agentIndex={0}
              numInDept={1}
              floorIndex={executiveFloorIndex}
              forceSeated
              onClick={() => onAgentClick(ctoAgent)}
            />
          </group>
        )}
      </group>

      <ExplorationControls
        mode={cameraMode}
        walkthroughStart={walkthroughStart}
        minY={BUILDING_BASE_Y + 1.5}
        maxY={BUILDING_BASE_Y + totalFloorCount * FLOOR_HEIGHT + 2}
      />
      {cameraMode === "overview" && (
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          maxPolarAngle={Math.PI / 2.1}
          minDistance={8}
          maxDistance={100}
        />
      )}
    </Canvas>
  );
}
