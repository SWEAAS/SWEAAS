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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F4",
        borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "var(--shadow-md)",
        fontSize: 12,
        color: "#0C1526",
      }}
    >
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color, margin: "2px 0", fontWeight: 500 }}>
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
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 14,
        border: "1px solid #E2E8F4",
        padding: "20px 20px 12px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#0C1526", margin: 0 }}>
          Token Usage by Agent
        </p>
        <p style={{ fontSize: 12, color: "#8A96B0", margin: "3px 0 0" }}>
          Daily consumption vs. budget (K tokens)
        </p>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        {[
          { color: "#1B47D6", label: "Used" },
          { color: "#EEF2FB", label: "Budget", border: "#C3D0F8" },
        ].map(({ color, label, border }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: color,
                border: border ? `1px solid ${border}` : "none",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: "#4D5E80", fontWeight: 500 }}>{label}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 4, left: -20, bottom: 0 }} barGap={3}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF2FB" vertical={false} />
          <XAxis
            dataKey="name"
            fontSize={11}
            tick={{ fill: "#8A96B0", fontFamily: "Plus Jakarta Sans" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            fontSize={11}
            tick={{ fill: "#8A96B0", fontFamily: "Plus Jakarta Sans" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#F5F8FE" }} />
          <Bar dataKey="used"   fill="#1B47D6" radius={[5,5,0,0]} />
          <Bar dataKey="budget" fill="#EEF2FB" stroke="#C3D0F8" strokeWidth={1} radius={[5,5,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
