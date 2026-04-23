/**
 * Unified Headquarters view — the single home for the 3D experience.
 *
 * The HQ model is the Blender EEVEE export (Building7EEVEE.glb) rendered by
 * WelcomeHWCanvas + WelcomeHWScene. Agents from the current project are
 * placed on the plaza in front of the main building as clickable pins; the
 * CTO gets a prominent center slot. Clicking a pin opens AgentChatPanel.
 *
 * Camera modes (button-driven — no drag-only exploration required):
 *   Overview    → high-up orbit around the campus (default)
 *   Walkthrough → first-person pointer-lock + WASD at ground level
 *   Tour        → scripted phase sequence with OrbitControls.autoRotate so
 *                 the user sees a narrated flyby
 *
 * The procedural department-floor office that used to live at /hq is gone
 * from the primary view (the GLB is now the canonical HQ).
 */
import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Phone, Play, Square } from "lucide-react";
import WelcomeHWCanvas from "./WelcomeHWCanvas";
import AgentChatPanel from "./ui/AgentChatPanel";
import TokenBurnOverlay from "./ui/TokenBurnOverlay";
import { useAgentStore, type Agent } from "../store/agentStore";
import { useProjectStore } from "../store/projectStore";
import { useTeamOnboardingStore } from "../store/teamOnboardingStore";
import { mergeAgentsWithTeamConfig } from "../utils/teamOnboarding";

type Mode = "overview" | "walkthrough" | "tour";

interface TourPhase {
  /** Which camera mode the phase renders in. */
  cameraMode: "overview" | "walkthrough";
  /** Short label shown as a floating caption while the phase is active. */
  label: string;
  /** One-line hint under the label. */
  hint: string;
  /** How long to stay on this phase before advancing, in ms. */
  duration_ms: number;
}

/**
 * Scripted tour phases. Overview phases rely on OrbitControls auto-rotate so
 * the camera visibly sweeps while the caption plays. The final phase drops
 * to the plaza for a close look at the agents before returning to default.
 */
const TOUR_PHASES: TourPhase[] = [
  {
    cameraMode: "overview",
    label: "Welcome to headquarters",
    hint: "A U-shaped Blender-rendered office park surrounded by trees and walking paths.",
    duration_ms: 9000,
  },
  {
    cameraMode: "overview",
    label: "Meet the team",
    hint: "Each agent has a pin on the plaza in front of the main building — click any to chat.",
    duration_ms: 9000,
  },
];

const MODE_LABELS: Record<Mode, string> = {
  overview: "Overview",
  walkthrough: "Walkthrough",
  tour: "Tour",
};

const MODE_HINTS: Record<Mode, string> = {
  overview: "Drag to orbit · Scroll to zoom · Click a pin to chat with an agent",
  walkthrough: "Click the scene to lock the mouse · WASD to move · Q/E up/down · Esc unlocks",
  tour: "Scripted camera sweep — click any mode button to stop and take control.",
};

/**
 * Keep a WebGL / GLB / material error from whiteouting the page. Users still
 * see the HUD so they can jump back to Overview, refresh, or pick a different
 * mode.
 */
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
        This usually means WebGL isn't available or the building model didn't download. Click retry, or refresh the page.
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

  const [mode, setMode] = useState<Mode>("overview");
  const [tourPhaseIdx, setTourPhaseIdx] = useState(0);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  // Bumped on Retry from the error fallback — forces the Canvas to remount
  // and rerun WebGL context creation / GLB download.
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const tourTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep agents + team config in sync with the selected project.
  useEffect(() => {
    fetchAgents(currentProject?.id);
    fetchConfig();
  }, [fetchAgents, fetchConfig, currentProject?.id]);

  const displayAgents = useMemo(
    () => mergeAgentsWithTeamConfig(agents, config),
    [agents, config],
  );
  const warningCount = displayAgents.filter((a) => a.status === "warning").length;

  // Tour scheduler — advances phases, bails out early if the user changes
  // mode by clicking a button. All setState calls happen inside the async
  // setTimeout callback so the React Compiler's set-state-in-effect rule is
  // satisfied (no synchronous cascading renders).
  useEffect(() => {
    if (mode !== "tour") {
      if (tourTimerRef.current) {
        clearTimeout(tourTimerRef.current);
        tourTimerRef.current = null;
      }
      return;
    }
    const phase = TOUR_PHASES[tourPhaseIdx];
    if (!phase) return;
    tourTimerRef.current = setTimeout(() => {
      if (tourPhaseIdx + 1 >= TOUR_PHASES.length) {
        // Final phase — return to the default overview mode.
        setMode("overview");
        setTourPhaseIdx(0);
      } else {
        setTourPhaseIdx((i) => i + 1);
      }
    }, phase.duration_ms);
    return () => {
      if (tourTimerRef.current) {
        clearTimeout(tourTimerRef.current);
        tourTimerRef.current = null;
      }
    };
  }, [mode, tourPhaseIdx]);

  function switchMode(next: Mode) {
    setMode(next);
    setTourPhaseIdx(0);
  }

  const activeTourPhase = mode === "tour" ? TOUR_PHASES[tourPhaseIdx] ?? null : null;
  // Effective scene camera mode — during tour we defer to the phase.
  const activeCameraMode: "overview" | "walkthrough" =
    activeTourPhase?.cameraMode ?? (mode === "walkthrough" ? "walkthrough" : "overview");

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 60px)" }}>
      {/* ── Title (top-left) ─────────────────────────────────────────────── */}
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
          {currentProject ? currentProject.name : "Select a project to populate the plaza"}
        </p>
      </div>

      {/* ── Mode buttons (top-right) ─────────────────────────────────────── */}
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
        {(["overview", "walkthrough", "tour"] as const).map((candidate) => {
          const active = mode === candidate;
          const isTour = candidate === "tour";
          const Icon = isTour ? (active ? Square : Play) : null;
          return (
            <button
              key={candidate}
              type="button"
              onClick={() => switchMode(active && isTour ? "overview" : candidate)}
              aria-pressed={active}
              aria-label={
                isTour
                  ? active
                    ? "Stop the scripted HQ tour"
                    : "Start the scripted HQ tour"
                  : `Switch to ${MODE_LABELS[candidate]} view`
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
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
              {Icon ? <Icon size={12} /> : null}
              {isTour && active ? "Stop tour" : MODE_LABELS[candidate]}
            </button>
          );
        })}
      </div>

      {/* ── Controls hint (below mode buttons) ──────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 76,
          right: 16,
          zIndex: 40,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(226,232,244,0.9)",
          borderRadius: 10,
          padding: "8px 14px",
          boxShadow: "0 4px 16px rgba(12,21,38,0.07)",
          maxWidth: 320,
        }}
      >
        <p style={{ fontSize: 11, color: "#4D5E80", margin: 0, lineHeight: 1.7, fontWeight: 500 }}>
          <span style={{ color: "#1B47D6", fontWeight: 700 }}>Controls:</span> {MODE_HINTS[mode]}
        </p>
      </div>

      {/* ── Tour phase caption ──────────────────────────────────────────── */}
      {activeTourPhase && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            bottom: 24,
            left: 24,
            zIndex: 40,
            maxWidth: "min(420px, 48vw)",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(226,232,244,0.9)",
            borderRadius: 12,
            padding: "12px 18px",
            boxShadow: "0 8px 24px rgba(12,21,38,0.09)",
          }}
        >
          <p style={{ fontSize: 11, color: "#7a7390", margin: 0, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Tour · {tourPhaseIdx + 1}/{TOUR_PHASES.length}
          </p>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#1f1638", margin: "4px 0 4px", letterSpacing: "-0.02em" }}>
            {activeTourPhase.label}
          </p>
          <p style={{ fontSize: 12, color: "#4D5E80", margin: 0, lineHeight: 1.5 }}>
            {activeTourPhase.hint}
          </p>
        </div>
      )}

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

      {/* ── Active scene ─────────────────────────────────────────────────── */}
      <SceneErrorBoundary
        key={sceneEpoch}
        fallback={<SceneFallback onRetry={() => setSceneEpoch((e) => e + 1)} />}
      >
        <WelcomeHWCanvas
          agents={displayAgents}
          onAgentClick={(agent) => setChatAgent(agent)}
          cameraMode={activeCameraMode}
          autoRotate={mode === "tour"}
        />
      </SceneErrorBoundary>

      {/* ── Agent chat panel ─────────────────────────────────────────────── */}
      {chatAgent && (
        <AgentChatPanel agent={chatAgent} onClose={() => setChatAgent(null)} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
