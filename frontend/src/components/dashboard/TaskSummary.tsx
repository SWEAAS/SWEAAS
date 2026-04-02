const tasks = [
  { id: 1, title: "Implement onboarding wizard UI",                agent: "Frontend Developer",  status: "running" },
  { id: 2, title: "Project API endpoint with GitHub integration",  agent: "Backend Architect",   status: "running" },
  { id: 3, title: "Sprint planning delegation",                    agent: "CTO Agent",            status: "completed" },
  { id: 4, title: "Q1 Campaign ROI analysis",                      agent: "Marketing Manager",   status: "running" },
  { id: 5, title: "Set up Docker Compose and CI pipeline",         agent: "DevOps Automator",    status: "queued" },
];

const statusStyle: Record<string, { bg: string; text: string; dot: string }> = {
  running:   { bg: "#EBF0FF", text: "#1B47D6", dot: "#1B47D6" },
  completed: { bg: "#ECFDF5", text: "#059669", dot: "#059669" },
  queued:    { bg: "#F5F8FE", text: "#8A96B0", dot: "#8A96B0" },
};

export default function TaskSummary() {
  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 14,
        border: "1px solid #E2E8F4",
        padding: "20px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <p style={{ fontSize: 14, fontWeight: 700, color: "#0C1526", margin: "0 0 4px" }}>
        Recent Tasks
      </p>
      <p style={{ fontSize: 12, color: "#8A96B0", margin: "0 0 16px" }}>
        Live agent activity
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {tasks.map((task, i) => {
          const s = statusStyle[task.status] ?? statusStyle.queued;
          return (
            <div
              key={task.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < tasks.length - 1 ? "1px solid #F5F8FE" : "none",
              }}
            >
              {/* Status dot */}
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: s.dot,
                  flexShrink: 0,
                }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#0C1526",
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {task.title}
                </p>
                <p style={{ fontSize: 11, color: "#8A96B0", margin: "2px 0 0" }}>
                  {task.agent}
                </p>
              </div>

              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: s.text,
                  background: s.bg,
                  padding: "3px 8px",
                  borderRadius: 20,
                  flexShrink: 0,
                  textTransform: "capitalize",
                }}
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
