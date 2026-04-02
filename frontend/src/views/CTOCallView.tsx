import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  PhoneOff,
  Plus,
  Search,
  Zap,
} from "lucide-react";
import { communicationApi, projectApi } from "../api/client";
import { useProjectStore } from "../store/projectStore";
import type { Project } from "../store/projectStore";

interface TavusReplica {
  replica_id: string;
  replica_name: string;
  thumbnail_video_url: string;
  model_name: string;
}

interface AgentCtx {
  agent_id: string;
  name: string;
  department: string;
  status: string;
  token_pct: number;
}
interface ActiveTask {
  agent_id: string;
  agent_name: string;
  department: string;
  task: string;
}
interface CTOContext {
  agents: AgentCtx[];
  warnings: { agent_id: string; name: string; token_pct: number }[];
  active_tasks: ActiveTask[];
  total_token_pct: number;
}

const deptAccent: Record<string, string> = {
  engineering: "#1B47D6",
  marketing:   "#D97706",
  product:     "#7C3AED",
  support:     "#059669",
};

const statusDot: Record<string, string> = {
  active:  "#059669",
  warning: "#D97706",
  paused:  "#8A96B0",
  strike:  "#DC2626",
};

// ── Small token bar ──────────────────────────────────────────────
function MiniBar({ pct }: { pct: number }) {
  const crit = pct >= 85;
  return (
    <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#ece7f5]">
      <div
        style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          borderRadius: 9999,
          background: crit
            ? "linear-gradient(90deg,#EF4444,#DC2626)"
            : pct >= 60
            ? "linear-gradient(90deg,#F59E0B,#D97706)"
            : "linear-gradient(90deg,var(--brand),var(--brand-dark))",
          transition: "width 0.4s cubic-bezier(0.23,1,0.32,1)",
        }}
      />
    </div>
  );
}

// ── Single lazy-loading replica video tile ────────────────────────
function ReplicaVideoTile({
  replica,
  active,
  onSelect,
}: {
  replica: TavusReplica;
  active: boolean;
  onSelect: (r: TavusReplica) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <button
      title={`${replica.replica_name} (${replica.model_name})`}
      onMouseEnter={() => videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => {
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        }
      }}
      onClick={() => onSelect(replica)}
      className={[
        "flex flex-col items-center gap-1.5 rounded-[12px] border p-1.5 transition-all cursor-pointer",
        active
          ? "border-[var(--brand)] bg-[var(--brand-chip)]"
          : "border-[#ece7f5] bg-[#f8f6fc] hover:border-[var(--brand-border)] hover:bg-[var(--brand-surface)]",
      ].join(" ")}
    >
      <div
        className={[
          "w-11 h-11 rounded-[9px] overflow-hidden shrink-0",
          active ? "ring-2 ring-[var(--brand)]" : "",
        ].join(" ")}
      >
        <video
          ref={videoRef}
          src={replica.thumbnail_video_url}
          preload="none"
          muted
          loop
          playsInline
          className="w-full h-full object-cover"
        />
      </div>
      <span
        className={[
          "text-[9px] font-medium text-center leading-tight w-full truncate block px-0.5",
          active ? "text-[var(--brand)] font-semibold" : "text-[#7a7390]",
        ].join(" ")}
      >
        {replica.replica_name}
      </span>
    </button>
  );
}

// ── Replica picker ────────────────────────────────────────────────
function ReplicaPicker({
  replicas,
  selected,
  onSelect,
}: {
  replicas: TavusReplica[];
  selected: TavusReplica | null;
  onSelect: (r: TavusReplica | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  if (replicas.length === 0) return null;

  const filtered = query.trim()
    ? replicas.filter((r) =>
        r.replica_name.toLowerCase().includes(query.toLowerCase()),
      )
    : replicas;

  return (
    <div className="mt-7 w-full max-w-[440px] overflow-hidden rounded-[18px] border border-[#ece7f5] bg-white shadow-sm">
      {/* Header toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-[var(--brand-surface)] transition-colors"
      >
        <div className="flex items-center gap-3">
          {selected ? (
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border-2 border-[var(--brand-border)]">
              <video
                src={selected.thumbnail_video_url}
                autoPlay
                muted
                loop
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div
              className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold italic text-white"
              style={{ background: "linear-gradient(135deg,var(--brand-dark),var(--brand))" }}
            >
              CTO
            </div>
          )}
          <div className="text-left">
            <p className="text-[10px] font-bold text-[#7a7390] uppercase tracking-[0.1em]">CTO Face</p>
            <p className="text-[13px] font-semibold text-[#1f1638]">
              {selected ? selected.replica_name : "Default — choose a face"}
            </p>
          </div>
        </div>
        {open
          ? <ChevronUp size={14} className="text-[#7a7390] shrink-0" />
          : <ChevronDown size={14} className="text-[#7a7390] shrink-0" />
        }
      </button>

      {/* Grid — only mounted when open */}
      {open && (
        <div className="border-t border-[#ece7f5] px-3 pb-3">
          {/* Search */}
          <div className="relative my-2.5">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7a7390] pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search replicas…"
              className="w-full rounded-[10px] border border-[#ece7f5] bg-[#f8f6fc] pl-7 pr-3 py-1.5 text-[12px] text-[#1f1638] outline-none focus:border-[var(--brand-border)] placeholder:text-[#7a7390]"
            />
          </div>

          <div
            className="grid gap-1.5 overflow-y-auto"
            style={{ gridTemplateColumns: "repeat(5,1fr)", maxHeight: 300 }}
          >
            {/* Default tile */}
            <button
              onClick={() => { onSelect(null); setOpen(false); setQuery(""); }}
              className={[
                "flex flex-col items-center gap-1.5 rounded-[12px] border p-1.5 transition-all cursor-pointer",
                selected === null
                  ? "border-[var(--brand)] bg-[var(--brand-chip)]"
                  : "border-[#ece7f5] bg-[#f8f6fc] hover:border-[var(--brand-border)]",
              ].join(" ")}
            >
              <div
                className="w-11 h-11 rounded-[9px] flex items-center justify-center text-[11px] font-bold italic text-white"
                style={{ background: "linear-gradient(135deg,var(--brand-dark),var(--brand))" }}
              >
                CTO
              </div>
              <span className={`text-[9px] font-medium ${selected === null ? "text-[var(--brand)]" : "text-[#7a7390]"}`}>
                Default
              </span>
            </button>

            {filtered.map((r) => (
              <ReplicaVideoTile
                key={r.replica_id}
                replica={r}
                active={selected?.replica_id === r.replica_id}
                onSelect={(replica) => { onSelect(replica); setOpen(false); setQuery(""); }}
              />
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="py-4 text-center text-[12px] text-[#7a7390]">No replicas match "{query}"</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pre-call screen ───────────────────────────────────────────────
function CallReadyScreen({
  ctx,
  currentProject,
  projects,
  setCurrentProject,
  onBegin,
  loading,
  error,
  replicas,
  selectedReplica,
  setSelectedReplica,
}: {
  ctx: CTOContext | null;
  currentProject: Project | null;
  projects: Project[];
  setCurrentProject: (p: Project | null) => void;
  onBegin: () => void;
  loading: boolean;
  error: string | null;
  replicas: TavusReplica[];
  selectedReplica: TavusReplica | null;
  setSelectedReplica: (r: TavusReplica | null) => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-60px)] flex-col items-center justify-center px-6 py-12 animate-[slide-up_0.35s_var(--ease-out)_both]"
      style={{ background: "radial-gradient(ellipse 70% 50% at 50% 30%, var(--brand-surface) 0%, transparent 70%), #f8f6fc" }}
    >
      {/* Avatar + halo */}
      <div className="relative mb-9">
        <div
          className="absolute inset-[-18px] rounded-full pointer-events-none"
          style={{
            border: "1.5px solid var(--brand-border)",
            animation: "cto-halo 3.6s cubic-bezier(0.23,1,0.32,1) infinite",
          }}
        />
        <div
          className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full select-none"
          style={{
            background: "linear-gradient(145deg, var(--brand-dark) 0%, var(--brand) 60%, color-mix(in srgb, var(--brand) 70%, white) 100%)",
            animation: "cto-avatar-breathe 4s ease-in-out infinite",
          }}
        >
          <span className="font-['Instrument_Serif',Georgia,serif] text-[22px] italic font-normal text-white/90 tracking-[0.02em]">
            CTO
          </span>
        </div>
        <div
          className="absolute bottom-[5px] right-[5px] z-20 h-4 w-4 rounded-full border-[2.5px] border-[#f8f6fc]"
          style={{ background: "#059669" }}
        />
      </div>

      {/* Identity */}
      <h1 className="font-['Instrument_Serif',Georgia,serif] text-[30px] font-normal text-[#1f1638] m-0 mb-1.5 tracking-[-0.02em] text-center">
        CTO Agent
      </h1>
      <p className="text-[11px] font-semibold text-[var(--brand)] tracking-[0.1em] uppercase mb-3.5">
        AI Chief Technology Officer · Tavus
      </p>
      <p className="text-[14px] text-[#675f7e] text-center max-w-[380px] leading-[1.7] mb-9 font-normal">
        Your CTO will interview you about what you want to build — requirements,
        team structure, budget, and timeline — then stand up your AI engineering team.
      </p>

      {/* Warning badge */}
      {(ctx?.warnings.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full mb-7">
          <AlertTriangle size={13} className="text-amber-600 shrink-0" />
          <span className="text-[12px] text-amber-800 font-semibold">
            {ctx!.warnings.length} agent{ctx!.warnings.length > 1 ? "s" : ""} near budget — CTO will be briefed
          </span>
        </div>
      )}

      {/* Begin button */}
      <button
        onClick={onBegin}
        disabled={loading}
        className="flex items-center gap-2.5 px-9 py-3.5 rounded-[12px] text-white text-[14px] font-bold tracking-[-0.01em] mb-2.5 transition-all disabled:opacity-60 disabled:cursor-default"
        style={{
          background: loading ? "#7a7390" : "var(--brand)",
          animation: loading ? "none" : "cto-btn-glow 3s ease-in-out infinite",
        }}
        onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-dark)"; }}
        onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "var(--brand)"; }}
        onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
        onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
      >
        {loading ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
              </path>
            </svg>
            Connecting…
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.77 11a19.79 19.79 0 01-3.07-8.67A2 2 0 012.68 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.65a16 16 0 006.44 6.44l1.02-1.02a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
            Begin Interview
          </>
        )}
      </button>
      <p className="text-[11px] text-[#7a7390] m-0">Face-to-face · Powered by Tavus CVI</p>

      {error && (
        <div className="mt-3.5 px-4 py-2.5 bg-red-50 border border-red-200 rounded-[10px] text-[13px] text-red-600 font-medium max-w-[380px] text-center">
          {error}
        </div>
      )}

      {/* Optional project reference */}
      {projects.length > 0 && (
        <div className="mt-11 w-full max-w-[440px] p-5 bg-white border border-[#ece7f5] rounded-[18px] shadow-sm">
          <p className="text-[11px] font-bold text-[#7a7390] tracking-[0.08em] uppercase m-0 mb-3">
            Reference an existing project
          </p>
          <p className="text-[12px] text-[#675f7e] m-0 mb-3.5 leading-[1.5]">
            Optional — select a project to give the CTO context for an escalation call.
          </p>
          <div className="flex flex-wrap gap-2">
            {projects.map((p: Project) => {
              const active = currentProject?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setCurrentProject(active ? null : p)}
                  className="px-3.5 py-1.5 rounded-full text-[12px] border transition-all"
                  style={{
                    fontWeight: active ? 700 : 500,
                    color: active ? "var(--brand)" : "#675f7e",
                    background: active ? "var(--brand-chip)" : "#f8f6fc",
                    borderColor: active ? "var(--brand-border)" : "#ece7f5",
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
          {currentProject && (
            <p className="text-[11px] text-[var(--brand)] mt-2.5 mb-0 font-semibold">
              ✓ CTO briefed on {currentProject.name}
            </p>
          )}
        </div>
      )}

      <ReplicaPicker
        replicas={replicas}
        selected={selectedReplica}
        onSelect={setSelectedReplica}
      />
    </div>
  );
}

// ── Post-call Create Project modal ────────────────────────────────
function CreateProjectModal({
  defaultName,
  onClose,
  onCreated,
}: {
  defaultName: string;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const { fetchProjects, setCurrentProject } = useProjectStore();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [budgetUsd, setBudgetUsd] = useState(2000);
  const [timelineWeeks, setTimelineWeeks] = useState(8);
  const [step, setStep] = useState<"form" | "creating" | "done">("form");
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [stepLabel, setStepLabel] = useState("");

  const create = async () => {
    setStep("creating");
    setStepLabel("Creating GitHub repository…");
    try {
      const res = await projectApi.create({
        name,
        description,
        github_username: githubUsername || undefined,
        monthly_budget_usd: budgetUsd,
        timeline_weeks: timelineWeeks,
        departments: ["engineering", "product", "marketing"],
      });
      const proj: Project = res.data;
      setStepLabel("Configuring agent team…");
      await projectApi.patchConfig(proj.id, {
        monthly_budget_usd: budgetUsd,
        timeline_weeks: timelineWeeks,
        departments: ["engineering", "product", "marketing"],
        max_agents: Math.max(3, Math.floor(budgetUsd / 500)),
        github_username: githubUsername || undefined,
      });
      setCreatedProject(proj);
      setStep("done");
      await fetchProjects();
      setCurrentProject(proj);
    } catch {
      setStep("form");
    }
  };

  const inputClass = "w-full px-3.5 py-2.5 text-[14px] border border-[#ece7f5] rounded-[10px] outline-none text-[#1f1638] font-[inherit] box-border focus:border-[var(--brand-border)]";

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center animate-[fade-in_0.2s_ease_both]"
      style={{ background: "rgba(31,22,56,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[480px] rounded-[22px] bg-white p-8 shadow-[0_32px_80px_rgba(31,22,56,0.25)] animate-[slide-up_0.3s_cubic-bezier(0.23,1,0.32,1)_both]">
        {step === "creating" && (
          <div className="py-6 text-center">
            <Loader2 size={40} className="mx-auto mb-5 text-[var(--brand)] animate-spin" />
            <p className="text-[16px] font-semibold text-[#1f1638] m-0 mb-2">Setting up your project</p>
            <p className="text-[13px] text-[#7a7390] m-0">{stepLabel}</p>
          </div>
        )}

        {step === "done" && createdProject && (
          <div className="py-6 text-center">
            <CheckCircle size={40} className="mx-auto mb-5 text-emerald-500" />
            <p className="text-[18px] font-bold text-[#1f1638] m-0 mb-2">{createdProject.name} is live</p>
            <p className="text-[13px] text-[#675f7e] m-0 mb-6">GitHub repo created, agents configured.</p>
            {createdProject.github_repo_url && (
              <a
                href={createdProject.github_repo_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] text-[var(--brand)] font-semibold no-underline mb-6"
              >
                <ExternalLink size={13} /> View on GitHub
              </a>
            )}
            <br />
            <button
              onClick={() => onCreated(createdProject)}
              className="px-7 py-3 rounded-[10px] text-white text-[14px] font-bold font-[inherit] cursor-pointer border-none"
              style={{ background: "var(--brand)" }}
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {step === "form" && (
          <>
            <div className="flex items-center gap-2.5 mb-6">
              <Plus size={18} className="text-[var(--brand)]" />
              <h2 className="text-[18px] font-bold text-[#1f1638] m-0">Create Project</h2>
            </div>
            <p className="text-[13px] text-[#675f7e] m-0 mb-6 leading-[1.6]">
              Your CTO just learned what you want to build. Let's set it up — GitHub repo, Sentry, and your agent team will be provisioned automatically.
            </p>

            {[
              { label: "Project name", value: name, set: setName, placeholder: "My Startup" },
              { label: "Description", value: description, set: setDescription, placeholder: "What are you building?" },
              { label: "Your GitHub username (optional)", value: githubUsername, set: setGithubUsername, placeholder: "github-handle" },
            ].map(({ label, value, set, placeholder }) => (
              <div key={label} className="mb-4">
                <label className="block text-[12px] font-semibold text-[#675f7e] mb-1.5">{label}</label>
                <input
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={placeholder}
                  className={inputClass}
                />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3 mb-7">
              <div>
                <label className="block text-[12px] font-semibold text-[#675f7e] mb-1.5">Monthly budget (USD)</label>
                <input type="number" value={budgetUsd} onChange={(e) => setBudgetUsd(Number(e.target.value))} className={inputClass} />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#675f7e] mb-1.5">Timeline (weeks)</label>
                <input type="number" value={timelineWeeks} onChange={(e) => setTimelineWeeks(Number(e.target.value))} className={inputClass} />
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-[#f8f6fc] border border-[#ece7f5] rounded-[10px] text-[14px] font-semibold text-[#675f7e] cursor-pointer font-[inherit]"
              >
                Maybe later
              </button>
              <button
                onClick={create}
                disabled={!name.trim()}
                className="flex-[2] py-3 rounded-[10px] text-[14px] font-bold text-white border-none cursor-pointer font-[inherit] disabled:opacity-60 disabled:cursor-default"
                style={{ background: "var(--brand)" }}
              >
                Create Project
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function CTOCallView() {
  const { currentProject, projects, fetchProjects, setCurrentProject } = useProjectStore();
  const [callUrl, setCallUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<CTOContext | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [replicas, setReplicas] = useState<TavusReplica[]>([]);
  const [selectedReplica, setSelectedReplica] = useState<TavusReplica | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCtx = async () => {
    try {
      const res = await communicationApi.ctoContext();
      setCtx(res.data);
    } catch { /* dev */ }
  };

  useEffect(() => {
    fetchProjects();
    fetchCtx();
    pollRef.current = setInterval(fetchCtx, 10_000);
    communicationApi.replicas().then((res) => {
      setReplicas(res.data.replicas ?? []);
    }).catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginInterview = async () => {
    setLoading(true);
    setCallError(null);
    try {
      const res = await communicationApi.ctoCall({
        project_id: currentProject?.id ?? null,
        topic: currentProject
          ? `Escalation call — project: ${currentProject.name}`
          : "New project kickoff — interview me about what I want to build",
        replica_id: selectedReplica?.replica_id ?? null,
      });
      setCallUrl(res.data.conversation_url);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to connect. Please try again.";
      setCallError(msg);
    }
    setLoading(false);
  };

  const totalPct = ctx?.total_token_pct ?? 0;
  const warnings = ctx?.warnings ?? [];

  // ── In-call view ──────────────────────────────────────────────
  if (callUrl) {
    return (
      <div
        className="flex overflow-hidden rounded-[14px] border border-[#ece7f5] animate-[fade-in_0.25s_ease_both]"
        style={{
          height: "calc(100vh - 60px)",
          background: "#f8f6fc",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Tavus iframe */}
        <div className="relative flex-1 bg-[#1f1638]">
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-[8px] border border-[#ece7f5] bg-white/96 px-3 py-1.5 shadow-sm backdrop-blur-sm">
            <div className="h-[7px] w-[7px] rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(5,150,105,0.25)]" />
            <span className="text-[11px] font-bold text-[#1f1638]">
              {currentProject ? `ESCALATION · ${currentProject.name.toUpperCase()}` : "CTO INTERVIEW · LIVE"}
            </span>
          </div>
          <iframe
            src={callUrl}
            className="block h-full w-full border-none"
            allow="camera; microphone; autoplay; display-capture"
            title="CTO Video Call"
          />
        </div>

        {/* Live feed panel */}
        <div className="flex w-[296px] shrink-0 flex-col overflow-hidden border-l border-[#ece7f5] bg-white">
          <div className="border-b border-[#ece7f5] p-4 pb-3.5">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap size={13} className="text-[var(--brand)]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--brand)]">
                  Live Backend
                </span>
              </div>
              <button
                onClick={() => { setCallUrl(null); if (!currentProject) setShowCreateModal(true); }}
                className="flex items-center gap-1.5 rounded-[7px] border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 cursor-pointer"
              >
                <PhoneOff size={11} /> End
              </button>
            </div>

            <div className="mb-1.5 flex justify-between text-[11px] text-[#7a7390] font-medium">
              <span>Fleet token burn</span>
              <span className={`font-bold ${totalPct >= 85 ? "text-red-600" : "text-[var(--brand)]"}`}>
                {totalPct}%
              </span>
            </div>
            <MiniBar pct={totalPct} />
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 px-4">
            {warnings.length > 0 && (
              <div className="mb-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-amber-600 mb-2">Budget Alerts</p>
                {warnings.map((w) => (
                  <div key={w.agent_id} className="flex items-center gap-2 rounded-[8px] border border-amber-200 bg-amber-50 px-2.5 py-1.5 mb-1.5">
                    <AlertTriangle size={11} className="text-amber-600 shrink-0" />
                    <span className="flex-1 text-[12px] text-amber-800 font-medium">{w.name}</span>
                    <span className="text-[11px] font-bold text-amber-600">{w.token_pct}%</span>
                  </div>
                ))}
              </div>
            )}

            {(ctx?.active_tasks ?? []).length > 0 && (
              <div className="mb-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#7a7390] mb-2">Running Now</p>
                {ctx!.active_tasks.map((t) => (
                  <div
                    key={t.agent_id + t.task}
                    className="mb-1.5 rounded-r-[8px] bg-[#f8f6fc] py-2 pl-2.5"
                    style={{ borderLeft: `3px solid ${deptAccent[t.department] ?? "var(--brand)"}` }}
                  >
                    <p className="text-[12px] font-semibold text-[#1f1638] m-0">{t.agent_name}</p>
                    <p className="text-[11px] text-[#7a7390] m-0 mt-0.5">{t.task}</p>
                  </div>
                ))}
              </div>
            )}

            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#7a7390] mb-2.5">Agent Burn</p>
              {(ctx?.agents ?? []).map((a) => (
                <div key={a.agent_id} className="mb-2 flex items-center gap-2">
                  <div
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: statusDot[a.status] ?? "#7a7390" }}
                  />
                  <span className="w-24 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-[#675f7e]">
                    {a.name}
                  </span>
                  <MiniBar pct={a.token_pct} />
                  <span className={`w-7 shrink-0 text-right text-[10px] font-bold ${a.token_pct >= 85 ? "text-red-600" : "text-[#675f7e]"}`}>
                    {a.token_pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <CallReadyScreen
        ctx={ctx}
        currentProject={currentProject}
        projects={projects}
        setCurrentProject={setCurrentProject}
        onBegin={beginInterview}
        loading={loading}
        error={callError}
        replicas={replicas}
        selectedReplica={selectedReplica}
        setSelectedReplica={setSelectedReplica}
      />
      {showCreateModal && (
        <CreateProjectModal
          defaultName="My Project"
          onClose={() => setShowCreateModal(false)}
          onCreated={(proj) => {
            setShowCreateModal(false);
            setCurrentProject(proj);
            window.location.href = "/dashboard";
          }}
        />
      )}
    </>
  );
}
