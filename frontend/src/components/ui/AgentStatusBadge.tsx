export type AgentStatusKey = "active" | "warning" | "paused" | "strike";

const defaultPalette: Record<
  AgentStatusKey,
  { dot: string; label: string; bg: string; text: string }
> = {
  active: { dot: "#059669", label: "Active", bg: "#ECFDF5", text: "#059669" },
  warning: { dot: "#D97706", label: "Warning", bg: "#FFFBEB", text: "#D97706" },
  paused: { dot: "#7a7390", label: "Paused", bg: "#f8f6fc", text: "#7a7390" },
  strike: { dot: "#DC2626", label: "Strike", bg: "#FEF2F2", text: "#DC2626" },
};

/** Text/background tuned for dark or tinted headers (org chart glass card, chat header). */
const onDarkPalette: Record<AgentStatusKey, { dot: string; label: string; bg: string; text: string }> = {
  active: { dot: "#34d399", label: "Active", bg: "rgba(255,255,255,0.1)", text: "#adffd2" },
  warning: { dot: "#fbbf24", label: "Warning", bg: "rgba(255,255,255,0.1)", text: "#ffe39f" },
  paused: { dot: "#94a3b8", label: "Paused", bg: "rgba(255,255,255,0.1)", text: "#cbd5e1" },
  strike: { dot: "#f87171", label: "Strike", bg: "rgba(254,202,202,0.12)", text: "#fecaca" },
};

export function normalizeAgentStatus(status: string): AgentStatusKey {
  const key = status.toLowerCase() as AgentStatusKey;
  return key in defaultPalette ? key : "active";
}

export interface AgentStatusBadgeProps {
  status: string;
  size?: "compact" | "default";
  /** default: light pill for white cards; onDark: glass / light text for dark surfaces */
  variant?: "default" | "onDark";
  /** dot: status-colored circle only (dense lists, overlays) */
  appearance?: "pill" | "dot";
  className?: string;
  showLabel?: boolean;
}

export default function AgentStatusBadge({
  status,
  size = "default",
  variant = "default",
  appearance = "pill",
  className = "",
  showLabel = true,
}: AgentStatusBadgeProps) {
  const key = normalizeAgentStatus(status);
  const palette = variant === "onDark" ? onDarkPalette[key] : defaultPalette[key];
  const isCompact = size === "compact";

  if (appearance === "dot") {
    const dotClass = size === "compact" ? "h-1.5 w-1.5" : "h-2 w-2";
    return (
      <span
        className={[`inline-block shrink-0 rounded-full`, dotClass, className].filter(Boolean).join(" ")}
        style={{ background: palette.dot }}
        title={palette.label}
        aria-label={palette.label}
      />
    );
  }

  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-full font-semibold",
        variant === "onDark" ? "uppercase tracking-[0.12em]" : "capitalize",
        showLabel
          ? isCompact
            ? "gap-1 px-2 py-0.5 text-[10px]"
            : "gap-1.5 px-2.5 py-1 text-[11px]"
          : "p-1",
        variant === "onDark" ? "border border-white/15" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: palette.bg,
        color: showLabel ? palette.text : undefined,
      }}
      title={palette.label}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: palette.dot }}
        aria-hidden
      />
      {showLabel ? palette.label : null}
    </span>
  );
}
