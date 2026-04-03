import { Video, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { Agent } from "../../../store/agentStore";

interface ProfileCardV3Props {
  agent: Agent;
  accentColor: string;
  reportCount?: number;
  selected?: boolean;
  onSelect: () => void;
  onVideoCall?: () => void;
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

function hashSeed(value: string) {
  return value.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
}

export default function ProfileCardV3({
  agent,
  accentColor,
  reportCount = 0,
  selected = false,
  onSelect,
  onVideoCall,
}: ProfileCardV3Props) {
  const [mediaFailed, setMediaFailed] = useState(false);
  const portraitUrl = useMemo(() => {
    if (agent.poster_image_url) {
      return agent.poster_image_url;
    }
    const seed = (hashSeed(agent.agent_id) % 70) + 1;
    return `https://i.pravatar.cc/480?img=${seed}`;
  }, [agent.agent_id, agent.poster_image_url]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={selected}
      className={[
        "group relative w-[236px] overflow-visible rounded-[22px] text-left transition-[transform,box-shadow] duration-200 ease-out",
        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-border)] focus-visible:ring-offset-2",
        selected
          ? "translate-y-[-2px] shadow-[0_30px_70px_-36px_rgba(28,70,140,0.42)]"
          : "shadow-[0_18px_42px_-30px_rgba(17,24,39,0.24)] hover:-translate-y-1 hover:shadow-[0_26px_56px_-32px_rgba(17,24,39,0.28)]",
      ].join(" ")}
    >
      <div className="overflow-hidden rounded-[22px] border border-[#dde3ec] bg-white">
        <div
          className="relative h-[180px] overflow-hidden"
          style={{
            background: mediaFailed
              ? `linear-gradient(135deg, ${accentColor}, color-mix(in srgb, ${accentColor} 50%, white))`
              : "#dfe9f7",
          }}
        >
          {!mediaFailed ? (
            <img
              src={portraitUrl}
              alt={agent.name}
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
              onError={() => setMediaFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl font-semibold text-white">
              {getInitials(agent.name)}
            </div>
          )}
        </div>

        <div
          className="min-h-[118px] px-4 py-4 transition-colors duration-200 ease-out"
          style={{
            backgroundColor: selected ? accentColor : "#ffffff",
          }}
        >
          <h3
            className="text-[18px] font-semibold leading-[1.1]"
            style={{ color: selected ? "#ffffff" : "#1f2937" }}
          >
            {agent.name}
          </h3>
          <p
            className="mt-1 text-[15px] leading-[1.25]"
            style={{ color: selected ? "rgba(255,255,255,0.84)" : "#6b7280" }}
          >
            {formatLabel(agent.role)}
          </p>
          {onVideoCall ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onVideoCall();
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-current/15 px-2.5 py-1 text-[11px] font-semibold transition-colors"
              style={{
                color: selected ? "rgba(255,255,255,0.92)" : "#4b5563",
                backgroundColor: selected ? "rgba(255,255,255,0.14)" : "#f8f6fc",
              }}
            >
              <Video size={12} />
              Call
            </button>
          ) : null}
        </div>
      </div>

      {reportCount > 0 ? (
        <div className="absolute right-3 top-[156px] flex h-11 min-w-11 items-center justify-center gap-1 rounded-[12px] border border-[#d9dee7] bg-white px-3 text-[#394150] shadow-[0_16px_30px_-22px_rgba(17,24,39,0.35)]">
          <Users size={18} strokeWidth={2} />
          <span className="text-[13px] font-semibold">{reportCount}</span>
        </div>
      ) : null}
    </div>
  );
}
