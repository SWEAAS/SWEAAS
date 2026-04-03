import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  Clock3,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { agentApi } from "../api/client";
import ProfileCardV3 from "../components/org-chart/v3/ProfileCardV3";
import { useAuthStore } from "../store/authStore";
import { useTeamOnboardingStore } from "../store/teamOnboardingStore";
import AgentChatPanel from "../three/ui/AgentChatPanel";
import { useAgentStore, type Agent } from "../store/agentStore";
import { mergeAgentsWithTeamConfig } from "../utils/teamOnboarding";

const departmentStyles: Record<
  string,
  {
    label: string;
    accent: string;
    chip: string;
  }
> = {
  engineering: {
    label: "Engineering",
    accent: "#5ea4ff",
    chip: "bg-sky-100/80 text-sky-700",
  },
  marketing: {
    label: "Marketing",
    accent: "#d66bff",
    chip: "bg-fuchsia-100/80 text-fuchsia-700",
  },
  product: {
    label: "Product",
    accent: "#4ad48a",
    chip: "bg-emerald-100/80 text-emerald-700",
  },
  support: {
    label: "Support",
    accent: "#f7bf4d",
    chip: "bg-amber-100/80 text-amber-700",
  },
};

type AgentActivity = {
  activity_id: string;
  title: string;
  detail: string;
  state: "queued" | "running" | "completed" | "blocked";
  started_at: string;
};

type AgentDetail = Agent & {
  description?: string;
  strike_count?: number;
  recent_activity?: AgentActivity[];
  email?: string | null;
  pronouns?: string | null;
  location?: string | null;
  timezone?: string | null;
  start_date?: string | null;
};

type OrgTree = {
  root: Agent | null;
  childrenByParent: Map<string, Agent[]>;
  parentById: Map<string, string | null>;
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
  if (!agent.daily_token_budget) return 0;
  return Math.round((agent.tokens_used_today / agent.daily_token_budget) * 100);
}

function compareAgents(a: Agent, b: Agent) {
  const levelOrder = { cto: 0, manager: 1, specialist: 2 } as const;
  const levelDiff =
    (levelOrder[a.hierarchy_level as keyof typeof levelOrder] ?? 3) -
    (levelOrder[b.hierarchy_level as keyof typeof levelOrder] ?? 3);

  if (levelDiff !== 0) return levelDiff;
  return a.name.localeCompare(b.name);
}

function buildOrgTree(agents: Agent[]): OrgTree {
  if (!agents.length) {
    return { root: null, childrenByParent: new Map(), parentById: new Map() };
  }

  const root =
    agents.find((agent) => agent.hierarchy_level === "cto") ??
    agents.find((agent) => !agent.parent_agent_id) ??
    agents[0];

  const managersByDepartment = new Map(
    agents
      .filter((agent) => agent.hierarchy_level === "manager")
      .map((agent) => [agent.department, agent] as const),
  );

  const childrenByParent = new Map<string, Agent[]>();
  const parentById = new Map<string, string | null>([[root.agent_id, null]]);

  for (const agent of agents) {
    if (agent.agent_id === root.agent_id) continue;

    let parentId = agent.parent_agent_id ?? null;

    if (!parentId) {
      if (agent.hierarchy_level === "manager") {
        parentId = root.agent_id;
      } else {
        parentId = managersByDepartment.get(agent.department)?.agent_id ?? root.agent_id;
      }
    }

    parentById.set(agent.agent_id, parentId);

    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(agent);
    siblings.sort(compareAgents);
    childrenByParent.set(parentId, siblings);
  }

  return { root, childrenByParent, parentById };
}

function getPathToAgent(agentId: string | null, rootId: string | undefined, parentById: Map<string, string | null>) {
  if (!agentId || !rootId) return rootId ? [rootId] : [];

  const path: string[] = [];
  let currentId: string | null | undefined = agentId;

  while (currentId) {
    path.unshift(currentId);
    currentId = parentById.get(currentId) ?? null;
  }

  return path[0] === rootId ? path : [rootId];
}

function formatDate(dateString?: string | null) {
  if (!dateString) return "Unavailable";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatLocalTime(timeZone?: string | null) {
  if (!timeZone) return "Unknown timezone";

  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(new Date());
  } catch {
    return timeZone;
  }
}

function getUserDisplayName(fullName?: string | null) {
  const firstName = fullName?.trim().split(/\s+/)[0];
  return firstName || "You";
}

function cardShell(selected: boolean) {
  return [
    "relative rounded-[34px] p-2 transition-[transform,box-shadow] duration-200 ease-out",
    selected
      ? "bg-[var(--brand-surface)] shadow-[0_24px_56px_-34px_rgba(124,92,255,0.45)]"
      : "shadow-[0_18px_46px_-32px_rgba(17,24,39,0.18)] hover:-translate-y-0.5",
  ].join(" ");
}

function rowHeading(levelIndex: number, path: string[], agentMap: Map<string, Agent>) {
  if (levelIndex === 1) return "Direct reports";

  const parentId = path[levelIndex - 1];
  const parent = parentId ? agentMap.get(parentId) : null;

  if (!parent) return "Expanded team";
  return `Reporting to ${parent.name}`;
}

export default function OrgChartView() {
  const { agents, fetchAgents } = useAgentStore();
  const { config, fetchConfig } = useTeamOnboardingStore();
  const user = useAuthStore((state) => state.user);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [profileAgentId, setProfileAgentId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, AgentDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void fetchAgents();
    void fetchConfig();
  }, [fetchAgents, fetchConfig]);

  const displayAgents = useMemo(() => mergeAgentsWithTeamConfig(agents, config), [agents, config]);
  const { root, childrenByParent, parentById } = useMemo(() => buildOrgTree(displayAgents), [displayAgents]);
  const agentMap = useMemo(() => new Map(displayAgents.map((agent) => [agent.agent_id, agent])), [displayAgents]);
  const activeCount = displayAgents.filter((agent) => agent.status === "active").length;
  const departmentCount = new Set(displayAgents.map((agent) => agent.department)).size;
  const detailLookupId = profileAgentId
    ? (agentMap.get(profileAgentId)?.archetype_agent_id ?? profileAgentId)
    : null;

  useEffect(() => {
    if (root && !focusedId) {
      setFocusedId(root.agent_id);
    }
  }, [root, focusedId]);

  useEffect(() => {
    if (!profileAgentId || !detailLookupId || detailById[detailLookupId]) return;

    let cancelled = false;
    setDetailLoadingId(detailLookupId);
    setDetailError(null);

    void agentApi
      .get(detailLookupId)
      .then((response) => {
        if (cancelled) return;
        setDetailById((current) => ({ ...current, [detailLookupId]: response.data as AgentDetail }));
      })
      .catch(() => {
        if (cancelled) return;
        setDetailError(detailLookupId === profileAgentId ? "Could not load full profile details." : null);
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoadingId((current) => (current === detailLookupId ? null : current));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailById, detailLookupId, profileAgentId]);

  const activePath = useMemo(
    () => getPathToAgent(focusedId ?? root?.agent_id ?? null, root?.agent_id, parentById),
    [focusedId, parentById, root?.agent_id],
  );

  const visibleLevels = useMemo(() => {
    if (!root) return [] as Agent[][];

    const levels: Agent[][] = [[root]];
    const rootChildren = childrenByParent.get(root.agent_id) ?? [];

    if (rootChildren.length > 0) {
      levels.push(rootChildren);
    }

    for (const ancestorId of activePath.slice(1)) {
      const children = childrenByParent.get(ancestorId) ?? [];
      if (children.length > 0) {
        levels.push(children);
      }
    }

    return levels;
  }, [activePath, childrenByParent, root]);

  const profileSummary = profileAgentId ? agentMap.get(profileAgentId) ?? null : null;
  const profileAgent = profileAgentId
    ? ({
        ...((detailLookupId && detailById[detailLookupId]) ?? {}),
        ...(profileSummary ?? {}),
      } as AgentDetail)
    : null;
  const profileManager =
    profileAgent?.parent_agent_id ? agentMap.get(profileAgent.parent_agent_id) ?? null : null;
  const topOwnerLabel = getUserDisplayName(user?.full_name);

  function handleCardPress(agent: Agent) {
    if (focusedId === agent.agent_id) {
      setProfileAgentId(agent.agent_id);
      return;
    }

    setFocusedId(agent.agent_id);
    setProfileAgentId(null);
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[36px] border border-[var(--brand-border)] bg-[radial-gradient(circle_at_top_left,var(--brand-surface),transparent_36%),linear-gradient(180deg,#fdfcff_0%,#f7f5fb_100%)] p-8 shadow-[0_36px_90px_-56px_rgba(42,26,92,0.36)]">
        <div className="max-w-4xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-white/75 px-3 py-1 text-xs font-medium text-[var(--brand-dark)] backdrop-blur">
            <Sparkles size={14} />
            Interactive org chart
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#1f1638]">
            Explore the team like a living hierarchy
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#675f7e]">
            Click a card once to expand that person&apos;s reporting line. Click the same card again
            to open the richer profile drawer with context, contact details, recent activity, and a
            quick path back to the org chart.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
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
            <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#7a7390]">
                <Workflow size={14} />
                Avg load
              </div>
              <p className="mt-2 text-2xl font-semibold text-[#1f1638]">
                {agents.length
                  ? `${Math.round(
                      agents.reduce((sum, agent) => sum + usagePercent(agent), 0) / agents.length,
                    )}%`
                  : "0%"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[36px] border border-[#ece7f5] bg-white p-4 shadow-[0_24px_70px_-50px_rgba(42,26,92,0.24)] sm:p-6 lg:p-7">
        {root ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-[#7a7390]">Org navigation</p>
                <h3 className="mt-2 text-xl font-semibold text-[#1f1638]">Expand the reporting lines</h3>
              </div>
              <div className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium text-[#675f7e]">
                {profileAgentId ? "Profile open" : "Tree view"}
              </div>
            </div>

            <div className="space-y-5">
              {visibleLevels.map((level, levelIndex) => (
                <div key={`${levelIndex}-${level.map((agent) => agent.agent_id).join("-")}`} className="space-y-4">
                  {levelIndex > 0 ? (
                    <div className="flex flex-col items-center px-4">
                      <div className="h-8 w-px bg-[#ddd6eb]" />
                      <div className="h-px w-full max-w-5xl bg-[#e6e0f2]" />
                    </div>
                  ) : null}

                  {levelIndex > 0 ? (
                    <div className="text-center text-[11px] uppercase tracking-[0.22em] text-[#7a7390]">
                      {rowHeading(levelIndex, activePath, agentMap)}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-start justify-center gap-5">
                    {level.map((agent) => {
                      const style = departmentStyles[agent.department] ?? departmentStyles.engineering;
                      const reportCount = childrenByParent.get(agent.agent_id)?.length ?? 0;
                      const isFocused = focusedId === agent.agent_id;

                      return (
                        <div key={agent.agent_id} className={cardShell(isFocused)}>
                          <ProfileCardV3
                            agent={agent}
                            accentColor={agent.hierarchy_level === "cto" ? "#7c5cff" : style.accent}
                            reportCount={reportCount}
                            selected={isFocused}
                            onSelect={() => handleCardPress(agent)}
                            onVideoCall={
                              agent.replica_id
                                ? () => {
                                    const replicaId = agent.replica_id;
                                    if (!replicaId) return;
                                    const params = new URLSearchParams({
                                      agent_id: agent.agent_id,
                                      replica: replicaId,
                                    });
                                    navigate(`/cto-call?${params.toString()}`);
                                  }
                                : undefined
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#ddd6eb] bg-white px-6 py-16 text-center text-[#675f7e]">
            Loading org chart...
          </div>
        )}
      </section>

      <section className="rounded-[36px] border border-[#ece7f5] bg-white p-6 shadow-[0_18px_50px_-38px_rgba(17,24,39,0.28)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#7a7390]">Interaction model</p>
            <h3 className="mt-2 text-lg font-semibold text-[#1f1638]">How navigation works</h3>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-[#675f7e]">
            The first click moves you deeper into the reporting line. The second click opens a richer
            side profile so the chart stays readable while still letting you inspect one person in
            detail.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[24px] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[#7a7390]">First click</p>
            <p className="mt-2 text-sm leading-6 text-[#4e4762]">
              Expands the selected employee&apos;s place in the org and reveals the next layer below.
            </p>
          </div>
          <div className="rounded-[24px] border border-[#dde5fb] bg-[#f7f9ff] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[#7a7390]">Second click</p>
            <p className="mt-2 text-sm leading-6 text-[#4e4762]">
              Opens the richer slide-over profile with contact details, activity, and quick actions.
            </p>
          </div>
          <div className="rounded-[24px] border border-[#e4def2] bg-[#fbfaff] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[#7a7390]">Return path</p>
            <p className="mt-2 text-sm leading-6 text-[#4e4762]">
              Use the drawer&apos;s back action to close the pane and jump straight back to the chart.
            </p>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={() => setProfileAgentId(null)}
        aria-label="Close profile drawer"
        className={[
          "fixed inset-0 z-40 bg-[#1f1638]/22 backdrop-blur-[2px] transition-opacity duration-300",
          profileAgentId ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />

      <aside
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-[#ece7f5] bg-white shadow-[-24px_0_60px_-40px_rgba(17,24,39,0.4)] transition-transform duration-300 ease-out",
          profileAgentId ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        aria-hidden={profileAgentId ? undefined : true}
      >
        {profileAgentId ? (
          <>
            <div className="flex items-center justify-between border-b border-[#f0ebf8] px-5 py-4">
              <button
                type="button"
                onClick={() => setProfileAgentId(null)}
                className="inline-flex items-center gap-2 rounded-full border border-[#ece7f5] px-3 py-1.5 text-xs font-semibold text-[#554a72] transition-colors hover:bg-[#faf7ff]"
              >
                <ChevronLeft size={14} />
                View org chart
              </button>
              <button
                type="button"
                onClick={() => setProfileAgentId(null)}
                className="rounded-full p-2 text-[#7a7390] transition-colors hover:bg-[#f6f3fb] hover:text-[#1f1638]"
                aria-label="Close profile"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {detailLoadingId === detailLookupId && !(detailLookupId ? detailById[detailLookupId] : null) ? (
                <div className="space-y-4">
                  <div className="h-64 animate-pulse rounded-[28px] bg-[#f2eef8]" />
                  <div className="h-6 w-2/3 animate-pulse rounded-full bg-[#f2eef8]" />
                  <div className="h-24 animate-pulse rounded-[24px] bg-[#f2eef8]" />
                </div>
              ) : profileAgent ? (
                <>
                  <div
                    className="rounded-[28px] border border-[#ede6f7] p-4"
                    style={{
                      background:
                        profileAgent.hierarchy_level === "cto"
                          ? "linear-gradient(180deg,#faf7ff 0%,#ffffff 100%)"
                          : `linear-gradient(180deg,${
                              (departmentStyles[profileAgent.department] ?? departmentStyles.engineering).accent
                            }14 0%,#ffffff 100%)`,
                    }}
                  >
                    <div
                      className="flex aspect-square items-center justify-center rounded-[24px] text-6xl font-semibold text-white"
                      style={{
                        background:
                          profileAgent.hierarchy_level === "cto"
                            ? "linear-gradient(135deg,#7c5cff,#b6a1ff)"
                            : `linear-gradient(135deg,${
                                (departmentStyles[profileAgent.department] ?? departmentStyles.engineering).accent
                              },color-mix(in srgb,${
                                (departmentStyles[profileAgent.department] ?? departmentStyles.engineering).accent
                              } 62%, white 38%))`,
                      }}
                    >
                      {getInitials(profileAgent.name)}
                    </div>

                    <div className="mt-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[30px] font-semibold tracking-tight text-[#1f1638]">
                          {profileAgent.name}
                        </h3>
                        <p className="mt-1 text-lg text-[#675f7e]">{formatLabel(profileAgent.role)}</p>
                        {profileAgent.pronouns ? (
                          <p className="mt-1 text-sm text-[#7a7390]">{profileAgent.pronouns}</p>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          (departmentStyles[profileAgent.department] ?? departmentStyles.engineering).chip
                        }`}
                      >
                        {(departmentStyles[profileAgent.department] ?? departmentStyles.engineering).label}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[22px] border border-[#ece7f5] bg-[#faf8fd] px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#7a7390]">
                        <CalendarDays size={14} />
                        Start date
                      </div>
                      <p className="mt-2 text-sm font-medium text-[#1f1638]">
                        {formatDate(profileAgent.start_date)}
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-[#ece7f5] bg-[#faf8fd] px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#7a7390]">
                        <Clock3 size={14} />
                        Local time
                      </div>
                      <p className="mt-2 text-sm font-medium text-[#1f1638]">
                        {formatLocalTime(profileAgent.timezone)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[24px] border border-[#ece7f5] bg-white px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#7a7390]">Profile</p>
                    <p className="mt-2 text-sm leading-6 text-[#4e4762]">
                      {profileAgent.description ?? profileAgent.current_focus ?? "Standing by for new delegation."}
                    </p>
                  </div>

                  <div className="mt-5 rounded-[24px] border border-[#ece7f5] bg-white px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#7a7390]">Current focus</p>
                    <p className="mt-2 text-sm leading-6 text-[#4e4762]">
                      {profileAgent.current_focus || "Standing by for new delegation."}
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <div className="rounded-[22px] border border-[#ece7f5] bg-[#faf8fd] px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#7a7390]">
                        <Mail size={14} />
                        Email
                      </div>
                      <p className="mt-2 text-sm font-medium text-[#1f1638]">
                        {profileAgent.email ?? "Unavailable"}
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-[#ece7f5] bg-[#faf8fd] px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#7a7390]">
                        <MapPin size={14} />
                        Location
                      </div>
                      <p className="mt-2 text-sm font-medium text-[#1f1638]">
                        {profileAgent.location ?? "Unavailable"}
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-[#ece7f5] bg-[#faf8fd] px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#7a7390]">
                        <Users size={14} />
                        Reports to
                      </div>
                      <p className="mt-2 text-sm font-medium text-[#1f1638]">
                        {profileManager?.name ?? topOwnerLabel}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-xs text-[#7a7390]">
                      <span>Daily token usage</span>
                      <span>{usagePercent(profileAgent)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#ebe6f6]">
                      <div
                        className="h-full rounded-full transition-[width] duration-200 ease-out"
                        style={{
                          width: `${Math.min(usagePercent(profileAgent), 100)}%`,
                          background:
                            profileAgent.hierarchy_level === "cto"
                              ? "linear-gradient(90deg,#7c5cff,#b6a1ff)"
                              : `linear-gradient(90deg,${
                                  (departmentStyles[profileAgent.department] ?? departmentStyles.engineering).accent
                                },color-mix(in srgb,${
                                  (departmentStyles[profileAgent.department] ?? departmentStyles.engineering).accent
                                } 58%, white 42%))`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#7a7390]">Recent activity</p>
                      <span className="text-xs text-[#7a7390]">
                        {profileAgent.recent_activity?.length ?? 0} item
                        {(profileAgent.recent_activity?.length ?? 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {(profileAgent.recent_activity ?? []).length > 0 ? (
                        profileAgent.recent_activity?.map((activity) => (
                          <div
                            key={activity.activity_id}
                            className="rounded-[22px] border border-[#ece7f5] bg-white px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-[#1f1638]">{activity.title}</p>
                              <span className="rounded-full bg-[#f6f3fb] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[#675f7e]">
                                {activity.state}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[#4e4762]">{activity.detail}</p>
                            <p className="mt-2 text-xs text-[#7a7390]">{formatDate(activity.started_at)}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-[#ddd6eb] bg-white px-4 py-5 text-sm text-[#675f7e]">
                          No recent activity has been recorded for this agent yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {detailError ? <p className="mt-4 text-sm text-[#9b3d6b]">{detailError}</p> : null}
                </>
              ) : null}
            </div>

            {profileAgent ? (
              <div className="border-t border-[#f0ebf8] px-5 py-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setChatAgent(
                        profileAgent
                          ? {
                              ...profileAgent,
                              agent_id: profileAgent.archetype_agent_id ?? profileAgent.agent_id,
                            }
                          : null,
                      )
                    }
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2.5 text-xs font-semibold text-[var(--brand-dark)] transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_12%,white)]"
                  >
                    <MessageSquare size={13} />
                    Open Chat
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      profileAgent.hierarchy_level === "cto" ? navigate("/cto-call") : navigate("/hq")
                    }
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#c3d0f8] bg-[#ebf0ff] px-3 py-2.5 text-xs font-semibold text-[#1b47d6] transition-colors hover:bg-[#dce5ff]"
                  >
                    {profileAgent.hierarchy_level === "cto" ? <Phone size={13} /> : <Building2 size={13} />}
                    {profileAgent.hierarchy_level === "cto" ? "Video Call" : "Visit HQ"}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </aside>

      {chatAgent && <AgentChatPanel agent={chatAgent} onClose={() => setChatAgent(null)} />}
    </div>
  );
}
