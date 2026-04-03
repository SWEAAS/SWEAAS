import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone } from "lucide-react";
import HQScene from "./HQScene";
import AgentChatPanel from "./ui/AgentChatPanel";
import TokenBurnOverlay from "./ui/TokenBurnOverlay";
import { useAgentStore, type Agent } from "../store/agentStore";
import { useProjectStore } from "../store/projectStore";
import { useTeamOnboardingStore } from "../store/teamOnboardingStore";
import { mergeAgentsWithTeamConfig } from "../utils/teamOnboarding";

export default function HQView() {
  const { agents, fetchAgents } = useAgentStore();
  const { config, fetchConfig } = useTeamOnboardingStore();
  const { currentProject } = useProjectStore();
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [cameraMode, setCameraMode] = useState<"overview" | "walkthrough">("overview");
  const navigate = useNavigate();

  useEffect(() => { fetchAgents(currentProject?.id); fetchConfig(); }, [fetchAgents, fetchConfig, currentProject?.id]);

  const displayAgents = useMemo(
    () => mergeAgentsWithTeamConfig(agents, config),
    [agents, config],
  );

  const warningCount = displayAgents.filter((a) => a.status === "warning").length;

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
          {cameraMode === "overview"
            ? "Mouse to orbit · Scroll to zoom · Switch to walkthrough to enter the building"
            : "Click scene to lock mouse · WASD move · Q/E up/down · Esc unlock"}
        </p>
      </div>

      <div
        style={{
          position: "absolute",
          top: 64,
          right: 16,
          zIndex: 40,
          display: "flex",
          gap: 8,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(226,232,244,0.9)",
          borderRadius: 12,
          padding: 6,
          boxShadow: "0 4px 16px rgba(12,21,38,0.07)",
        }}
      >
        {(["overview", "walkthrough"] as const).map((mode) => {
          const active = cameraMode === mode;
          return (
            <button
              key={mode}
              onClick={() => setCameraMode(mode)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(195,208,248,0.9)",
                background: active ? "#1B47D6" : "rgba(255,255,255,0.9)",
                color: active ? "#fff" : "#1B47D6",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {mode === "overview" ? "Overview" : "Walkthrough"}
            </button>
          );
        })}
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
          Call Cto
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

      <TokenBurnOverlay agents={displayAgents} />

      <HQScene
        agents={displayAgents}
        onAgentClick={(agent) => setChatAgent(agent)}
        cameraMode={cameraMode}
      />

      {chatAgent && (
        <AgentChatPanel
          agent={chatAgent}
          onClose={() => setChatAgent(null)}
        />
      )}
    </div>
  );
}
