import { useEffect, useRef, useState } from "react";
import { AlertTriangle, PhoneOff, Zap } from "lucide-react";
import { communicationApi } from "../api/client";
import { useProjectStore } from "../store/projectStore";
import type { Project } from "../store/projectStore";

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
    <div style={{ height: 4, flex: 1, background: "#EEF2FB", borderRadius: 10, overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          borderRadius: 10,
          background: crit ? "linear-gradient(90deg,#EF4444,#DC2626)"
                           : pct >= 60 ? "linear-gradient(90deg,#F59E0B,#D97706)"
                           : "linear-gradient(90deg,#3B82F6,#1B47D6)",
          transition: "width 0.4s cubic-bezier(0.23,1,0.32,1)",
        }}
      />
    </div>
  );
}

// ── Pre-call animated screen ─────────────────────────────────────
function CallReadyScreen({
  ctx,
  currentProject,
  projects,
  setCurrentProject,
  onBegin,
  loading,
}: {
  ctx: CTOContext | null;
  currentProject: Project | null;
  projects: Project[];
  setCurrentProject: (p: Project | null) => void;
  onBegin: () => void;
  loading: boolean;
}) {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 60px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse 70% 50% at 50% 30%, rgba(27,71,214,0.05) 0%, transparent 70%), #F5F8FE",
        padding: "48px 24px",
        animation: "slide-up 0.35s var(--ease-out) both",
      }}
    >
      {/* ── Avatar + halo ─────────────────────────────────────── */}
      <div style={{ position: "relative", marginBottom: 36 }}>
        {/* Single refined halo ring */}
        <div
          style={{
            position: "absolute",
            inset: -18,
            borderRadius: "50%",
            border: "1.5px solid rgba(27,71,214,0.18)",
            animation: "cto-halo 3.6s cubic-bezier(0.23,1,0.32,1) infinite",
            pointerEvents: "none",
          }}
        />

        {/* Avatar */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            background: "linear-gradient(145deg, #1539B8 0%, #1B47D6 45%, #3B82F6 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 1,
            animation: "cto-avatar-breathe 4s ease-in-out infinite",
            userSelect: "none",
          }}
        >
          <span
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 22,
              fontStyle: "italic",
              fontWeight: 400,
              color: "rgba(255,255,255,0.92)",
              letterSpacing: "0.02em",
            }}
          >
            CTO
          </span>
        </div>

        {/* Online indicator */}
        <div
          style={{
            position: "absolute",
            bottom: 5,
            right: 5,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#059669",
            border: "2.5px solid #F5F8FE",
            zIndex: 2,
          }}
        />
      </div>

      {/* ── Identity ──────────────────────────────────────────── */}
      <h1
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 30,
          fontWeight: 400,
          color: "#0C1526",
          margin: "0 0 6px",
          letterSpacing: "-0.02em",
          textAlign: "center",
        }}
      >
        CTO Agent
      </h1>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#1B47D6",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          margin: "0 0 14px",
        }}
      >
        AI Chief Technology Officer · Tavus
      </p>
      <p
        style={{
          fontSize: 14,
          color: "#4D5E80",
          textAlign: "center",
          maxWidth: 380,
          lineHeight: 1.7,
          margin: "0 0 36px",
          fontWeight: 400,
        }}
      >
        Your CTO will interview you about what you want to build — requirements,
        team structure, budget, and timeline — then stand up your AI engineering team.
      </p>

      {/* ── Warning badge ─────────────────────────────────────── */}
      {(ctx?.warnings.length ?? 0) > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 24,
            marginBottom: 28,
          }}
        >
          <AlertTriangle size={13} style={{ color: "#D97706", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "#92400E", fontWeight: 600 }}>
            {ctx!.warnings.length} agent{ctx!.warnings.length > 1 ? "s" : ""} near budget — CTO will be briefed
          </span>
        </div>
      )}

      {/* ── Answer button ─────────────────────────────────────── */}
      <button
        onClick={onBegin}
        disabled={loading}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 36px",
          background: loading ? "#4D5E80" : "#1B47D6",
          border: "none",
          borderRadius: 12,
          color: "#FFFFFF",
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? "default" : "pointer",
          letterSpacing: "-0.01em",
          animation: loading ? "none" : "cto-btn-glow 3s ease-in-out infinite",
          transition: "background 0.2s ease, transform 0.12s ease",
          fontFamily: "inherit",
          marginBottom: 10,
        }}
        onMouseEnter={(e) => {
          if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#1539B8";
        }}
        onMouseLeave={(e) => {
          if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#1B47D6";
        }}
        onMouseDown={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)";
        }}
        onMouseUp={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        }}
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
      <p style={{ fontSize: 11, color: "#8A96B0", margin: 0 }}>
        Face-to-face · Powered by Tavus CVI
      </p>

      {/* ── Optional project reference ─────────────────────────── */}
      {projects.length > 0 && (
        <div
          style={{
            marginTop: 44,
            width: "100%",
            maxWidth: 440,
            padding: "20px",
            background: "#FFFFFF",
            border: "1px solid #E2E8F4",
            borderRadius: 14,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#8A96B0",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              margin: "0 0 12px",
            }}
          >
            Reference an existing project
          </p>
          <p style={{ fontSize: 12, color: "#4D5E80", margin: "0 0 14px", lineHeight: 1.5 }}>
            Optional — select a project to give the CTO context for an escalation call.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {projects.map((p: Project) => {
              const active = currentProject?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setCurrentProject(active ? null : p)}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    color: active ? "#1B47D6" : "#4D5E80",
                    background: active ? "#EBF0FF" : "#F5F8FE",
                    border: `1px solid ${active ? "#C3D0F8" : "#E2E8F4"}`,
                    borderRadius: 20,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    fontFamily: "inherit",
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
          {currentProject && (
            <p style={{ fontSize: 11, color: "#1B47D6", margin: "10px 0 0", fontWeight: 600 }}>
              ✓ CTO briefed on {currentProject.name}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function CTOCallView() {
  const { currentProject, projects, fetchProjects, setCurrentProject } = useProjectStore();
  const [callUrl, setCallUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState<CTOContext | null>(null);
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
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginInterview = async () => {
    setLoading(true);
    try {
      const res = await communicationApi.ctoCall({
        project_id: currentProject?.id,
        topic: currentProject
          ? `Escalation call — project: ${currentProject.name}`
          : "New project kickoff — interview me about what I want to build",
      });
      setCallUrl(res.data.conversation_url);
    } catch {
      setCallUrl("https://meet.sweaas.dev/demo");
    }
    setLoading(false);
  };

  const totalPct = ctx?.total_token_pct ?? 0;
  const warnings = ctx?.warnings ?? [];

  // ── In-call view ──────────────────────────────────────────────
  if (callUrl) {
    return (
      <div
        style={{
          display: "flex",
          height: "calc(100vh - 60px)",
          background: "#F5F8FE",
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid #E2E8F4",
          boxShadow: "var(--shadow-lg)",
          animation: "fade-in 0.25s ease both",
        }}
      >
        {/* Tavus iframe */}
        <div style={{ flex: "1 1 0", position: "relative", background: "#0C1526" }}>
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 10,
              background: "rgba(255,255,255,0.96)",
              backdropFilter: "blur(8px)",
              border: "1px solid #E2E8F4",
              borderRadius: 8,
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: 7,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#059669",
                boxShadow: "0 0 0 2px rgba(5,150,105,0.25)",
              }}
            />
            <span style={{ fontSize: 11, color: "#0C1526", fontWeight: 700 }}>
              {currentProject ? `ESCALATION · ${currentProject.name.toUpperCase()}` : "CTO INTERVIEW · LIVE"}
            </span>
          </div>
          <iframe
            src={callUrl}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            allow="camera; microphone; autoplay; display-capture"
            title="CTO Video Call"
          />
        </div>

        {/* Live feed panel — white */}
        <div
          style={{
            width: 296,
            flexShrink: 0,
            background: "#FFFFFF",
            borderLeft: "1px solid #E2E8F4",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: "16px 18px 14px",
              borderBottom: "1px solid #EEF2FB",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Zap size={13} style={{ color: "#1B47D6" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#1B47D6", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Live Backend
                </span>
              </div>
              <button
                onClick={() => setCallUrl(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 7,
                  color: "#DC2626",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <PhoneOff size={11} /> End
              </button>
            </div>

            {/* Fleet token bar */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8A96B0", marginBottom: 6, fontWeight: 500 }}>
              <span>Fleet token burn</span>
              <span style={{ color: totalPct >= 85 ? "#DC2626" : "#1B47D6", fontWeight: 700 }}>
                {totalPct}%
              </span>
            </div>
            <MiniBar pct={totalPct} />
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
            {/* Warnings */}
            {warnings.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: "#D97706", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 8px" }}>
                  Budget Alerts
                </p>
                {warnings.map((w) => (
                  <div key={w.agent_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, marginBottom: 5 }}>
                    <AlertTriangle size={11} style={{ color: "#D97706", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#92400E", flex: 1, fontWeight: 500 }}>{w.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#D97706" }}>{w.token_pct}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* Active tasks */}
            {(ctx?.active_tasks ?? []).length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: "#8A96B0", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 8px" }}>
                  Running Now
                </p>
                {ctx!.active_tasks.map((t) => (
                  <div key={t.agent_id + t.task} style={{ padding: "8px 10px", borderLeft: `3px solid ${deptAccent[t.department] ?? "#1B47D6"}`, background: "#F5F8FE", borderRadius: "0 8px 8px 0", marginBottom: 6 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#0C1526", margin: 0 }}>{t.agent_name}</p>
                    <p style={{ fontSize: 11, color: "#8A96B0", margin: "2px 0 0" }}>{t.task}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Agent burn rates */}
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, color: "#8A96B0", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 10px" }}>
                Agent Burn
              </p>
              {(ctx?.agents ?? []).map((a) => (
                <div key={a.agent_id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusDot[a.status] ?? "#8A96B0", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#4D5E80", width: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0, fontWeight: 500 }}>
                    {a.name}
                  </span>
                  <MiniBar pct={a.token_pct} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: a.token_pct >= 85 ? "#DC2626" : "#4D5E80", width: 28, textAlign: "right", flexShrink: 0 }}>
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
    <CallReadyScreen
      ctx={ctx}
      currentProject={currentProject}
      projects={projects}
      setCurrentProject={setCurrentProject}
      onBegin={beginInterview}
      loading={loading}
    />
  );
}
