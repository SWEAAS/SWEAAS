import { useEffect, useMemo, useState } from "react";
import { MessageSquareText, Phone, Search, Sparkles, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAgentStore, type Agent } from "../store/agentStore";
import { useProjectStore } from "../store/projectStore";
import { useTeamOnboardingStore } from "../store/teamOnboardingStore";
import { mergeAgentsWithTeamConfig } from "../utils/teamOnboarding";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function portraitUrlForAgent(agent: Pick<Agent, "agent_id" | "poster_image_url" | "name">) {
  if (agent.poster_image_url) {
    return agent.poster_image_url;
  }

  const initials =
    agent.name
      ?.split(/\s+/)
      .filter(Boolean)
      .map((w: string) => w[0])
      .join("")
      .slice(0, 2) || "AG";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&size=480&background=7c5cff&color=fff&bold=true`;
}

function formatTokenCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${value}`;
}

function usagePercent(agent: Pick<Agent, "tokens_used_today" | "daily_token_budget">) {
  if (!agent.daily_token_budget) return 0;
  return Math.round((agent.tokens_used_today / agent.daily_token_budget) * 100);
}

function statusTone(status: Agent["status"]) {
  if (status === "warning") {
    return {
      dot: "bg-amber-500",
      label: "Needs review",
      text: "text-amber-700",
      chip: "border-amber-200 bg-amber-50",
    };
  }

  if (status === "paused") {
    return {
      dot: "bg-slate-400",
      label: "Paused",
      text: "text-slate-600",
      chip: "border-slate-200 bg-slate-50",
    };
  }

  return {
    dot: "bg-emerald-500",
    label: "Active",
    text: "text-emerald-700",
    chip: "border-emerald-200 bg-emerald-50",
  };
}

function departmentLabel(value: Agent["department"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function roleLabel(value: string) {
  return value.replace(/_/g, " ");
}

function AgentAvatar({ agent, size = "md" }: { agent: Agent; size?: "sm" | "md" | "lg" }) {
  const classes =
    size === "lg"
      ? "h-24 w-24 rounded-[28px] text-2xl"
      : size === "sm"
        ? "h-10 w-10 rounded-[14px] text-sm"
        : "h-12 w-12 rounded-[16px] text-base";

  return (
    <>
      {portraitUrlForAgent(agent) ? (
        <img src={portraitUrlForAgent(agent)} alt={agent.name} className={`${classes} object-cover`} />
      ) : (
        <div
          className={`${classes} flex items-center justify-center bg-[linear-gradient(135deg,#7c5cff_0%,#d9ccff_100%)] font-semibold text-white`}
        >
          {getInitials(agent.name)}
        </div>
      )}
    </>
  );
}

export default function AgentDirectoryView() {
  const navigate = useNavigate();
  const { agents, fetchAgents } = useAgentStore();
  const { config, fetchConfig } = useTeamOnboardingStore();
  const { currentProject } = useProjectStore();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    void fetchAgents(currentProject?.id);
    void fetchConfig();
  }, [fetchAgents, fetchConfig, currentProject?.id]);

  const directoryAgents = useMemo(() => mergeAgentsWithTeamConfig(agents, config), [agents, config]);

  useEffect(() => {
    if (!selectedId && directoryAgents[0]) {
      setSelectedId(directoryAgents[0].agent_id);
      return;
    }

    if (selectedId && !directoryAgents.some((agent) => agent.agent_id === selectedId)) {
      setSelectedId(directoryAgents[0]?.agent_id ?? "");
    }
  }, [directoryAgents, selectedId]);

  const filteredAgents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return directoryAgents;

    return directoryAgents.filter((agent) =>
      [agent.name, agent.department, agent.role, agent.current_focus].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [directoryAgents, query]);

  const selectedAgent = useMemo(() => {
    return (
      filteredAgents.find((agent) => agent.agent_id === selectedId) ??
      directoryAgents.find((agent) => agent.agent_id === selectedId) ??
      filteredAgents[0] ??
      directoryAgents[0]
    );
  }, [directoryAgents, filteredAgents, selectedId]);

  const activeAgents = directoryAgents.filter((agent) => agent.status === "active").length;
  const departmentCount = new Set(directoryAgents.map((agent) => agent.department)).size;

  if (!selectedAgent) {
    return (
      <section className="rounded-[30px] border border-[#ece7f5] bg-white px-6 py-10 text-center text-sm text-[#675f7e] shadow-[0_24px_60px_-48px_rgba(31,22,56,0.2)]">
        No agents available yet. Finish onboarding to populate the directory.
      </section>
    );
  }

  const selectedStatus = statusTone(selectedAgent.status);
  const usage = usagePercent(selectedAgent);

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-[#ece7f5] bg-white px-6 py-6 shadow-[0_24px_60px_-48px_rgba(31,22,56,0.2)] sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ece7f5] bg-[#f8f5ff] px-3 py-1 text-xs font-medium text-[#5b5671]">
              <Sparkles size={14} />
              Slack-inspired agent workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#1f1638]">Agent Directory</h1>
            <p className="mt-3 text-sm leading-6 text-[#675f7e]">
              A dedicated agent pane with tighter Slack-like surfaces, a scannable member list, and
              a persistent detail panel for status, ownership, and token health.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-[#ece7f5] bg-[#fbfaff] px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#7a7390]">
                <Users size={14} />
                Agents
              </div>
              <div className="mt-2 text-2xl font-semibold text-[#1f1638]">{directoryAgents.length}</div>
            </div>
            <div className="rounded-[20px] border border-[#ece7f5] bg-[#fbfaff] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-[#7a7390]">Active now</div>
              <div className="mt-2 text-2xl font-semibold text-[#1f1638]">{activeAgents}</div>
            </div>
            <div className="rounded-[20px] border border-[#ece7f5] bg-[#fbfaff] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-[#7a7390]">Departments</div>
              <div className="mt-2 text-2xl font-semibold text-[#1f1638]">{departmentCount}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[28px] border border-[#ece7f5] bg-white shadow-[0_24px_60px_-48px_rgba(31,22,56,0.18)]">
          <div className="border-b border-[#f0ebf7] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a7390]">Browse agents</p>
            <div className="mt-3 flex items-center gap-3 rounded-[18px] border border-[#ece7f5] bg-[#faf9fd] px-3 py-2.5 text-[#6b647e]">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Diego, engineering, cto..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-[#9a93ab]"
              />
            </div>
          </div>

          <div className="border-b border-[#f0ebf7] px-5 py-3 text-xs font-medium text-[#7a7390]">
            Team members
          </div>

          <div className="max-h-[780px] overflow-y-auto px-2 py-2">
            {filteredAgents.map((agent) => {
              const active = agent.agent_id === selectedAgent.agent_id;
              const tone = statusTone(agent.status);

              return (
                <button
                  key={agent.agent_id}
                  type="button"
                  onClick={() => setSelectedId(agent.agent_id)}
                  className={`mb-1 flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left transition-colors ${
                    active ? "bg-[#f4efff]" : "hover:bg-[#faf8fd]"
                  }`}
                >
                  <AgentAvatar agent={agent} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#1f1638]">{agent.name}</p>
                      <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                    </div>
                    <p className="truncate text-xs text-[#6e6784]">
                      {departmentLabel(agent.department)} · {roleLabel(agent.role)}
                    </p>
                  </div>
                  <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8a82a0]">
                    {usagePercent(agent)}%
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-[28px] border border-[#ece7f5] bg-white shadow-[0_24px_60px_-48px_rgba(31,22,56,0.18)]">
            <div className="border-b border-[#f0ebf7] px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a7390]">Selected agent</p>
            </div>

            <div className="grid gap-6 px-6 py-6 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="rounded-[26px] border border-[#f0ebf7] bg-[#fbfaff] p-5">
                <AgentAvatar agent={selectedAgent} size="lg" />
                <h2 className="mt-5 text-2xl font-semibold tracking-tight text-[#1f1638]">
                  {selectedAgent.name}
                </h2>
                <p className="mt-2 text-sm text-[#675f7e]">{selectedAgent.department}</p>
                <p className="text-sm text-[#675f7e]">{roleLabel(selectedAgent.role)}</p>
                <div
                  className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${selectedStatus.chip} ${selectedStatus.text}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${selectedStatus.dot}`} />
                  {selectedStatus.label}
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-[24px] border border-[#ece7f5] bg-[#fcfbfe] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a7390]">
                        Token usage
                      </p>
                      <div className="mt-3 text-5xl font-semibold tracking-tight text-[#1f1638]">
                        {usage}%
                      </div>
                    </div>
                    <div className="min-w-[180px] rounded-[20px] border border-[#ece7f5] bg-white px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-[#8a82a0]">Usage snapshot</div>
                      <div className="mt-3 space-y-2 text-sm text-[#4d4761]">
                        <div>{formatTokenCount(selectedAgent.tokens_used_today)} used</div>
                        <div>{formatTokenCount(selectedAgent.daily_token_budget)} limit</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#ede8f6]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#7c5cff_0%,#a88eff_100%)]"
                      style={{ width: `${Math.min(usage, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="rounded-[24px] border border-[#ece7f5] bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a7390]">
                      Current focus
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[#4d4761]">{selectedAgent.current_focus}</p>
                  </div>

                  <div className="rounded-[24px] border border-[#ece7f5] bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a7390]">
                      Quick actions
                    </p>
                    <div className="mt-4 space-y-3">
                      <button
                        type="button"
                        onClick={() => navigate("/cto-call")}
                        className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-[#611f69] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4f1956]"
                      >
                        <Phone size={16} />
                        Call Cto
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate("/reports")}
                        className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-[#ece7f5] bg-white px-4 py-3 text-sm font-semibold text-[#4d4761] transition hover:bg-[#faf8fd]"
                      >
                        <MessageSquareText size={16} />
                        Open reports
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
