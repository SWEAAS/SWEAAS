import { Building2, ChevronRight, MessageSquare, Phone } from "lucide-react";
import type { Agent } from "../../../store/agentStore";
import AgentStatusBadge from "../../ui/AgentStatusBadge";

type ActionKind = "chat" | "video" | "hq";
const BASE_CARD_WIDTH = 397;
const BASE_CARD_HEIGHT = 326;
const CARD_SCALE = 0.7;

interface ProfileCardProps {
  agent: Agent;
  departmentLabel: string;
  reportsTo: string;
  accentColor: string;
  usagePercent: number;
  secondaryAction: {
    label: string;
    kind: ActionKind;
    onClick: () => void;
  };
  onSelect: (agentId: string) => void;
  onChat: () => void;
  selected?: boolean;
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

function renderActionIcon(kind: ActionKind) {
  if (kind === "video") return <Phone size={13} />;
  if (kind === "hq") return <Building2 size={13} />;
  return <MessageSquare size={13} />;
}

export default function ProfileCard({
  agent,
  departmentLabel,
  reportsTo,
  accentColor,
  usagePercent,
  secondaryAction,
  onSelect,
  onChat,
  selected = false,
}: ProfileCardProps) {
  const clampedUsage = Math.min(Math.max(usagePercent, 0), 100);
  const outerWidth = BASE_CARD_WIDTH * CARD_SCALE;
  const outerHeight = BASE_CARD_HEIGHT * CARD_SCALE;

  return (
    <div className="relative mx-auto" style={{ width: `${outerWidth}px`, height: `${outerHeight}px` }}>
      <div
        onClick={() => onSelect(agent.agent_id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(agent.agent_id);
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        className={[
          "group absolute left-0 top-0 flex h-full flex-col overflow-hidden rounded-[30px] border bg-white/95 p-[14px] text-left backdrop-blur transition-[transform,box-shadow,border-color] duration-200 ease-out",
          "shadow-[0_18px_46px_-34px_rgba(17,24,39,0.24)]",
          selected
            ? "border-[var(--brand-border)] bg-[linear-gradient(180deg,white_0%,#faf7ff_100%)] shadow-[var(--shadow-brand-lg)]"
            : "border-[#ece7f5] hover:-translate-y-0.5 hover:shadow-[0_24px_56px_-34px_rgba(17,24,39,0.28)]",
        ].join(" ")}
        style={{
          width: `${BASE_CARD_WIDTH}px`,
          height: `${BASE_CARD_HEIGHT}px`,
          minHeight: `${BASE_CARD_HEIGHT}px`,
          transform: `scale(${CARD_SCALE})`,
          transformOrigin: "top left",
        }}
      >
        <div className="flex items-start gap-2.5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(82,43,180,0.5)]"
            style={{
              background: `linear-gradient(135deg, ${accentColor}, color-mix(in srgb, ${accentColor} 58%, white 42%))`,
            }}
          >
            {getInitials(agent.name)}
          </div>

          <div className="min-w-0">
            <h3 className="text-[21px] font-semibold leading-[1.02] tracking-tight text-[#1f1638]">
              {agent.name}
            </h3>
            <p className="mt-0.5 text-xs text-[#675f7e]">{formatLabel(agent.role)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-xs text-[#675f7e]">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: accentColor }}>
            {departmentLabel}
          </span>
          <ChevronRight size={12} />
          <span>{reportsTo}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-[18px] bg-[#f6f3fb] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7a7390]">Level</p>
            <p className="mt-1.5 text-xs font-medium text-[#1f1638]">{formatLabel(agent.hierarchy_level)}</p>
          </div>
          <div className="rounded-[18px] bg-[#f6f3fb] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7a7390]">Status</p>
            <div className="mt-1.5">
              <AgentStatusBadge status={agent.status} size="compact" />
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-[20px] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7a7390]">Current focus</p>
          <p
            className="mt-1.5 text-[13px] leading-[1.45] text-[#4e4762]"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {agent.current_focus || "Standing by for new delegation."}
          </p>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[#7a7390]">
            <span>Token usage</span>
            <span>{clampedUsage}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#ebe6f6]">
            <div
              className="h-full rounded-full transition-[width] duration-200 ease-out"
              style={{
                width: `${clampedUsage}%`,
                background: `linear-gradient(90deg, ${accentColor}, color-mix(in srgb, ${accentColor} 52%, white 48%))`,
              }}
            />
          </div>
        </div>

        <div className="mt-auto flex gap-2 pt-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onChat();
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[16px] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-2 text-[11px] font-semibold text-[var(--brand-dark)] transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_12%,white)] active:scale-[0.98]"
          >
            <MessageSquare size={12} />
            Open Chat
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              secondaryAction.onClick();
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[16px] border border-[#c3d0f8] bg-[#ebf0ff] px-2.5 py-2 text-[11px] font-semibold text-[#1b47d6] transition-colors hover:bg-[#dce5ff] active:scale-[0.98]"
          >
            {renderActionIcon(secondaryAction.kind)}
            {secondaryAction.label}
          </button>
        </div>
      </div>
    </div>
  );
}
