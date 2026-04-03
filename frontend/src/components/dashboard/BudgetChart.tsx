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

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#ece7f5] bg-white px-3 py-2 shadow-sm text-[11px] text-[#1f1638]">
      <p className="font-semibold mb-0.5">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="m-0" style={{ color: entry.color }}>
          {entry.name}: {entry.value}K
        </p>
      ))}
    </div>
  );
}

export default function BudgetChart() {
  const agents = useBudgetStore((s) => s.agents);

  const data = agents.map((a) => ({
    name: a.name.split(" ")[0],
    used: Math.round(a.tokens_used / 1000),
    budget: Math.round(a.token_budget / 1000),
  }));

  return (
    <div className="rounded-xl border border-[#ece7f5] bg-white px-4 py-3.5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[13px] font-semibold text-[#1f1638] m-0">Token Usage by Agent</p>
          <p className="text-[11px] text-[#7a7390] mt-0.5 m-0">Daily consumption vs. budget (K tokens)</p>
        </div>
        <div className="flex items-center gap-3">
          {[
            { color: "var(--brand)", label: "Used" },
            { color: "#ece7f5", label: "Budget", border: "var(--brand-border)" },
          ].map(({ color, label, border }) => (
            <div key={label} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ background: color, border: border ? `1px solid ${border}` : "none" }}
              />
              <span className="text-[10px] text-[#7a7390] font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 0, right: 4, left: -20, bottom: 0 }} barGap={3}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ece7f5" vertical={false} />
          <XAxis
            dataKey="name"
            fontSize={10}
            tick={{ fill: "#7a7390", fontFamily: "Plus Jakarta Sans" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            fontSize={10}
            tick={{ fill: "#7a7390", fontFamily: "Plus Jakarta Sans" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--brand-surface)" }} />
          <Bar dataKey="used"   fill="var(--brand)"        radius={[4,4,0,0]} />
          <Bar dataKey="budget" fill="#ece7f5" stroke="var(--brand-border)" strokeWidth={1} radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
