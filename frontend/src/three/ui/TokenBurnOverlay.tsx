import type { Agent } from "../../store/agentStore";

interface TokenBurnOverlayProps {
  agents: Agent[];
}

const statusColors: Record<string, string> = {
  active: "bg-green-400",
  warning: "bg-yellow-400",
  paused: "bg-gray-400",
  strike: "bg-red-400",
};

export default function TokenBurnOverlay({ agents }: TokenBurnOverlayProps) {
  const totalBudget = agents.reduce((s, a) => s + a.daily_token_budget, 0);
  const totalUsed = agents.reduce((s, a) => s + a.tokens_used_today, 0);
  const overallPercent = totalBudget > 0 ? Math.round((totalUsed / totalBudget) * 100) : 0;

  return (
    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl border border-sweaas-border p-4 w-64 z-40">
      <h4 className="text-sm font-semibold text-sweaas-text mb-2">
        Token Burn Rate
      </h4>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-sweaas-text-secondary mb-1">
          <span>Overall</span>
          <span>{overallPercent}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              overallPercent >= 85 ? "bg-red-400" : "bg-sweaas-blue"
            }`}
            style={{ width: `${Math.min(overallPercent, 100)}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {agents.slice(0, 6).map((agent) => {
          const pct = Math.round(
            (agent.tokens_used_today / agent.daily_token_budget) * 100
          );
          return (
            <div key={agent.agent_id} className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${statusColors[agent.status] ?? "bg-gray-400"}`}
              />
              <span className="text-xs text-sweaas-text-secondary flex-1 truncate">
                {agent.name}
              </span>
              <span className="text-xs font-medium text-sweaas-text">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
