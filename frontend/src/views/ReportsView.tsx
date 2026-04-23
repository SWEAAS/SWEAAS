import { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import CtoReport from "../components/ui/cto-report";
import type { ReportSection } from "../components/ui/cto-report";
import { useAgentStore } from "../store/agentStore";
import { useProjectStore } from "../store/projectStore";
import { useTeamOnboardingStore } from "../store/teamOnboardingStore";
import { mergeAgentsWithTeamConfig } from "../utils/teamOnboarding";
import { orchestrationApi, observabilityApi } from "../api/client";

interface ApiReport {
  report_id?: string;
  id?: string;
  title?: string;
  type?: string;
  report_type?: string;
  session_summary?: string;
  session_summary_preview?: string;
  direction_report?: string;
  content?: string;
  task?: string;
  created_at?: string;
}

/** Try to JSON-parse a string; return the original if it doesn't parse. */
function tryParseJson(value: string | undefined): unknown {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Convert a string or nested structure into the flat text we show in a section. */
function stringifyBody(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

/** Build ReportSection[] from the structured JSON the LLM emits for session_summary / direction_report. */
function parseReportContent(report: ApiReport): ReportSection[] {
  const sections: ReportSection[] = [];
  const created = report.created_at;

  if (report.task) {
    sections.push({
      id: "task",
      eyebrow: "Task",
      title: "What was asked",
      body: report.task,
      created_at: created,
    });
  }

  // Session summary — LLM tends to emit { summary, completed_tasks, issues_found, recommendations, pull_requests }.
  const sessionRaw = report.session_summary || report.session_summary_preview || report.content || "";
  if (sessionRaw) {
    const parsed = tryParseJson(sessionRaw) as
      | {
          summary?: string;
          completed_tasks?: string[];
          issues_found?: string[];
          recommendations?: string[];
          pull_requests?: unknown[];
        }
      | null;

    if (parsed && typeof parsed === "object") {
      if (parsed.summary) {
        sections.push({
          id: "session-summary",
          eyebrow: "Session summary",
          title: "What the agents accomplished",
          body: parsed.summary,
          created_at: created,
        });
      }
      if (parsed.completed_tasks?.length) {
        sections.push({
          id: "completed-tasks",
          eyebrow: "Completed tasks",
          title: "Work delivered",
          bullets: parsed.completed_tasks,
          created_at: created,
        });
      }
      if (parsed.issues_found?.length) {
        sections.push({
          id: "issues-found",
          eyebrow: "Issues surfaced",
          title: "What the team flagged",
          bullets: parsed.issues_found,
          created_at: created,
        });
      }
      if (parsed.recommendations?.length) {
        sections.push({
          id: "recommendations",
          eyebrow: "Recommendations",
          title: "Suggested next steps",
          bullets: parsed.recommendations,
          created_at: created,
        });
      }
    } else {
      sections.push({
        id: "session-summary",
        eyebrow: "Session summary",
        title: "What was accomplished",
        body: sessionRaw,
        created_at: created,
      });
    }
  }

  // Direction report — LLM tends to emit { assessment, completed, next_priorities, feedback_addressed, blockers, merge_decisions }.
  const directionRaw = report.direction_report || "";
  if (directionRaw) {
    const parsed = tryParseJson(directionRaw) as
      | {
          assessment?: string;
          next_priorities?: { description?: string; department?: string; priority?: string }[];
          blockers?: string[];
          feedback_addressed?: string[];
          merge_decisions?: string[];
        }
      | null;

    if (parsed && typeof parsed === "object") {
      if (parsed.assessment) {
        sections.push({
          id: "cto-assessment",
          eyebrow: "CTO assessment",
          title: "Executive read",
          body: parsed.assessment,
          created_at: created,
        });
      }
      if (parsed.next_priorities?.length) {
        sections.push({
          id: "next-priorities",
          eyebrow: "Next priorities",
          title: "What the CTO is directing next",
          bullets: parsed.next_priorities.map((p) => {
            const parts = [p.description || "Unnamed priority"];
            if (p.department) parts.push(`— ${p.department}`);
            if (p.priority) parts.push(`(${p.priority})`);
            return parts.join(" ");
          }),
          created_at: created,
        });
      }
      if (parsed.blockers?.length) {
        sections.push({
          id: "blockers",
          eyebrow: "Blockers",
          title: "Needs attention",
          bullets: parsed.blockers.map(stringifyBody),
          created_at: created,
        });
      }
      if (parsed.feedback_addressed?.length) {
        sections.push({
          id: "feedback-addressed",
          eyebrow: "Feedback addressed",
          title: "Resolved in this session",
          bullets: parsed.feedback_addressed.map(stringifyBody),
          created_at: created,
        });
      }
      if (parsed.merge_decisions?.length) {
        sections.push({
          id: "merge-decisions",
          eyebrow: "Merge decisions",
          title: "Ready to ship",
          bullets: parsed.merge_decisions.map(stringifyBody),
          created_at: created,
        });
      }
    } else {
      sections.push({
        id: "cto-direction",
        eyebrow: "CTO direction",
        title: "Direction report",
        body: directionRaw,
        created_at: created,
      });
    }
  }

  return sections;
}

export default function ReportsView() {
  const { agents, fetchAgents } = useAgentStore();
  const { currentProject, fetchProjects } = useProjectStore();
  const { config, fetchConfig } = useTeamOnboardingStore();
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detailCache, setDetailCache] = useState<Record<string, ApiReport>>({});
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<null | "md" | "pdf">(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents(currentProject?.id);
    fetchProjects();
    fetchConfig();
  }, [fetchAgents, fetchProjects, fetchConfig, currentProject?.id]);

  useEffect(() => {
    if (!currentProject?.id) return;
    setLoading(true);
    setDetailCache({});

    Promise.all([
      orchestrationApi.reports(currentProject.id).catch(() => null),
      observabilityApi.reports(currentProject.id).catch(() => null),
    ]).then(([orchRes, obsRes]) => {
      const orchReports: ApiReport[] = orchRes?.data?.reports ?? [];
      const obsReports: ApiReport[] = obsRes?.data?.reports ?? [];

      const seen = new Set<string>();
      const merged: ApiReport[] = [];
      for (const r of [...orchReports, ...obsReports]) {
        const key = r.report_id || r.id || "";
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        merged.push(r);
      }

      merged.sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      });

      setReports(merged);
      setSelectedIndex(0);
    }).finally(() => setLoading(false));
  }, [currentProject?.id]);

  // Fetch the full body for the selected report if we don't have it yet.
  const selectedListItem = reports[selectedIndex] ?? null;
  const selectedId = selectedListItem?.report_id || selectedListItem?.id || "";

  useEffect(() => {
    if (!currentProject?.id || !selectedId) return;
    if (detailCache[selectedId]) return;
    // Only orchestration reports have a detail endpoint. Observability rows
    // may already contain full content on the list response.
    orchestrationApi
      .reportDetail(currentProject.id, selectedId)
      .then((res) => {
        setDetailCache((prev) => ({ ...prev, [selectedId]: res.data as ApiReport }));
      })
      .catch(() => {
        // Ignore — we'll fall back to whatever the list item already has.
      });
  }, [currentProject?.id, selectedId, detailCache]);

  const selectedReport: ApiReport | null = useMemo(() => {
    if (!selectedListItem) return null;
    const detail = selectedId ? detailCache[selectedId] : null;
    return { ...selectedListItem, ...(detail ?? {}) };
  }, [selectedListItem, selectedId, detailCache]);

  const displayAgents = useMemo(() => mergeAgentsWithTeamConfig(agents, config), [agents, config]);
  const contributors = useMemo(() => displayAgents, [displayAgents]);

  const sections = selectedReport ? parseReportContent(selectedReport) : [];

  const reportTitle =
    selectedReport?.title ??
    (currentProject ? `${currentProject.name} delivery debrief` : "Delivery debrief");
  const reportSubtitle = selectedReport
    ? `Report from ${
        selectedReport.created_at
          ? new Date(selectedReport.created_at).toLocaleDateString()
          : "recent session"
      } — ${
        (selectedReport.report_type || selectedReport.type) === "direction"
          ? "CTO direction report"
          : "session report"
      }`
    : currentProject
      ? `Orchestration reports for ${currentProject.name}. Execute a task to generate your first report.`
      : "No project selected.";

  const filenameBase = useMemo(() => {
    if (!selectedReport) return "sweaas-report";
    const title = selectedReport.title || "sweaas-report";
    const stamp = selectedReport.created_at
      ? new Date(selectedReport.created_at).toISOString().slice(0, 10)
      : "";
    const slug = title.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return stamp ? `${slug}-${stamp}` : slug;
  }, [selectedReport]);

  async function handleDownload(kind: "md" | "pdf") {
    if (!currentProject?.id || !selectedId) return;
    setDownloading(kind);
    setDownloadError(null);
    try {
      if (kind === "md") {
        await orchestrationApi.downloadReportMarkdown(
          currentProject.id,
          selectedId,
          `${filenameBase}.md`,
        );
      } else {
        await orchestrationApi.downloadReportPdf(
          currentProject.id,
          selectedId,
          `${filenameBase}.pdf`,
        );
      }
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Download failed. Try again in a moment.";
      setDownloadError(msg);
    } finally {
      setDownloading(null);
    }
  }

  const canDownload = !!selectedReport && !!selectedId;

  return (
    <div className="space-y-4">
      {(reports.length > 0 || canDownload) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#ece7f5] bg-white px-4 py-3">
          {reports.length > 1 && (
            <>
              <span className="text-[12px] font-semibold text-[#7a7390]">Report:</span>
              <select
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(Number(e.target.value))}
                className="rounded-lg border border-[#ece7f5] bg-[#faf8fd] px-3 py-1.5 text-[13px] text-[#1f1638] outline-none"
              >
                {reports.map((r, i) => (
                  <option key={r.report_id || r.id || i} value={i}>
                    {r.title || r.type || "Report"} —{" "}
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : `#${i + 1}`}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownload("md")}
              disabled={!canDownload || downloading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#ece7f5] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1f1638] transition-colors hover:bg-[#faf8fd] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText size={13} />
              {downloading === "md" ? "Downloading…" : "Download .md"}
            </button>
            <button
              type="button"
              onClick={() => handleDownload("pdf")}
              disabled={!canDownload || downloading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand)] px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={13} />
              {downloading === "pdf" ? "Downloading…" : "Download .pdf"}
            </button>
          </div>

          {downloadError && (
            <p className="basis-full text-[12px] text-red-600">{downloadError}</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#ece7f5] bg-white px-6 py-12 text-center text-[13px] text-[#7a7390]">
          Loading reports…
        </div>
      ) : (
        <CtoReport
          title={reportTitle}
          subtitle={reportSubtitle}
          contributors={contributors}
          sections={sections}
          channelName={currentProject?.name?.toLowerCase().replace(/\s+/g, "-")}
        />
      )}
    </div>
  );
}
