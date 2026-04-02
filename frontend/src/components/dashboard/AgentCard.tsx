import type { Agent } from "../../store/agentStore";

const statusConfig: Record<string, { dot: string; label: string; bg: string; text: string }> = {
  active:  { dot: "#059669", label: "Active",  bg: "#ECFDF5", text: "#059669" },
  warning: { dot: "#D97706", label: "Warning", bg: "#FFFBEB", text: "#D97706" },
  paused:  { dot: "#7a7390", label: "Paused",  bg: "#f8f6fc", text: "#7a7390" },
  strike:  { dot: "#DC2626", label: "Strike",  bg: "#FEF2F2", text: "#DC2626" },
};

const deptColor: Record<string, string> = {
  engineering: "var(--brand)",
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
  const accent = deptColor[agent.department] ?? "var(--brand)";

  return (
    <div
      onClick={onClick}
      className="rounded-[22px] border border-[#ece7f5] bg-white p-5 shadow-[0_12px_32px_-24px_rgba(42,26,92,0.28)] transition-all duration-200"
      style={{ cursor: onClick ? "pointer" : "default" }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = "0_20px_44px_-28px_rgba(42,26,92,0.38)";
        el.style.borderColor = "var(--brand-border)";
        if (onClick) el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = "";
        el.style.borderColor = "#ece7f5";
        el.style.transform = "translateY(0)";
      }}
    >
      {/* Top row */}
      <div className="mb-3.5 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-[#1f1638] m-0 tracking-[-0.01em]">
            {agent.name}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
              style={{ color: accent, background: `color-mix(in srgb, ${accent} 10%, white)` }}
            >
              {agent.department}
            </span>
            <span className="text-[11px] text-[#7a7390]">
              {agent.role.replace(/_/g, " ")}
            </span>
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 shrink-0 ml-2.5 rounded-full px-2.5 py-1"
          style={{ background: status.bg }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
          <span className="text-[11px] font-semibold" style={{ color: status.text }}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Token usage */}
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-[11px] text-[#7a7390] font-medium">Token usage</span>
          <span className={`text-[11px] font-bold ${pct >= 85 ? "text-red-600" : "text-[#1f1638]"}`}>
            {pct}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#ece7f5]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(pct, 100)}%`,
              background: pct >= 85
                ? "linear-gradient(90deg,#EF4444,#DC2626)"
                : pct >= 60
                ? "linear-gradient(90deg,#F59E0B,#D97706)"
                : "linear-gradient(90deg,var(--brand),var(--brand-dark))",
            }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-[#7a7390]">{(agent.tokens_used_today / 1000).toFixed(0)}K used</span>
          <span className="text-[10px] text-[#7a7390]">{(agent.daily_token_budget / 1000).toFixed(0)}K limit</span>
        </div>
      </div>
    </div>
  );
}
