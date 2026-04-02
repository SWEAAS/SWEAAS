import type { Agent } from "../../store/agentStore";

const statusConfig: Record<string, { dot: string; label: string; bg: string; text: string }> = {
  active:  { dot: "#059669", label: "Active",  bg: "#ECFDF5", text: "#059669" },
  warning: { dot: "#D97706", label: "Warning", bg: "#FFFBEB", text: "#D97706" },
  paused:  { dot: "#8A96B0", label: "Paused",  bg: "#F5F8FE", text: "#8A96B0" },
  strike:  { dot: "#DC2626", label: "Strike",  bg: "#FEF2F2", text: "#DC2626" },
};

const deptColor: Record<string, string> = {
  engineering: "#1B47D6",
  marketing:   "#D97706",
  product:     "#7C3AED",
  support:     "#059669",
};

interface AgentCardProps {
  agent: Agent;
  onClick?: () => void;
}

export default function AgentCard({ agent, onClick }: AgentCardProps) {
  const status = statusConfig[agent.status] ?? statusConfig.active;
  const pct = Math.round((agent.tokens_used_today / agent.daily_token_budget) * 100);
  const accent = deptColor[agent.department] ?? "#1B47D6";

  const barColor =
    pct >= 85 ? "#DC2626" :
    pct >= 60 ? "#D97706" :
    "#1B47D6";

  return (
    <div
      onClick={onClick}
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F4",
        borderRadius: 14,
        padding: "18px 20px",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease, transform 0.15s ease",
        boxShadow: "var(--shadow-sm)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = "var(--shadow-md)";
        el.style.borderColor = "#C3D0F8";
        if (onClick) el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = "var(--shadow-sm)";
        el.style.borderColor = "#E2E8F4";
        el.style.transform = "translateY(0)";
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#0C1526", margin: 0, letterSpacing: "-0.01em" }}>
            {agent.name}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: accent,
                background: `${accent}12`,
                padding: "2px 7px",
                borderRadius: 20,
                textTransform: "capitalize",
              }}
            >
              {agent.department}
            </span>
            <span style={{ fontSize: 11, color: "#8A96B0" }}>
              {agent.role.replace(/_/g, " ")}
            </span>
          </div>
        </div>

        {/* Status pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 9px",
            background: status.bg,
            borderRadius: 20,
            flexShrink: 0,
            marginLeft: 10,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: status.dot,
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 600, color: status.text }}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Token usage */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#8A96B0", fontWeight: 500 }}>Token usage</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: pct >= 85 ? "#DC2626" : "#0C1526",
            }}
          >
            {pct}%
          </span>
        </div>
        <div
          style={{
            height: 5,
            background: "#EEF2FB",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(pct, 100)}%`,
              background: pct >= 85
                ? "linear-gradient(90deg, #EF4444, #DC2626)"
                : pct >= 60
                ? "linear-gradient(90deg, #F59E0B, #D97706)"
                : "linear-gradient(90deg, #3B82F6, #1B47D6)",
              borderRadius: 10,
              transition: "width 0.4s var(--ease-out)",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 10, color: "#8A96B0" }}>
            {(agent.tokens_used_today / 1000).toFixed(0)}K used
          </span>
          <span style={{ fontSize: 10, color: "#8A96B0" }}>
            {(agent.daily_token_budget / 1000).toFixed(0)}K limit
          </span>
        </div>
      </div>
    </div>
  );
}
