import { CheckCircle, Clock, AlertCircle, PlayCircle } from "lucide-react";

const tasks = [
  {
    id: 1,
    title: "Implement onboarding wizard UI",
    agent: "Frontend Developer",
    status: "running",
    icon: PlayCircle,
    color: "text-sweaas-blue",
  },
  {
    id: 2,
    title: "Project API endpoint with GitHub integration",
    agent: "Backend Architect",
    status: "running",
    icon: PlayCircle,
    color: "text-sweaas-blue",
  },
  {
    id: 3,
    title: "Sprint planning delegation",
    agent: "CTO Agent",
    status: "completed",
    icon: CheckCircle,
    color: "text-green-500",
  },
  {
    id: 4,
    title: "Q1 Campaign ROI analysis",
    agent: "Marketing Manager",
    status: "running",
    icon: Clock,
    color: "text-sweaas-yellow",
  },
  {
    id: 5,
    title: "Set up Docker Compose and CI pipeline",
    agent: "DevOps Automator",
    status: "queued",
    icon: AlertCircle,
    color: "text-gray-400",
  },
];

export default function TaskSummary() {
  return (
    <div className="bg-white rounded-xl border border-sweaas-border p-5">
      <h3 className="font-semibold text-sweaas-text mb-4">Recent Tasks</h3>
      <div className="space-y-3">
        {tasks.map((task) => {
          const Icon = task.icon;
          return (
            <div
              key={task.id}
              className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
            >
              <Icon size={16} className={task.color} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-sweaas-text truncate">
                  {task.title}
                </p>
                <p className="text-xs text-sweaas-text-secondary">
                  {task.agent}
                </p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  task.status === "completed"
                    ? "bg-green-50 text-green-600"
                    : task.status === "running"
                      ? "bg-blue-50 text-sweaas-blue"
                      : "bg-gray-50 text-gray-500"
                }`}
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
