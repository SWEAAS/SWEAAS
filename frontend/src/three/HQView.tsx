import { useEffect, useState } from "react";
import HQScene from "./HQScene";
import AgentChatPanel from "./ui/AgentChatPanel";
import TokenBurnOverlay from "./ui/TokenBurnOverlay";
import { useAgentStore, type Agent } from "../store/agentStore";

export default function HQView() {
  const { agents, fetchAgents } = useAgentStore();
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 8rem)" }}>
      <div className="absolute top-4 right-4 z-40 bg-white/90 backdrop-blur-sm rounded-lg border border-sweaas-border px-3 py-2">
        <p className="text-xs text-sweaas-text-secondary">
          <strong>Controls:</strong> WASD to move · Q/E up/down · Mouse to
          rotate · Click agent to chat
        </p>
      </div>

      <TokenBurnOverlay agents={agents} />

      <HQScene agents={agents} onAgentClick={(agent) => setChatAgent(agent)} />

      {chatAgent && (
        <AgentChatPanel
          agent={chatAgent}
          onClose={() => setChatAgent(null)}
        />
      )}
    </div>
  );
}
