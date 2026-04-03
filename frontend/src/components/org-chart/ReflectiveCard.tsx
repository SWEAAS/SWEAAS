import type { CSSProperties, KeyboardEvent } from "react";
import { Activity, Fingerprint, Lock, Sparkles } from "lucide-react";
import type { Agent } from "../../store/agentStore";
import "./ReflectiveCard.css";

interface ReflectiveCardProps {
  agent: Agent;
  departmentLabel: string;
  accentColor: string;
  blurStrength?: number;
  color?: string;
  metalness?: number;
  roughness?: number;
  overlayColor?: string;
  displacementStrength?: number;
  noiseScale?: number;
  specularConstant?: number;
  grayscale?: number;
  glassDistortion?: number;
  className?: string;
  style?: CSSProperties;
  selected?: boolean;
  compact?: boolean;
  onSelect?: (agentId: string) => void;
}

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

export default function ReflectiveCard({
  agent,
  departmentLabel,
  accentColor,
  blurStrength = 12,
  color = "#ffffff",
  metalness = 1,
  roughness = 0.75,
  overlayColor = "rgba(0, 0, 0, 0.2)",
  displacementStrength = 20,
  noiseScale = 1,
  specularConstant = 5,
  grayscale = 0.15,
  glassDistortion = 30,
  className = "",
  style,
  selected = false,
  compact = false,
  onSelect,
}: ReflectiveCardProps) {
  const baseFrequency = 0.03 / Math.max(0.1, noiseScale);
  const saturation = 1 - Math.max(0, Math.min(1, grayscale));
  const percent = Math.min(usagePercent(agent), 100);

  const cssVariables = {
    "--blur-strength": `${blurStrength}px`,
    "--metalness": metalness,
    "--roughness": roughness,
    "--overlay-color": overlayColor,
    "--text-color": color,
    "--saturation": saturation,
    "--accent-color": accentColor,
    "--card-height": compact ? "390px" : "500px",
    "--card-width": compact ? "100%" : "320px",
    "--glass-distortion": glassDistortion,
    "--displacement-strength": displacementStrength,
    "--specular-constant": specularConstant,
  } as CSSProperties;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!onSelect) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(agent.agent_id);
    }
  };

  return (
    <article
      className={[
        "reflective-card-container",
        compact ? "reflective-card-compact" : "",
        selected ? "reflective-card-selected" : "",
        onSelect ? "reflective-card-clickable" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...cssVariables, ...style }}
      onClick={onSelect ? () => onSelect(agent.agent_id) : undefined}
      onKeyDown={handleKeyDown}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? "button" : undefined}
      aria-pressed={onSelect ? selected : undefined}
    >
      <svg className="reflective-svg-filters" aria-hidden="true">
        <defs>
          <filter id={`metallic-displacement-${agent.agent_id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="turbulence" baseFrequency={baseFrequency} numOctaves="2" result="noise" />
            <feColorMatrix in="noise" type="luminanceToAlpha" result="noiseAlpha" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={displacementStrength}
              xChannelSelector="R"
              yChannelSelector="G"
              result="rippled"
            />
            <feSpecularLighting
              in="noiseAlpha"
              surfaceScale={displacementStrength}
              specularConstant={specularConstant}
              specularExponent="20"
              lightingColor="#ffffff"
              result="light"
            >
              <fePointLight x="0" y="0" z="300" />
            </feSpecularLighting>
            <feComposite in="light" in2="rippled" operator="in" result="light-effect" />
            <feBlend in="light-effect" in2="rippled" mode="screen" result="metallic-result" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="solidAlpha"
            />
            <feMorphology in="solidAlpha" operator="erode" radius="45" result="erodedAlpha" />
            <feGaussianBlur in="erodedAlpha" stdDeviation="10" result="blurredMap" />
            <feComponentTransfer in="blurredMap" result="glassMap">
              <feFuncA type="linear" slope="0.5" intercept="0" />
            </feComponentTransfer>
            <feDisplacementMap
              in="metallic-result"
              in2="glassMap"
              scale={glassDistortion}
              xChannelSelector="A"
              yChannelSelector="A"
              result="final"
            />
          </filter>
        </defs>
      </svg>

      <div
        className="reflective-backdrop"
        style={{ filter: `saturate(${saturation}) blur(${blurStrength}px) url(#metallic-displacement-${agent.agent_id})` }}
      />
      <div className="reflective-noise" />
      <div className="reflective-sheen" />
      <div className="reflective-border" />

      <div className="reflective-content">
        <div className="card-header">
          <div className="security-badge">
            <Lock size={14} className="security-icon" />
            <span>{departmentLabel}</span>
          </div>
          <div className="status-cluster">
            <span className={`status-pill status-pill-${agent.status}`}>{formatLabel(agent.status)}</span>
            <Activity className="status-icon" size={18} />
          </div>
        </div>

        <div className="card-body">
          <div className="identity-mark">{getInitials(agent.name)}</div>
          <div className="user-info">
            <h2 className="user-name">{agent.name}</h2>
            <p className="user-role">{formatLabel(agent.role)}</p>
          </div>
          <div className="focus-panel">
            <div className="focus-meta">
              <span className="label">CURRENT FOCUS</span>
              <span className="value value-muted">{agent.current_focus || "Standing by for next task"}</span>
            </div>
            <div className="token-meter">
              <div className="token-meter-labels">
                <span className="label">TOKEN USAGE</span>
                <span className="value">{percent}%</span>
              </div>
              <div className="token-meter-track">
                <div className="token-meter-fill" style={{ width: `${percent}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="card-footer">
          <div className="id-section">
            <span className="label">ROLE TIER</span>
            <span className="value">{formatLabel(agent.hierarchy_level)}</span>
          </div>
          <div className="fingerprint-section">
            <Sparkles size={16} className="sparkle-icon" />
            <Fingerprint size={30} className="fingerprint-icon" />
          </div>
        </div>
      </div>
    </article>
  );
}
