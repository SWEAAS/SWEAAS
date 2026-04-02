import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import AgentChatPanel from "../three/ui/AgentChatPanel";
import { useAgentStore, type Agent } from "../store/agentStore";

const departmentStyles: Record<
  string,
  {
    label: string;
    chip: string;
    surface: string;
    border: string;
    avatar: string;
    rail: string;
  }
> = {
  engineering: {
    label: "Engineering",
    chip: "bg-sky-100 text-sky-700",
    surface: "bg-sky-50/70",
    border: "border-sky-200/80",
    avatar: "bg-sky-600",
    rail: "border-sky-200",
  },
  marketing: {
    label: "Marketing",
    chip: "bg-fuchsia-100 text-fuchsia-700",
    surface: "bg-fuchsia-50/70",
    border: "border-fuchsia-200/80",
    avatar: "bg-fuchsia-600",
    rail: "border-fuchsia-200",
  },
  product: {
    label: "Product",
    chip: "bg-emerald-100 text-emerald-700",
    surface: "bg-emerald-50/70",
    border: "border-emerald-200/80",
    avatar: "bg-emerald-600",
    rail: "border-emerald-200",
  },
  support: {
    label: "Support",
    chip: "bg-amber-100 text-amber-700",
    surface: "bg-amber-50/70",
    border: "border-amber-200/80",
    avatar: "bg-amber-500",
    rail: "border-amber-200",
  },
};

const statusStyles: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  paused: "bg-slate-100 text-slate-600",
  strike: "bg-rose-50 text-rose-700",
};

type OrgBranch = {
  department: string;
  manager: Agent;
  specialists: Agent[];
};

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function usagePercent(agent: Agent) {
  return Math.round((agent.tokens_used_today / agent.daily_token_budget) * 100);
}

function buildOrgChart(agents: Agent[]) {
  if (!agents.length) {
    return { root: null as Agent | null, branches: [] as OrgBranch[] };
  }

  const root =
    agents.find((agent) => agent.hierarchy_level === "cto") ??
    agents.find((agent) => !agent.parent_agent_id) ??
    agents[0];

  const branches = agents
    .filter((agent) => agent.hierarchy_level === "manager")
    .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name))
    .map((manager) => ({
      department: manager.department,
      manager,
      specialists: agents
        .filter(
          (agent) =>
            agent.hierarchy_level === "specialist" &&
            (agent.parent_agent_id === manager.agent_id ||
              (!agent.parent_agent_id && agent.department === manager.department)),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));

  return { root, branches };
}

function AgentTile({
  agent,
  selected,
  compact = false,
  onSelect,
}: {
  agent: Agent;
  selected: boolean;
  compact?: boolean;
  onSelect: (agentId: string) => void;
}) {
  const department = departmentStyles[agent.department] ?? departmentStyles.engineering;
  const statusClass = statusStyles[agent.status] ?? statusStyles.active;
  const percent = usagePercent(agent);

  return (
    <button
      type="button"
      onClick={() => onSelect(agent.agent_id)}
      className={[
        "org-card-interactive w-full rounded-[22px] border bg-white text-left",
        "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
        compact ? "p-3.5" : "p-4",
        selected
          ? "border-[#7c5cff]/30 bg-[#fcfbff] shadow-[0_18px_44px_-28px_rgba(82,43,180,0.45)]"
          : "border-black/6 shadow-[0_12px_32px_-24px_rgba(17,24,39,0.28)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div
          className={[
            "flex shrink-0 items-center justify-center rounded-2xl text-sm font-semibold text-white",
            compact ? "h-10 w-10" : "h-12 w-12",
            department.avatar,
          ].join(" ")}
        >
          {getInitials(agent.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-sweaas-text">{agent.name}</div>
              <div className="mt-0.5 truncate text-[13px] text-sweaas-text-secondary">
                {formatLabel(agent.role)}
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${statusClass}`}>
              {formatLabel(agent.status)}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${department.chip}`}>
              {department.label}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-sweaas-text-secondary">
              {formatLabel(agent.hierarchy_level)}
            </span>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-sweaas-text-secondary">
              <span>Token load</span>
              <span>{percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#7c5cff]"
                style={{ width: `${Math.min(percent, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function OrgChartView() {
  const { agents, fetchAgents } = useAgentStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const { root, branches } = useMemo(() => buildOrgChart(agents), [agents]);
  const activeCount = agents.filter((agent) => agent.status === "active").length;
  const departmentCount = new Set(agents.map((agent) => agent.department)).size;
  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.agent_id, agent])), [agents]);
  const selectedAgent = (selectedId ? agentMap.get(selectedId) : undefined) ?? root ?? null;
  const manager = selectedAgent?.parent_agent_id ? agentMap.get(selectedAgent.parent_agent_id) : null;

  useEffect(() => {
    if (!selectedId && root) {
      setSelectedId(root.agent_id);
    }
  }, [root, selectedId]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-[#e7e0f6] bg-[radial-gradient(circle_at_top_left,rgba(124,92,255,0.12),transparent_32%),linear-gradient(180deg,#fcfbff_0%,#f7f5fb_100%)] p-8 shadow-[0_30px_80px_-50px_rgba(42,26,92,0.35)]">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#ddd3ff] bg-white/75 px-3 py-1 text-xs font-medium text-[#5b35d5] backdrop-blur">
              <Sparkles size={14} />
              Team map
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-[#1f1638]">Org Chart</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#675f7e]">
              A snappier view of the SWEAAS org. Think calmer surfaces, stronger hierarchy, and a
              layout that reads more like a product workspace than a generic demo component.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 backdrop-blur">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#7a7390]">
                  <Users size={14} />
                  Total agents
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#1f1638]">{agents.length}</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 backdrop-blur">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#7a7390]">
                  <ShieldCheck size={14} />
                  Active
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#1f1638]">{activeCount}</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 backdrop-blur">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#7a7390]">
                  <Building2 size={14} />
                  Departments
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#1f1638]">{departmentCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-[0_20px_50px_-38px_rgba(42,26,92,0.45)] backdrop-blur">
            {selectedAgent ? (
              <>
                <p className="text-xs uppercase tracking-[0.22em] text-[#7a7390]">Selected agent</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4a154b] text-sm font-semibold text-white">
                    {getInitials(selectedAgent.name)}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#1f1638]">{selectedAgent.name}</h3>
                    <p className="text-sm text-[#675f7e]">{formatLabel(selectedAgent.role)}</p>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 text-sm text-[#675f7e]">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${(departmentStyles[selectedAgent.department] ?? departmentStyles.engineering).chip}`}>
                    {(departmentStyles[selectedAgent.department] ?? departmentStyles.engineering).label}
                  </span>
                  <ChevronRight size={14} />
                  <span>{manager ? manager.name : "Executive lead"}</span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#f6f3fb] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#7a7390]">Level</p>
                    <p className="mt-2 text-sm font-medium text-[#1f1638]">
                      {formatLabel(selectedAgent.hierarchy_level)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#f6f3fb] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#7a7390]">Status</p>
                    <p className="mt-2 text-sm font-medium text-[#1f1638]">
                      {formatLabel(selectedAgent.status)}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-xs text-[#7a7390]">
                    <span>Daily token load</span>
                    <span>{usagePercent(selectedAgent)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#ebe6f6]">
                    <div
                      className="h-full rounded-full bg-[#7c5cff] transition-[width] duration-200 ease-out"
                      style={{ width: `${Math.min(usagePercent(selectedAgent), 100)}%` }}
                    />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setChatAgent(selectedAgent)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#ddd3ff] bg-[#f6f3fb] px-3 py-2.5 text-xs font-semibold text-[#5b35d5] transition-colors hover:bg-[#ede8ff]"
                  >
                    <MessageSquare size={13} />
                    Chat
                  </button>
                  {selectedAgent.hierarchy_level === "cto" ? (
                    <button
                      onClick={() => navigate("/cto-call")}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#c3d0f8] bg-[#ebf0ff] px-3 py-2.5 text-xs font-semibold text-[#1b47d6] transition-colors hover:bg-[#dce5ff]"
                    >
                      <Phone size={13} />
                      Video Call
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate("/hq")}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#c3d0f8] bg-[#ebf0ff] px-3 py-2.5 text-xs font-semibold text-[#1b47d6] transition-colors hover:bg-[#dce5ff]"
                    >
                      <Building2 size={13} />
                      Visit HQ
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-[#675f7e]">Select an agent to inspect their role.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-[#ece7f5] bg-[#f8f6fc] p-4 shadow-[0_24px_70px_-50px_rgba(42,26,92,0.32)] sm:p-6 lg:p-7">
        {root ? (
          <div className="space-y-6">
            <div className="rounded-[28px] border border-[#e4def2] bg-white p-5 shadow-[0_16px_42px_-34px_rgba(17,24,39,0.35)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[#7a7390]">Leadership</p>
                  <h3 className="mt-2 text-lg font-semibold text-[#1f1638]">Executive node</h3>
                </div>
                <div className="rounded-full bg-[#f1ecff] px-3 py-1 text-xs font-medium text-[#5b35d5]">
                  Workspace owner
                </div>
              </div>

              <div className="mx-auto max-w-md">
                <AgentTile
                  agent={root}
                  selected={selectedAgent?.agent_id === root.agent_id}
                  onSelect={setSelectedId}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {branches.map(({ department, manager, specialists }) => {
                const style = departmentStyles[department] ?? departmentStyles.engineering;

                return (
                  <section
                    key={manager.agent_id}
                    className={[
                      "rounded-[28px] border p-4 shadow-[0_16px_40px_-34px_rgba(17,24,39,0.28)]",
                      style.surface,
                      style.border,
                    ].join(" ")}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-[#7a7390]">Department</p>
                        <h3 className="mt-1 text-base font-semibold text-[#1f1638]">{style.label}</h3>
                      </div>
                      <div className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-[#675f7e]">
                        {specialists.length + 1} roles
                      </div>
                    </div>

                    <AgentTile
                      agent={manager}
                      selected={selectedAgent?.agent_id === manager.agent_id}
                      onSelect={setSelectedId}
                    />

                    <div className={["mt-4 border-l-2 pl-4", style.rail].join(" ")}>
                      <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[#7a7390]">
                        Individual contributors
                      </div>
                      <div className="space-y-3">
                        {specialists.map((agent) => (
                          <AgentTile
                            key={agent.agent_id}
                            agent={agent}
                            compact
                            selected={selectedAgent?.agent_id === agent.agent_id}
                            onSelect={setSelectedId}
                          />
                        ))}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#ddd6eb] bg-white px-6 py-16 text-center text-[#675f7e]">
            Loading org chart...
          </div>
        )}
      </section>

      {chatAgent && (
        <AgentChatPanel agent={chatAgent} onClose={() => setChatAgent(null)} />
      )}
    </div>
  );
}
