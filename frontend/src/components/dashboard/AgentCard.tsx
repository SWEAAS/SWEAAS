import { Activity, AlertTriangle, Pause, Zap } from "lucide-react";
import type { Agent } from "../../store/agentStore";

const statusConfig: Record<string, { color: string; icon: typeof Activity; label: string }> = {
  active: { color: "text-green-500", icon: Activity, label: "Active" },
  warning: { color: "text-sweaas-yellow", icon: AlertTriangle, label: "Warning" },
  paused: { color: "text-gray-400", icon: Pause, label: "Paused" },
  strike: { color: "text-red-500", icon: Zap, label: "Strike" },
};

interface AgentCardProps {
  agent: Agent;
  onClick?: () => void;
}

export default function AgentCard({ agent, onClick }: AgentCardProps) {
  const status = statusConfig[agent.status] ?? statusConfig.active;
  const StatusIcon = status.icon;
  const usagePercent = Math.round(
    (agent.tokens_used_today / agent.daily_token_budget) * 100
  );

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-sweaas-border p-5 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sweaas-text">{agent.name}</h3>
          <p className="text-xs text-sweaas-text-secondary mt-0.5">
            {agent.role.replace(/_/g, " ")} · {agent.department}
          </p>
        </div>
        <div className={`flex items-center gap-1 ${status.color}`}>
          <StatusIcon size={14} />
          <span className="text-xs font-medium">{status.label}</span>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-sweaas-text-secondary mb-1">
          <span>Token Usage</span>
          <span>{usagePercent}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              usagePercent >= 85
                ? "bg-red-400"
                : usagePercent >= 60
                  ? "bg-sweaas-yellow"
                  : "bg-sweaas-blue"
            }`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-sweaas-text-secondary mt-1">
          <span>{(agent.tokens_used_today / 1000).toFixed(0)}K used</span>
          <span>{(agent.daily_token_budget / 1000).toFixed(0)}K limit</span>
        </div>
      </div>
    </div>
  );
}
