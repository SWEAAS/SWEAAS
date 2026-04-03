import { useEffect, useMemo, useState } from "react";
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
  session_summary?: string;
  direction_report?: string;
  content?: string;
  created_at?: string;
}

function parseReportContent(report: ApiReport): ReportSection[] {
  const raw = report.direction_report || report.session_summary || report.content || "";
  if (!raw) return [];

  const sections: ReportSection[] = [];
  const reportTimestamp = report.created_at;

  if (report.session_summary) {
    sections.push({
      id: "session-summary",
      eyebrow: "Session summary",
      title: "What was accomplished",
      body: report.session_summary,
      created_at: reportTimestamp,
    });
  }

  if (report.direction_report) {
    const lines = report.direction_report.split("\n").filter((l) => l.trim());
    let currentSection: ReportSection | null = null;

    for (const line of lines) {
      const headerMatch = line.match(/^#+\s+(.+)/);
      if (headerMatch) {
        if (currentSection) sections.push(currentSection);
        currentSection = {
          id: headerMatch[1].toLowerCase().replace(/\s+/g, "-"),
          eyebrow: "CTO direction",
          title: headerMatch[1],
          bullets: [],
          created_at: reportTimestamp,
        };
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        if (currentSection) {
          currentSection.bullets = currentSection.bullets || [];
          currentSection.bullets.push(line.replace(/^[-*]\s+/, ""));
        }
      } else if (currentSection) {
        if (!currentSection.body) {
          currentSection.body = line.trim();
        } else {
          currentSection.body += " " + line.trim();
        }
      }
    }
    if (currentSection) sections.push(currentSection);
  }

  if (sections.length === 0 && raw) {
    sections.push({
      id: "report-content",
      eyebrow: report.type === "direction" ? "CTO direction" : "Session report",
      title: report.title || "Report",
      body: raw.slice(0, 2000),
      created_at: reportTimestamp,
    });
  }

  return sections;
}

export default function ReportsView() {
  const { agents, fetchAgents } = useAgentStore();
  const { currentProject, fetchProjects } = useProjectStore();
  const { config, fetchConfig } = useTeamOnboardingStore();
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAgents();
    fetchProjects();
    fetchConfig();
  }, [fetchAgents, fetchProjects, fetchConfig]);

  useEffect(() => {
    if (!currentProject?.id) return;
    setLoading(true);

    Promise.all([
      orchestrationApi.reports(currentProject.id).catch(() => null),
      observabilityApi.reports().catch(() => null),
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

  const displayAgents = useMemo(() => mergeAgentsWithTeamConfig(agents, config), [agents, config]);
  const contributors = useMemo(() => displayAgents, [displayAgents]);

  const selectedReport = reports[selectedIndex] ?? null;
  const sections = selectedReport ? parseReportContent(selectedReport) : [];

  const reportTitle = selectedReport?.title
    ?? (currentProject ? `${currentProject.name} delivery debrief` : "Delivery debrief");
  const reportSubtitle = selectedReport
    ? `Report from ${selectedReport.created_at ? new Date(selectedReport.created_at).toLocaleDateString() : "recent session"} — ${selectedReport.type === "direction" ? "CTO direction report" : "session report"}`
    : currentProject
      ? `Orchestration reports for ${currentProject.name}. Execute a task to generate your first report.`
      : "No project selected.";

  return (
    <div className="space-y-4">
      {reports.length > 1 && (
        <div className="flex items-center gap-2 rounded-xl border border-[#ece7f5] bg-white px-4 py-3">
          <span className="text-[12px] font-semibold text-[#7a7390]">Report:</span>
          <select
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(Number(e.target.value))}
            className="rounded-lg border border-[#ece7f5] bg-[#faf8fd] px-3 py-1.5 text-[13px] text-[#1f1638] outline-none"
          >
            {reports.map((r, i) => (
              <option key={r.report_id || r.id || i} value={i}>
                {r.title || r.type || "Report"} — {r.created_at ? new Date(r.created_at).toLocaleDateString() : `#${i + 1}`}
              </option>
            ))}
          </select>
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
