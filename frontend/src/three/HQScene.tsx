import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Sky, Text } from "@react-three/drei";
import Building from "./Building";
import Floor from "./Floor";
import AgentAvatar from "./AgentAvatar";
import ExplorationControls from "./controls/ExplorationControls";
import type { Agent } from "../store/agentStore";

interface HQSceneProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
}

export default function HQScene({ agents, onAgentClick }: HQSceneProps) {
  const engineeringAgents = agents.filter(
    (a) => a.department === "engineering"
  );
  const marketingAgents = agents.filter((a) => a.department === "marketing");
  const productAgents = agents.filter((a) => a.department === "product");

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

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#d4e6b5" />
      </mesh>

      {/* Building structure */}
      <Building />

      {/* Floor labels */}
      <Text position={[-5.5, 1.5, 4]} fontSize={0.3} color="#1d4ed8" anchorX="left">
        Engineering
      </Text>
      <Text position={[-5.5, 5.5, 4]} fontSize={0.3} color="#f59e0b" anchorX="left">
        Marketing
      </Text>
      <Text position={[-5.5, 9.5, 4]} fontSize={0.3} color="#10b981" anchorX="left">
        Product
      </Text>

      {/* Engineering floor (ground level) */}
      <Floor position={[0, 0, 0]} color="#dbeafe" />
      {engineeringAgents.map((agent, i) => (
        <AgentAvatar
          key={agent.agent_id}
          agent={agent}
          position={[-3 + i * 2.5, 0.75, 0]}
          onClick={() => onAgentClick(agent)}
        />
      ))}

      {/* Marketing floor (2nd level) */}
      <Floor position={[0, 4, 0]} color="#fef3c7" />
      {marketingAgents.map((agent, i) => (
        <AgentAvatar
          key={agent.agent_id}
          agent={agent}
          position={[-3 + i * 2.5, 4.75, 0]}
          onClick={() => onAgentClick(agent)}
        />
      ))}

      {/* Product floor (3rd level) */}
      <Floor position={[0, 8, 0]} color="#d1fae5" />
      {productAgents.map((agent, i) => (
        <AgentAvatar
          key={agent.agent_id}
          agent={agent}
          position={[-3 + i * 2.5, 8.75, 0]}
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
        maxDistance={40}
      />
    </Canvas>
  );
}
