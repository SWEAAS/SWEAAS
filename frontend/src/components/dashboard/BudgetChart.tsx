import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useBudgetStore } from "../../store/budgetStore";

export default function BudgetChart() {
  const agents = useBudgetStore((s) => s.agents);

  const data = agents.map((a) => ({
    name: a.name.split(" ")[0],
    used: Math.round(a.tokens_used / 1000),
    budget: Math.round(a.token_budget / 1000),
  }));

  return (
    <div className="bg-white rounded-xl border border-sweaas-border p-5">
      <h3 className="font-semibold text-sweaas-text mb-4">
        Token Usage by Agent (K)
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" fontSize={11} tick={{ fill: "#64748b" }} />
          <YAxis fontSize={11} tick={{ fill: "#64748b" }} />
          <Tooltip />
          <Bar dataKey="used" fill="#2563eb" radius={[4, 4, 0, 0]} />
          <Bar dataKey="budget" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
