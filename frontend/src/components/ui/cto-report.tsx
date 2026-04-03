import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Headphones,
  MessageSquareText,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Agent } from "../../store/agentStore";
import AgentStatusBadge from "./AgentStatusBadge";

type ReportContributor = Pick<
  Agent,
  "agent_id" | "name" | "role" | "department" | "poster_image_url" | "hierarchy_level" | "current_focus" | "status"
>;

export interface ReportSection {
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
  bullets?: string[];
  created_at?: string;
}

interface CtoReportProps {
  title: string;
  subtitle: string;
  contributors: ReportContributor[];
  sections?: ReportSection[];
  channelName?: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ContributorAvatar({
  contributor,
  size = "md",
}: {
  contributor: ReportContributor;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "h-8 w-8 text-[10px]" : "h-9 w-9 text-[10px]";
  const accent = departmentAccent[contributor.department] ?? "var(--brand)";

  if (contributor.poster_image_url) {
    return (
      <img
        src={contributor.poster_image_url}
        alt={contributor.name}
        className={`${sizeClass} rounded-full border-2 border-white object-cover`}
      />
    );
  }

  return (
    <div
      className={`flex ${sizeClass} items-center justify-center rounded-full border-2 border-white font-bold text-white`}
      style={{
        background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 68%, white 32%))`,
      }}
    >
      {initials(contributor.name)}
    </div>
  );
}

const departmentAccent: Record<string, string> = {
  engineering: "#5b7cff",
  marketing: "#f59e0b",
  product: "#10b981",
  support: "#8b5cf6",
};

const DEFAULT_SECTIONS: ReportSection[] = [
  {
    id: "empty-state",
    eyebrow: "No data yet",
    title: "Waiting for report data",
    body: "Execute an orchestration task to generate your first CTO direction report. Reports are generated automatically after each session completes.",
  },
];

export default function CtoReport({ title, subtitle, contributors, sections, channelName: channelNameProp }: CtoReportProps) {
  const navigate = useNavigate();
  const channelName = channelNameProp || title.replace(/\s+delivery debrief$/i, "").toLowerCase().replace(/\s+/g, "-");
  const [showContributorsPanel, setShowContributorsPanel] = useState(false);
  const activeSections = sections && sections.length > 0 ? sections : DEFAULT_SECTIONS;
  const reportFeed = useMemo(
    () =>
      activeSections.map((section, index) => ({
        ...section,
        author: contributors[index % Math.max(contributors.length, 1)] ?? null,
        timeLabel: section.id !== "empty-state"
          ? (section.created_at
              ? new Date(section.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
              : new Date(Date.now() - (activeSections.length - index) * 480_000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))
          : "",
      })),
    [activeSections, contributors],
  );

  return (
    <>
      <div className="overflow-hidden rounded-[28px] border border-[#e9e3f2] bg-white shadow-[0_18px_42px_-34px_rgba(31,22,56,0.22)]">
        <div className="border-b border-[#f1edf6] bg-white px-6 py-4">
          <div className="relative flex items-center justify-end gap-4">
            <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 text-[#1f1638]">
              <span className="text-[20px] font-semibold tracking-[-0.03em]">#</span>
              <span className="text-[16px] font-semibold tracking-[-0.03em]">{channelName || "reports"}</span>
              <ChevronDown size={16} className="text-[#8a82a0]" />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowContributorsPanel(true)}
                className="flex items-center gap-2 rounded-full border border-[#ece7f5] bg-white px-3 py-1.5 shadow-[0_8px_18px_-18px_rgba(31,22,56,0.2)] transition-colors hover:bg-[#faf8fd]"
              >
                <div className="flex -space-x-2">
                  {contributors.slice(0, 3).map((agent) => (
                    <ContributorAvatar key={agent.agent_id} contributor={agent} size="sm" />
                  ))}
                </div>
                <span className="text-[13px] font-semibold text-[#675f7e]">{contributors.length}</span>
              </button>

              <button
                type="button"
                onClick={() => navigate("/cto-call")}
                className="inline-flex items-center gap-2 rounded-[14px] border border-[#ece7f5] bg-white px-3.5 py-2 text-[14px] font-semibold text-[#4e4762] shadow-[0_8px_18px_-18px_rgba(31,22,56,0.18)] transition-colors hover:bg-[#faf8fd]"
              >
                <Headphones size={15} />
                Call Cto
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-[#f2edf7] bg-[#fcfbfd] px-6 py-7">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8d84a8]">
              De-brief from Cto
            </p>
            <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#1f1638]">
              {title}
            </h1>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {contributors.slice(0, 8).map((agent) => (
                <div
                  key={agent.agent_id}
                  className="flex items-center gap-3 rounded-full border border-[#ece7f5] bg-white px-3 py-2 shadow-[0_8px_18px_-18px_rgba(31,22,56,0.16)]"
                >
                  <ContributorAvatar contributor={agent} />
                  <div className="min-w-0 text-left">
                    <p className="truncate text-[13px] font-semibold text-[#1f1638]">{agent.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-[11px] text-[#7a7390]">{formatRole(agent.role)}</p>
                      <AgentStatusBadge status={agent.status} size="compact" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-5 max-w-2xl text-[14px] leading-7 text-[#675f7e]">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="bg-white px-6 py-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#f3f0fb] px-3 py-1.5 text-[12px] font-medium text-[#4e4762]">
              <CheckCircle2 size={14} className="text-[var(--brand)]" />
              Ready to share
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#f6f3fb] px-3 py-1.5 text-[12px] font-medium text-[#4e4762]">
              <MessageSquareText size={14} className="text-[#6d54d8]" />
              Calm and direct
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#f3faf7] px-3 py-1.5 text-[12px] font-medium text-[#4e4762]">
              <ArrowUpRight size={14} className="text-[#0f9f6e]" />
              Quick scanning
            </div>
          </div>
        </div>

        <div className="divide-y divide-[#f2edf7] bg-white px-6">
          {reportFeed.map((section) => (
            <section key={section.id} className="flex gap-4 py-5">
              <div className="pt-0.5">
                {section.author ? (
                  <ContributorAvatar contributor={section.author} />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f0f8] text-[10px] font-bold text-[#8d84a8]">
                    Cto
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-[15px] font-semibold tracking-[-0.01em] text-[#1f1638]">
                    {section.author?.name ?? "Cto"}
                  </p>
                  <p className="text-[12px] text-[#7a7390]">
                    {section.author ? formatRole(section.author.role) : "Cto"}
                  </p>
                  <span className="text-[#dad4e7]">•</span>
                  <div className="inline-flex items-center gap-1.5 text-[12px] text-[#7a7390]">
                    <Clock3 size={12} />
                    {section.timeLabel}
                  </div>
                </div>

                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d84a8]">
                  {section.eyebrow}
                </p>
                <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.02em] text-[#1f1638]">
                  {section.title}
                </h2>

                {"body" in section ? (
                  <p className="mt-3 max-w-3xl text-[14px] leading-7 text-[#4f4766]">
                    {section.body}
                  </p>
                ) : null}

                {Array.isArray(section.bullets) ? (
                  <div className="mt-4 space-y-2">
                    {section.bullets.map((bullet) => (
                      <div
                        key={bullet}
                        className="rounded-[14px] bg-[#f8f6fb] px-4 py-3 text-[14px] leading-7 text-[#4f4766]"
                      >
                        {bullet}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowContributorsPanel(false)}
        aria-label="Close contributors panel"
        className={[
          "fixed inset-0 z-40 bg-[#1f1638]/22 backdrop-blur-[2px] transition-opacity duration-300",
          showContributorsPanel ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />

      <aside
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-[#ece7f5] bg-white shadow-[-24px_0_60px_-40px_rgba(17,24,39,0.4)] transition-transform duration-300 ease-out",
          showContributorsPanel ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        aria-hidden={showContributorsPanel ? undefined : true}
      >
        <div className="flex items-center justify-between border-b border-[#f0ebf8] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d84a8]">
              Report contributors
            </p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#1f1638]">
              {contributors.length} agents worked on this report
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowContributorsPanel(false)}
            className="rounded-full p-2 text-[#7a7390] transition-colors hover:bg-[#f6f3fb] hover:text-[#1f1638]"
            aria-label="Close contributors panel"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-3">
            {contributors.map((agent) => (
              <div
                key={agent.agent_id}
                className="flex items-start gap-3 rounded-[22px] border border-[#ece7f5] bg-white px-4 py-4 shadow-[0_18px_32px_-30px_rgba(31,22,56,0.24)]"
              >
                <ContributorAvatar contributor={agent} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-[#1f1638]">{agent.name}</p>
                      <p className="mt-1 text-[12px] text-[#7a7390]">
                        {formatRole(agent.role)} · {agent.department} · {agent.hierarchy_level}
                      </p>
                    </div>
                    <AgentStatusBadge status={agent.status} size="compact" className="shrink-0" />
                  </div>
                  <p className="mt-3 text-[13px] leading-6 text-[#4f4766]">
                    {agent.current_focus || "Standing by for new delegation."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
