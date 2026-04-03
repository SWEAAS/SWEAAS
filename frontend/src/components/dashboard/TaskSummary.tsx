import { useEffect, useState } from "react";
import { useProjectStore } from "../../store/projectStore";
import { orchestrationApi } from "../../api/client";

interface TaskItem {
  id: string;
  title: string;
  agent: string;
  status: string;
}

const statusStyle: Record<string, { bg: string; text: string; dot: string }> = {
  running:   { bg: "var(--brand-chip)",    text: "var(--brand)",  dot: "var(--brand)" },
  completed: { bg: "#ECFDF5",              text: "#059669",       dot: "#059669" },
  queued:    { bg: "#f8f6fc",              text: "#7a7390",       dot: "#7a7390" },
  pending:   { bg: "#f8f6fc",              text: "#7a7390",       dot: "#7a7390" },
  failed:    { bg: "#FEF2F2",              text: "#DC2626",       dot: "#DC2626" },
};

export default function TaskSummary() {
  const { currentProject } = useProjectStore();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentProject?.id) return;
    setLoading(true);

    Promise.all([
      orchestrationApi.sessions(currentProject.id).catch(() => null),
      orchestrationApi.status(currentProject.id).catch(() => null),
    ]).then(([sessionsRes, statusRes]) => {
      const items: TaskItem[] = [];

      const sessions = sessionsRes?.data?.sessions ?? [];
      for (const s of sessions.slice(0, 5)) {
        items.push({
          id: s.session_id ?? s.id ?? crypto.randomUUID(),
          title: s.task ?? s.session_summary?.slice(0, 60) ?? "Orchestration session",
          agent: s.lead_agent ?? s.agent_name ?? s.assigned_agent ?? "Agent",
          status: s.status ?? "completed",
        });
      }

      if (statusRes?.data?.status === "running") {
        const activeSessions = statusRes.data.active_sessions ?? [];
        for (const sid of activeSessions) {
          if (!items.some((t) => t.id === sid)) {
            items.unshift({
              id: sid,
              title: statusRes.data.current_task ?? "Active session",
              agent: `${statusRes.data.active_agents ?? 0} agent${(statusRes.data.active_agents ?? 0) === 1 ? "" : "s"}`,
              status: "running",
            });
          }
        }
      }

      setTasks(items.slice(0, 5));
    }).finally(() => setLoading(false));
  }, [currentProject?.id]);

  return (
    <div className="rounded-xl border border-[#ece7f5] bg-white px-4 py-3.5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[13px] font-semibold text-[#1f1638] m-0">Recent Tasks</p>
          <p className="text-[11px] text-[#7a7390] m-0 mt-0.5">Live agent activity</p>
        </div>
      </div>

      <div className="divide-y divide-[#ece7f5]">
        {loading ? (
          <div className="py-4 text-center text-[12px] text-[#7a7390]">Loading tasks…</div>
        ) : tasks.length === 0 ? (
          <div className="py-4 text-center text-[12px] text-[#7a7390]">
            No orchestration sessions yet. Execute a task to get started.
          </div>
        ) : (
          tasks.map((task) => {
            const s = statusStyle[task.status] ?? statusStyle.queued;
            return (
              <div
                key={task.id}
                className="flex items-center gap-2.5 py-2"
              >
                <div className="w-1.5 h-1.5 shrink-0 rounded-full" style={{ background: s.dot }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[#1f1638] m-0 truncate">{task.title}</p>
                  <p className="text-[10px] text-[#7a7390] m-0 mt-0.5">{task.agent}</p>
                </div>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize"
                  style={{ background: s.bg, color: s.text }}
                >
                  {task.status}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
