const tasks = [
  { id: 1, title: "Implement onboarding wizard UI",               agent: "Frontend Developer", status: "running" },
  { id: 2, title: "Project API endpoint with GitHub integration", agent: "Backend Architect",  status: "running" },
  { id: 3, title: "Sprint planning delegation",                   agent: "CTO Agent",           status: "completed" },
  { id: 4, title: "Q1 Campaign ROI analysis",                     agent: "Marketing Manager",  status: "running" },
  { id: 5, title: "Set up Docker Compose and CI pipeline",        agent: "DevOps Automator",   status: "queued" },
];

const statusStyle: Record<string, { bg: string; text: string; dot: string }> = {
  running:   { bg: "var(--brand-chip)",    text: "var(--brand)",  dot: "var(--brand)" },
  completed: { bg: "#ECFDF5",              text: "#059669",       dot: "#059669" },
  queued:    { bg: "#f8f6fc",              text: "#7a7390",       dot: "#7a7390" },
};

export default function TaskSummary() {
  return (
    <div className="rounded-[22px] border border-[#ece7f5] bg-white p-5 shadow-[0_12px_32px_-24px_rgba(42,26,92,0.22)]">
      <p className="text-[14px] font-bold text-[#1f1638] m-0 mb-1">Recent Tasks</p>
      <p className="text-[12px] text-[#7a7390] m-0 mb-4">Live agent activity</p>

      <div className="flex flex-col gap-0">
        {tasks.map((task, i) => {
          const s = statusStyle[task.status] ?? statusStyle.queued;
          return (
            <div
              key={task.id}
              className="flex items-center gap-3 py-2.5"
              style={{ borderBottom: i < tasks.length - 1 ? "1px solid #f8f6fc" : "none" }}
            >
              <div className="w-1.5 h-1.5 shrink-0 rounded-full" style={{ background: s.dot }} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1f1638] m-0 truncate">{task.title}</p>
                <p className="text-[11px] text-[#7a7390] m-0 mt-0.5">{task.agent}</p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
                style={{ background: s.bg, color: s.text }}
              >
                {task.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
