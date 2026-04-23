/**
 * Unified Headquarters view — the single home for the 3D experience.
 *
 * The HQ model is the Blender EEVEE export (Building7EEVEE.glb) rendered by
 * WelcomeHWCanvas + WelcomeHWScene with real seated workers at each desk.
 *
 * Modes:
 *   Stepper (default) — press Next to advance through rooms; press "Enter
 *                       room" to drill into individual workstations. Each
 *                       transition is a smoothly damped framing of the area.
 *   Overview          — free orbit / zoom / pan for exploration.
 *
 * A right-edge collapsible side panel (HQSidePanel) shows who's in each
 * room and which person is currently in frame. Clicking any person jumps
 * the camera to their workstation; double-clicking opens their chat panel.
 */
import { Component, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, LogIn, LogOut, Phone, Users } from "lucide-react";
import WelcomeHWCanvas from "./WelcomeHWCanvas";
import AgentChatPanel from "./ui/AgentChatPanel";
import TokenBurnOverlay from "./ui/TokenBurnOverlay";
import HQSidePanel from "./HQSidePanel";
import { useAgentStore, type Agent } from "../store/agentStore";
import { useProjectStore } from "../store/projectStore";
import { useTeamOnboardingStore } from "../store/teamOnboardingStore";
import { mergeAgentsWithTeamConfig } from "../utils/teamOnboarding";
import { assignAgentsToDesks, buildStops, ROOMS } from "./tourStops";

type Mode = "stepper" | "overview";

const MODE_LABELS: Record<Mode, string> = {
  stepper: "Guided tour",
  overview: "Free look",
};

class SceneErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode; onError?: (error: Error) => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) {
    this.props.onError?.(error);
    console.error("HQ scene error:", error);
  }
  render() {
    if (this.state.hasError) return <>{this.props.fallback}</>;
    return this.props.children;
  }
}

function SceneFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "linear-gradient(180deg,#f7f5fb 0%,#ece7f5 100%)",
        color: "#1f1638",
        padding: 24,
      }}
    >
      <AlertTriangle size={32} color="#D97706" />
      <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>The 3D scene failed to load.</p>
      <p style={{ fontSize: 12, color: "#7a7390", margin: 0, maxWidth: 360, textAlign: "center", lineHeight: 1.5 }}>
        WebGL may be unavailable or the building model didn't download. Click retry, or refresh.
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: "8px 16px",
          borderRadius: 10,
          border: "1px solid rgba(195,208,248,0.9)",
          background: "#1B47D6",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

export default function WelcomeHWView() {
  const { agents, fetchAgents } = useAgentStore();
  const { config, fetchConfig } = useTeamOnboardingStore();
  const { currentProject } = useProjectStore();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("stepper");
  const [rawStopIndex, setStopIndex] = useState(0);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [sceneEpoch, setSceneEpoch] = useState(0);

  useEffect(() => {
    fetchAgents(currentProject?.id);
    fetchConfig();
  }, [fetchAgents, fetchConfig, currentProject?.id]);

  const displayAgents = useMemo(
    () => mergeAgentsWithTeamConfig(agents, config),
    [agents, config],
  );

  const assignments = useMemo(() => assignAgentsToDesks(displayAgents), [displayAgents]);
  const stops = useMemo(() => buildStops(assignments), [assignments]);

  // Clamp to a valid bound without calling setState in an effect (the
  // react-hooks plugin rejects state-in-effect). When the roster shrinks
  // and the raw index goes out of range we simply degrade to stop 0 for
  // rendering; Next/Prev handlers below do their own clamping.
  const stopIndex = rawStopIndex >= stops.length ? 0 : rawStopIndex;
  const warningCount = displayAgents.filter((a) => a.status === "warning").length;
  const currentStop = stops[stopIndex] ?? null;
  const isRoomStop = currentStop?.kind === "room";
  const isPersonStop = currentStop?.kind === "person";
  const totalRooms = useMemo(() => stops.filter((s) => s.kind === "room").length, [stops]);
  const currentRoomIndex = useMemo(() => {
    if (!currentStop) return 0;
    let ix = 0;
    for (let i = 0; i <= stopIndex && i < stops.length; i++) if (stops[i].kind === "room") ix++;
    return ix;
  }, [stops, stopIndex, currentStop]);

  const gotoPrev = useCallback(() => {
    if (mode !== "stepper") return;
    setStopIndex((i) => Math.max(0, i - 1));
  }, [mode]);

  const gotoNext = useCallback(() => {
    if (mode !== "stepper") return;
    setStopIndex((i) => Math.min(stops.length - 1, i + 1));
  }, [mode, stops.length]);

  const drillIn = useCallback(() => {
    if (mode !== "stepper" || !currentStop || currentStop.kind !== "room") return;
    // First person stop in this room is always at stopIndex + 1 if it exists.
    const next = stops[stopIndex + 1];
    if (next && next.kind === "person" && next.roomId === currentStop.roomId) {
      setStopIndex(stopIndex + 1);
    }
  }, [mode, currentStop, stopIndex, stops]);

  const drillOut = useCallback(() => {
    if (mode !== "stepper" || !currentStop || currentStop.kind !== "person") return;
    // Walk backwards to find the parent room stop.
    for (let i = stopIndex - 1; i >= 0; i--) {
      const s = stops[i];
      if (s.kind === "room" && s.roomId === currentStop.roomId) {
        setStopIndex(i);
        return;
      }
    }
  }, [mode, currentStop, stopIndex, stops]);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
  }, []);

  // Keyboard — arrows prev/next, Enter drill in, Esc drill out or toggle mode.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mode !== "stepper") return;
      // Ignore if typing in an input / chat panel
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (e.key === "ArrowRight") { e.preventDefault(); gotoNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); gotoPrev(); }
      else if (e.key === "Enter" && isRoomStop) { e.preventDefault(); drillIn(); }
      else if (e.key === "Escape") {
        if (isPersonStop) { e.preventDefault(); drillOut(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, isRoomStop, isPersonStop, gotoPrev, gotoNext, drillIn, drillOut]);

  const canDrillIn = isRoomStop && (currentStop?.occupantIds?.length ?? 0) > 0;
  const stopperLabel = currentStop?.label ?? "—";

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 60px)" }}>
      {/* ── Title (top-left) ────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 40,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(226,232,244,0.9)",
          borderRadius: 10,
          padding: "10px 18px",
          boxShadow: "0 4px 16px rgba(12,21,38,0.07)",
          maxWidth: "min(360px, 38vw)",
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 700, color: "#1f1638", margin: 0, letterSpacing: "-0.02em" }}>
          Headquarters
        </p>
        <p style={{ fontSize: 11, color: "#7a7390", margin: "2px 0 0", fontWeight: 500 }}>
          {currentProject ? currentProject.name : "Select a project to populate the desks"}
        </p>
      </div>

      {/* ── Mode chip (top-right) ───────────────────────────────────────── */}
      <div
        role="group"
        aria-label="HQ camera mode"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 40,
          display: "flex",
          gap: 6,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(226,232,244,0.9)",
          borderRadius: 12,
          padding: 6,
          boxShadow: "0 4px 16px rgba(12,21,38,0.07)",
        }}
      >
        {(["stepper", "overview"] as const).map((candidate) => {
          const active = mode === candidate;
          return (
            <button
              key={candidate}
              type="button"
              onClick={() => switchMode(candidate)}
              aria-pressed={active}
              aria-label={`Switch to ${MODE_LABELS[candidate]}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid rgba(195,208,248,0.9)",
                background: active ? "#1B47D6" : "rgba(255,255,255,0.9)",
                color: active ? "#fff" : "#1B47D6",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {candidate === "stepper" ? <Users size={12} /> : null}
              {MODE_LABELS[candidate]}
            </button>
          );
        })}
      </div>

      {/* ── Stepper caption + controls (bottom-center) ──────────────────── */}
      {mode === "stepper" && currentStop && (
        <div
          role="group"
          aria-label="Headquarters stepper controls"
          style={{
            position: "absolute",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(226,232,244,0.9)",
            borderRadius: 14,
            padding: "10px 14px",
            boxShadow: "0 8px 24px rgba(12,21,38,0.12)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 440,
          }}
        >
          <button
            type="button"
            onClick={gotoPrev}
            disabled={stopIndex === 0}
            aria-label="Previous stop"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "1px solid rgba(195,208,248,0.9)",
              background: stopIndex === 0 ? "rgba(245,245,249,0.8)" : "rgba(255,255,255,0.9)",
              color: stopIndex === 0 ? "#b8b3c5" : "#1B47D6",
              cursor: stopIndex === 0 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={16} />
          </button>

          <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
            <p
              style={{
                fontSize: 10,
                color: "#7a7390",
                margin: 0,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {isRoomStop
                ? `Room ${currentRoomIndex} of ${totalRooms}`
                : `${ROOMS[currentStop.roomId].label} · focus`}
            </p>
            <p
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#1f1638",
                margin: "2px 0 0",
                letterSpacing: "-0.02em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {stopperLabel}
            </p>
          </div>

          {canDrillIn && (
            <button
              type="button"
              onClick={drillIn}
              aria-label="Enter room — drill into individual workstations"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(195,208,248,0.9)",
                background: "rgba(255,255,255,0.9)",
                color: "#1B47D6",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
                flexShrink: 0,
              }}
            >
              <LogIn size={12} /> Enter room
            </button>
          )}

          {isPersonStop && (
            <button
              type="button"
              onClick={drillOut}
              aria-label="Back to room overview"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(195,208,248,0.9)",
                background: "rgba(255,255,255,0.9)",
                color: "#1B47D6",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
                flexShrink: 0,
              }}
            >
              <LogOut size={12} /> Back to room
            </button>
          )}

          <button
            type="button"
            onClick={gotoNext}
            disabled={stopIndex >= stops.length - 1}
            aria-label="Next stop"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "1px solid rgba(195,208,248,0.9)",
              background: stopIndex >= stops.length - 1 ? "rgba(245,245,249,0.8)" : "#1B47D6",
              color: stopIndex >= stops.length - 1 ? "#b8b3c5" : "#fff",
              cursor: stopIndex >= stops.length - 1 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* ── Keyboard / mode hint (under mode chip) ──────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 76,
          right: 16,
          zIndex: 40,
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(226,232,244,0.9)",
          borderRadius: 10,
          padding: "7px 12px",
          maxWidth: 280,
        }}
      >
        <p style={{ fontSize: 10, color: "#4D5E80", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>
          {mode === "stepper"
            ? <><strong style={{ color: "#1B47D6" }}>←/→</strong> prev/next · <strong style={{ color: "#1B47D6" }}>Enter</strong> drill in · <strong style={{ color: "#1B47D6" }}>Esc</strong> back</>
            : <><strong style={{ color: "#1B47D6" }}>Drag</strong> orbit · <strong style={{ color: "#1B47D6" }}>Scroll</strong> zoom · <strong style={{ color: "#1B47D6" }}>Right-drag</strong> pan</>}
        </p>
      </div>

      <TokenBurnOverlay agents={displayAgents} />

      {/* ── Call CTO (bottom-right) ─────────────────────────────────────── */}
      <div style={{ position: "absolute", bottom: 24, right: 24, zIndex: 40 }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: 12,
            border: "1.5px solid rgba(27,71,214,0.4)",
            animation: "cto-hq-ring 2.6s cubic-bezier(0.23,1,0.32,1) infinite",
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: 12,
            border: "1.5px solid rgba(27,71,214,0.22)",
            animation: "cto-hq-ring 2.6s cubic-bezier(0.23,1,0.32,1) 1.3s infinite",
            pointerEvents: "none",
          }}
        />
        <button
          type="button"
          onClick={() => navigate("/cto-call")}
          aria-label={
            warningCount > 0
              ? `Call CTO — ${warningCount} agent${warningCount > 1 ? "s" : ""} need${warningCount > 1 ? "" : "s"} attention`
              : "Call CTO"
          }
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(195,208,248,0.9)",
            borderRadius: 10,
            color: "#1B47D6",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "var(--shadow-blue)",
            transition: "background 0.15s, transform 0.12s",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "#EBF0FF";
            el.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background = "rgba(255,255,255,0.95)";
            el.style.transform = "translateY(0)";
          }}
          onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
          onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
        >
          <Phone size={14} aria-hidden />
          Call Cto
          {warningCount > 0 && (
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                padding: "0 4px",
                background: "#D97706",
                borderRadius: 9,
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                boxShadow: "0 2px 6px rgba(217,119,6,0.4)",
              }}
            >
              {warningCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Scene ───────────────────────────────────────────────────────── */}
      <SceneErrorBoundary
        key={sceneEpoch}
        fallback={<SceneFallback onRetry={() => setSceneEpoch((e) => e + 1)} />}
      >
        <WelcomeHWCanvas
          agents={displayAgents}
          assignments={assignments}
          stops={stops}
          stopIndex={stopIndex}
          stepperActive={mode === "stepper"}
          onAgentClick={(agent) => setChatAgent(agent)}
        />
      </SceneErrorBoundary>

      {/* ── Side panel ──────────────────────────────────────────────────── */}
      <HQSidePanel
        stops={stops}
        currentIndex={stopIndex}
        assignments={assignments}
        onJumpToStop={(i) => setStopIndex(i)}
        onAgentClick={(a) => setChatAgent(a)}
      />

      {/* ── Agent chat panel ────────────────────────────────────────────── */}
      {chatAgent && (
        <AgentChatPanel agent={chatAgent} onClose={() => setChatAgent(null)} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
