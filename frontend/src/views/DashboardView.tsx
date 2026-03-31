import { useEffect } from "react";
import { Users, Zap, AlertTriangle, CheckCircle } from "lucide-react";
import AgentCard from "../components/dashboard/AgentCard";
import BudgetChart from "../components/dashboard/BudgetChart";
import TaskSummary from "../components/dashboard/TaskSummary";
import { useAgentStore } from "../store/agentStore";
import { useBudgetStore } from "../store/budgetStore";

export default function DashboardView() {
  const { agents, fetchAgents } = useAgentStore();
  const { consumptionPercent, fetchSummary } = useBudgetStore();

  useEffect(() => {
    fetchAgents();
    fetchSummary();
  }, [fetchAgents, fetchSummary]);

  const activeCount = agents.filter((a) => a.status === "active").length;
  const warningCount = agents.filter((a) => a.status === "warning").length;
  const runningTasks = 4;

  const stats = [
    {
      label: "Active Agents",
      value: activeCount,
      icon: Users,
      color: "text-sweaas-blue",
      bg: "bg-sweaas-blue/10",
    },
    {
      label: "Running Tasks",
      value: runningTasks,
      icon: Zap,
      color: "text-green-500",
      bg: "bg-green-50",
    },
    {
      label: "Warnings",
      value: warningCount,
      icon: AlertTriangle,
      color: "text-sweaas-yellow",
      bg: "bg-yellow-50",
    },
    {
      label: "Budget Used",
      value: `${consumptionPercent}%`,
      icon: CheckCircle,
      color: "text-sweaas-blue",
      bg: "bg-sweaas-blue/10",
    },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-sweaas-text mb-6">Dashboard</h2>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-xl border border-sweaas-border p-5"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <Icon size={20} className={stat.color} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-sweaas-text">
                    {stat.value}
                  </p>
                  <p className="text-xs text-sweaas-text-secondary">
                    {stat.label}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="col-span-2">
          <BudgetChart />
        </div>
        <TaskSummary />
      </div>

      {/* Agent Grid */}
      <h3 className="text-lg font-semibold text-sweaas-text mb-4">
        Agent Directory
      </h3>
      <div className="grid grid-cols-3 gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.agent_id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
