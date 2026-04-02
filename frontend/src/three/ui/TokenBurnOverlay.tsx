import type { Agent } from "../../store/agentStore";

interface Props { agents: Agent[]; }

const statusDot: Record<string, string> = {
  active:  "#059669",
  warning: "#D97706",
  paused:  "#8A96B0",
  strike:  "#DC2626",
};

export default function TokenBurnOverlay({ agents }: Props) {
  const totalBudget = agents.reduce((s, a) => s + a.daily_token_budget, 0);
  const totalUsed   = agents.reduce((s, a) => s + a.tokens_used_today, 0);
  const pct = totalBudget > 0 ? Math.round((totalUsed / totalBudget) * 100) : 0;
  const critical = pct >= 85;

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        zIndex: 40,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(226,232,244,0.9)",
        borderRadius: 12,
        padding: "14px 16px",
        width: 216,
        boxShadow: "0 4px 16px rgba(12,21,38,0.08), 0 1px 4px rgba(12,21,38,0.04)",
      }}
    >
      <p
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "#1B47D6",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          margin: "0 0 12px",
        }}
      >
        Token Burn Rate
      </p>

      {/* Overall bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5, fontWeight: 500 }}>
          <span style={{ color: "#4D5E80" }}>Overall</span>
          <span style={{ color: critical ? "#DC2626" : "#1B47D6", fontWeight: 700 }}>
            {pct}%
          </span>
        </div>
        <div style={{ height: 5, background: "#EEF2FB", borderRadius: 10, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.min(pct, 100)}%`,
              borderRadius: 10,
              background: critical
                ? "linear-gradient(90deg,#EF4444,#DC2626)"
                : "linear-gradient(90deg,#3B82F6,#1B47D6)",
              transition: "width 0.4s cubic-bezier(0.23,1,0.32,1)",
            }}
          />
        </div>
      </div>

      {/* Per-agent rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {agents.slice(0, 6).map((a) => {
          const p = Math.round((a.tokens_used_today / a.daily_token_budget) * 100);
          return (
            <div key={a.agent_id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: statusDot[a.status] ?? "#8A96B0",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: "#4D5E80",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 500,
                }}
              >
                {a.name}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: p >= 85 ? "#DC2626" : "#0C1526",
                  width: 28,
                  textAlign: "right",
                }}
              >
                {p}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
