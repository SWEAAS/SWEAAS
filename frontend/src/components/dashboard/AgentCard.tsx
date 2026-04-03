import type { Agent } from "../../store/agentStore";
import AgentStatusBadge from "../ui/AgentStatusBadge";

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
  const pct = Math.round((agent.tokens_used_today / agent.daily_token_budget) * 100);
  const accent = deptColor[agent.department] ?? "var(--brand)";

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#faf8fd]"
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      {/* Name + department */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-[#1f1638] truncate">
            {agent.name}
          </p>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize"
            style={{ color: accent, background: `color-mix(in srgb, ${accent} 8%, white)` }}
          >
            {agent.department}
          </span>
        </div>
        <p className="text-[11px] text-[#7a7390] mt-0.5 truncate">
          {agent.role.replace(/_/g, " ")}
        </p>
      </div>

      {/* Token usage — compact inline bar */}
      <div className="shrink-0 w-28">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-[#7a7390]">{(agent.tokens_used_today / 1000).toFixed(0)}K / {(agent.daily_token_budget / 1000).toFixed(0)}K</span>
          <span className={`text-[10px] font-semibold ${pct >= 85 ? "text-red-600" : "text-[#1f1638]"}`}>
            {pct}%
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[#ece7f5]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(pct, 100)}%`,
              background: pct >= 85 ? "#EF4444" : pct >= 60 ? "#F59E0B" : "var(--brand)",
            }}
          />
        </div>
      </div>

      <AgentStatusBadge status={agent.status} size="compact" className="shrink-0" />
    </div>
  );
}
