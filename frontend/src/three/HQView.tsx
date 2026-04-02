import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone } from "lucide-react";
import HQScene from "./HQScene";
import AgentChatPanel from "./ui/AgentChatPanel";
import TokenBurnOverlay from "./ui/TokenBurnOverlay";
import { useAgentStore, type Agent } from "../store/agentStore";

export default function HQView() {
  const { agents, fetchAgents } = useAgentStore();
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const navigate = useNavigate();

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const warningCount = agents.filter((a) => a.status === "warning").length;

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 60px)" }}>
      {/* Controls hint */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 40,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(226,232,244,0.9)",
          borderRadius: 10,
          padding: "8px 14px",
          boxShadow: "0 4px 16px rgba(12,21,38,0.07)",
        }}
      >
        <p style={{ fontSize: 11, color: "#4D5E80", margin: 0, lineHeight: 1.7, fontWeight: 500 }}>
          <span style={{ color: "#1B47D6", fontWeight: 700 }}>Controls:</span>{" "}
          WASD · Q/E up/down · Mouse to rotate · Click agent to chat
        </p>
      </div>

      {/* Call CTO — pulsing rings */}
      <div style={{ position: "absolute", bottom: 24, right: 24, zIndex: 40 }}>
        {/* Ring 1 */}
        <div
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: 12,
            border: "1.5px solid rgba(27,71,214,0.4)",
            animation: "cto-hq-ring 2.6s cubic-bezier(0.23,1,0.32,1) infinite",
            pointerEvents: "none",
          }}
        />
        {/* Ring 2 */}
        <div
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: 12,
            border: "1.5px solid rgba(27,71,214,0.22)",
            animation: "cto-hq-ring 2.6s cubic-bezier(0.23,1,0.32,1) 1.3s infinite",
            pointerEvents: "none",
          }}
        />
        <button
          onClick={() => navigate("/cto-call")}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(195,208,248,0.9)",
            borderRadius: 10,
            color: "#1B47D6",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "var(--shadow-blue)",
            transition: "background 0.15s, transform 0.12s",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "#EBF0FF";
            el.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "rgba(255,255,255,0.95)";
            el.style.transform = "translateY(0)";
          }}
          onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
          onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
        >
          <Phone size={14} />
          Call CTO
          {warningCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                padding: "0 4px",
                background: "#D97706",
                borderRadius: 9,
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                boxShadow: "0 2px 6px rgba(217,119,6,0.4)",
              }}
            >
              {warningCount}
            </span>
          )}
        </button>
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
