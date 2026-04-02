import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bug,
  CheckCircle,
  ExternalLink,
  GitBranch,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import AgentCard from "../components/dashboard/AgentCard";
import BudgetChart from "../components/dashboard/BudgetChart";
import TaskSummary from "../components/dashboard/TaskSummary";
import { useAgentStore } from "../store/agentStore";
import { useBudgetStore } from "../store/budgetStore";
import { useProjectStore } from "../store/projectStore";
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
  const [sentryIssues, setSentryIssues] = useState<SentryIssue[]>([]);
  const [sentryLoading, setSentryLoading] = useState(false);

  useEffect(() => {
    fetchAgents();
    fetchSummary();
    fetchProjects();
  }, [fetchAgents, fetchSummary, fetchProjects]);

  useEffect(() => {
    setSentryLoading(true);
    observabilityApi.sentryIssues()
      .then((res) => setSentryIssues(res.data?.issues ?? res.data ?? []))
      .catch(() => setSentryIssues([]))
      .finally(() => setSentryLoading(false));
  }, [currentProject?.id]);

  const activeCount = agents.filter((a) => a.status === "active").length;
  const warningCount = agents.filter((a) => a.status === "warning").length;
  const runningTasks = agents
    .flatMap((a) => (a as unknown as { recent_activity?: { state: string }[] }).recent_activity ?? [])
    .filter((act) => act.state === "running").length;

  const stats = [
    { label: "Total Agents",  value: agents.length,   icon: Users,          color: "text-[var(--brand)]",  bg: "bg-[var(--brand-surface)]" },
    { label: "Active",        value: activeCount,     icon: Zap,            color: "text-emerald-600",      bg: "bg-emerald-50" },
    { label: "Running Tasks", value: runningTasks || activeCount, icon: Sparkles, color: "text-[var(--brand)]", bg: "bg-[var(--brand-chip)]" },
    { label: "Warnings",      value: warningCount,    icon: AlertTriangle,  color: "text-amber-600",        bg: "bg-amber-50" },
    { label: "Budget Used",   value: `${consumptionPercent}%`, icon: CheckCircle, color: "text-[var(--brand)]", bg: "bg-[var(--brand-surface)]" },
  ];

  const levelColor: Record<string, string> = {
    error:   "text-red-600 bg-red-50 border-red-200",
    warning: "text-amber-600 bg-amber-50 border-amber-200",
    info:    "text-[var(--brand)] bg-[var(--brand-surface)] border-[var(--brand-border)]",
  };

  return (
    <div className="space-y-6">
      {/* ── Hero header ─────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[32px] border border-[#e7e0f6] bg-[radial-gradient(circle_at_top_left,var(--brand-surface)_0%,transparent_40%),linear-gradient(180deg,#fcfbff_0%,#f7f5fb_100%)] p-8 shadow-[0_30px_80px_-50px_rgba(42,26,92,0.3)]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-white/75 px-3 py-1 text-xs font-medium text-[var(--brand)] backdrop-blur">
              <Sparkles size={12} />
              {currentProject ? "Project overview" : "Workspace overview"}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-[#1f1638]">
              {currentProject?.name ?? "Dashboard"}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#675f7e]">
              {currentProject?.description ?? "Your AI engineering team at a glance."}
            </p>
            {currentProject?.github_repo_url && (
              <a
                href={currentProject.github_repo_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-[10px] border border-[var(--brand-border)] bg-white/80 px-4 py-2 text-[13px] font-medium text-[var(--brand)] no-underline backdrop-blur transition-colors hover:bg-[var(--brand-chip)]"
              >
                <GitBranch size={14} />
                View Repo
                <ExternalLink size={11} className="text-[var(--brand)]" />
              </a>
            )}
          </div>

          {/* Stat grid */}
          <div className="grid shrink-0 grid-cols-3 gap-3 xl:grid-cols-5">
            {stats.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-[18px] border border-white/70 bg-white/80 px-4 py-3 backdrop-blur min-w-[96px]">
                <div className={`mb-2 inline-flex rounded-[8px] p-1.5 ${bg}`}>
                  <Icon size={14} className={color} />
                </div>
                <p className="text-xl font-semibold text-[#1f1638]">{value}</p>
                <p className="text-[10px] uppercase tracking-[0.15em] text-[#7a7390]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Charts row ──────────────────────────────────────────── */}
      <section className="rounded-[32px] border border-[#ece7f5] bg-[#f8f6fc] p-5 shadow-[0_20px_60px_-40px_rgba(42,26,92,0.25)]">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <BudgetChart />
          </div>
          <TaskSummary />
        </div>
      </section>

      {/* ── Sentry issues ───────────────────────────────────────── */}
      <section className="rounded-[32px] border border-[#ece7f5] bg-[#f8f6fc] p-5 shadow-[0_20px_60px_-40px_rgba(42,26,92,0.25)]">
        <div className="mb-4 flex items-center gap-2">
          <Bug size={16} className="text-[#675f7e]" />
          <h3 className="text-[15px] font-semibold text-[#1f1638]">Live Errors</h3>
          <span className="ml-auto text-[11px] text-[#7a7390]">Powered by Sentry</span>
        </div>
        <div className="overflow-hidden rounded-[22px] border border-[#ece7f5] bg-white">
          {sentryLoading ? (
            <div className="p-6 text-center text-[13px] text-[#7a7390]">Loading issues…</div>
          ) : sentryIssues.length === 0 ? (
            <div className="flex items-center gap-3 p-6 text-[13px] text-emerald-600">
              <CheckCircle size={15} />
              No unresolved issues — all clear.
            </div>
          ) : (
            <div className="divide-y divide-[#ece7f5]">
              {sentryIssues.slice(0, 5).map((issue) => (
                <div key={issue.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={`shrink-0 rounded-[6px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${levelColor[issue.level] ?? levelColor.info}`}>
                    {issue.level}
                  </span>
                  <p className="flex-1 truncate text-[13px] text-[#1f1638]">{issue.title}</p>
                  {issue.permalink && (
                    <a href={issue.permalink} target="_blank" rel="noreferrer" className="shrink-0 text-[#7a7390] hover:text-[var(--brand)]">
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Agent grid ──────────────────────────────────────────── */}
      <section className="rounded-[32px] border border-[#ece7f5] bg-[#f8f6fc] p-5 shadow-[0_20px_60px_-40px_rgba(42,26,92,0.25)]">
        <div className="mb-4 flex items-center gap-2">
          <Users size={15} className="text-[#675f7e]" />
          <h3 className="text-[15px] font-semibold text-[#1f1638]">Agent Directory</h3>
          <span className="ml-auto text-[11px] text-[#7a7390]">{agents.length} agents</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {agents.map((agent) => (
            <AgentCard key={agent.agent_id} agent={agent} />
          ))}
        </div>
      </section>
    </div>
  );
}
