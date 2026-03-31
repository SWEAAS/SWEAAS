import { useState } from "react";
import { Save } from "lucide-react";

export default function SettingsView() {
  const [config, setConfig] = useState({
    monthly_budget_usd: 5000,
    timeline_weeks: 4,
    departments: ["engineering", "product"],
    max_agents: 8,
    github_username: "",
  });

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-sweaas-text mb-6">
        Project Settings
      </h2>

      <div className="bg-white rounded-xl border border-sweaas-border p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Monthly Budget (USD)
          </label>
          <input
            type="number"
            value={config.monthly_budget_usd}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                monthly_budget_usd: Number(e.target.value),
              }))
            }
            className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Max Agents
          </label>
          <input
            type="number"
            value={config.max_agents}
            onChange={(e) =>
              setConfig((c) => ({ ...c, max_agents: Number(e.target.value) }))
            }
            className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Timeline (weeks)
          </label>
          <input
            type="range"
            min={1}
            max={52}
            value={config.timeline_weeks}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                timeline_weeks: Number(e.target.value),
              }))
            }
            className="w-full accent-sweaas-blue"
          />
          <p className="text-sm text-sweaas-text-secondary mt-1">
            {config.timeline_weeks} weeks
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Active Departments
          </label>
          <div className="flex gap-3">
            {["engineering", "marketing", "product"].map((dept) => (
              <button
                key={dept}
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    departments: c.departments.includes(dept)
                      ? c.departments.filter((d) => d !== dept)
                      : [...c.departments, dept],
                  }))
                }
                className={`px-4 py-2 rounded-lg border text-sm capitalize transition-colors ${
                  config.departments.includes(dept)
                    ? "border-sweaas-blue bg-sweaas-blue/5 text-sweaas-blue"
                    : "border-sweaas-border text-sweaas-text-secondary"
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            GitHub Username
          </label>
          <input
            type="text"
            value={config.github_username}
            onChange={(e) =>
              setConfig((c) => ({ ...c, github_username: e.target.value }))
            }
            placeholder="your-github-handle"
            className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
          />
        </div>

        <button className="flex items-center gap-2 px-6 py-3 bg-sweaas-blue text-white rounded-lg font-medium hover:bg-sweaas-blue-dark transition-colors">
          <Save size={16} /> Save Settings
        </button>
      </div>
    </div>
  );
}
