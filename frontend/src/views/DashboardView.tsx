import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bug,
  CheckCircle,
  ExternalLink,
  GitBranch,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import AgentCard from "../components/dashboard/AgentCard";
import BudgetChart from "../components/dashboard/BudgetChart";
import TaskSummary from "../components/dashboard/TaskSummary";
import { useAgentStore } from "../store/agentStore";
import { useBudgetStore } from "../store/budgetStore";
import { useProjectStore } from "../store/projectStore";
import { useTeamOnboardingStore } from "../store/teamOnboardingStore";
import { mergeAgentsWithTeamConfig } from "../utils/teamOnboarding";
import { observabilityApi } from "../api/client";

interface SentryIssue {
  id: string;
  title: string;
  level: string;
  status: string;
  count: number;
  permalink?: string;
}

export default function DashboardView() {
  const { agents, fetchAgents } = useAgentStore();
  const { consumptionPercent, fetchSummary } = useBudgetStore();
  const { currentProject, fetchProjects } = useProjectStore();
  const { config, fetchConfig } = useTeamOnboardingStore();
  const [sentryIssues, setSentryIssues] = useState<SentryIssue[]>([]);
  const [sentryLoading, setSentryLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAgents();
    fetchSummary();
    fetchProjects();
    fetchConfig();
  }, [fetchAgents, fetchSummary, fetchProjects, fetchConfig]);

  useEffect(() => {
    setSentryLoading(true);
    observabilityApi.sentryIssues()
      .then((res) => setSentryIssues(res.data?.issues ?? res.data ?? []))
      .catch(() => setSentryIssues([]))
      .finally(() => setSentryLoading(false));
  }, [currentProject?.id]);

  const displayAgents = mergeAgentsWithTeamConfig(agents, config);
  const activeCount = displayAgents.filter((a) => a.status === "active").length;
  const warningCount = displayAgents.filter((a) => a.status === "warning").length;
  const runningTasks = displayAgents
    .flatMap((a) => (a as unknown as { recent_activity?: { state: string }[] }).recent_activity ?? [])
    .filter((act) => act.state === "running").length;
  const agentPreview = displayAgents.slice(0, 8);

  const stats = [
    { label: "Agents",   value: displayAgents.length, icon: Users,         color: "text-[var(--brand)]" },
    { label: "Active",   value: activeCount,           icon: Zap,           color: "text-emerald-600" },
    { label: "Running",  value: runningTasks || activeCount, icon: Sparkles, color: "text-[var(--brand)]" },
    { label: "Warnings", value: warningCount,          icon: AlertTriangle, color: "text-amber-600" },
    { label: "Budget",   value: `${consumptionPercent}%`, icon: CheckCircle, color: "text-[var(--brand)]" },
  ];

  const levelColor: Record<string, string> = {
    error:   "text-red-600 bg-red-50 border-red-200",
    warning: "text-amber-600 bg-amber-50 border-amber-200",
    info:    "text-[var(--brand)] bg-[var(--brand-surface)] border-[var(--brand-border)]",
  };

  return (
    <div className="space-y-4">
      {/* ── Utility header ───────────────────────────────────── */}
      <header className="rounded-xl border border-[#ece7f5] bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#7a7390]">
              {currentProject ? "Project" : "Workspace"}
            </p>
            <h1 className="text-lg font-semibold text-[#1f1638] truncate">
              {currentProject?.name ?? "Dashboard"}
            </h1>
            <p className="mt-0.5 text-[13px] leading-snug text-[#675f7e] max-w-lg truncate">
              {config.completed
                ? `${displayAgents.length} agents · $${Math.round(config.overall_budget_usd || 0).toLocaleString()} budget`
                : "Your AI engineering team at a glance."}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {currentProject?.github_repo_url && (
              <a
                href={currentProject.github_repo_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#ece7f5] bg-white px-3 py-1.5 text-[12px] font-medium text-[#675f7e] no-underline transition-colors hover:bg-[#faf8fd]"
              >
                <GitBranch size={13} />
                Repo
                <ExternalLink size={10} />
              </a>
            )}
            {!config.completed && (
              <button
                type="button"
                onClick={() => navigate("/onboarding")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:opacity-90"
              >
                Onboard team
                <ArrowRight size={13} />
              </button>
            )}
            {config.completed && (
              <button
                type="button"
                onClick={() => navigate("/onboarding")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#ece7f5] bg-white px-3 py-1.5 text-[12px] font-medium text-[#675f7e] transition-colors hover:bg-[#faf8fd]"
              >
                Edit team
              </button>
            )}
          </div>
        </div>

        {/* Inline stats row */}
        <div className="mt-3 flex items-center gap-4 border-t border-[#ece7f5] pt-3">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <Icon size={13} className={color} />
              <span className="text-[13px] font-semibold text-[#1f1638]">{value}</span>
              <span className="text-[11px] text-[#7a7390]">{label}</span>
            </div>
          ))}
        </div>
      </header>

      {/* ── Charts row ───────────────────────────────────────── */}
      <section className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <BudgetChart />
        </div>
        <TaskSummary />
      </section>

      {/* ── Live errors ──────────────────────────────────────── */}
      <section className="rounded-xl border border-[#ece7f5] bg-white">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#ece7f5]">
          <Bug size={14} className="text-[#675f7e]" />
          <h2 className="text-[13px] font-semibold text-[#1f1638]">Live Errors</h2>
          <span className="ml-auto text-[11px] text-[#7a7390]">Sentry</span>
        </div>

        {sentryLoading ? (
          <div className="px-4 py-5 text-center text-[12px] text-[#7a7390]">Loading issues…</div>
        ) : sentryIssues.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-4 text-[12px] text-emerald-600">
            <CheckCircle size={14} />
            No unresolved issues — all clear.
          </div>
        ) : (
          <div className="divide-y divide-[#ece7f5]">
            {sentryIssues.slice(0, 5).map((issue) => (
              <div key={issue.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${levelColor[issue.level] ?? levelColor.info}`}>
                  {issue.level}
                </span>
                <p className="flex-1 truncate text-[12px] text-[#1f1638]">{issue.title}</p>
                {issue.permalink && (
                  <a href={issue.permalink} target="_blank" rel="noreferrer" className="shrink-0 text-[#7a7390] hover:text-[var(--brand)]">
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Agent directory ──────────────────────────────────── */}
      <section className="rounded-xl border border-[#ece7f5] bg-white">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#ece7f5]">
          <Users size={14} className="text-[#675f7e]" />
          <h2 className="text-[13px] font-semibold text-[#1f1638]">Agent Directory</h2>
          <span className="text-[11px] text-[#7a7390]">
            {agentPreview.length} of {displayAgents.length}
          </span>
          <button
            type="button"
            onClick={() => navigate("/agents")}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#ece7f5] bg-white px-3 py-1.5 text-[12px] font-medium text-[#675f7e] transition-colors hover:bg-[#faf8fd]"
          >
            View all
            <ArrowRight size={12} />
          </button>
        </div>
        <div className="divide-y divide-[#ece7f5]">
          {agentPreview.map((agent) => (
            <AgentCard key={agent.agent_id} agent={agent} />
          ))}
        </div>
      </section>
    </div>
  );
}
