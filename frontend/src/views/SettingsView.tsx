import { useEffect, useState } from "react";
import { CheckCircle, Palette, Save, Settings2, Sparkles } from "lucide-react";
import { projectApi } from "../api/client";
import { useProjectStore } from "../store/projectStore";
import { useThemeStore } from "../store/themeStore";

const PRESET_COLOURS = [
  { hex: "#7c5cff", label: "Purple" },
  { hex: "#1B47D6", label: "Blue" },
  { hex: "#059669", label: "Emerald" },
  { hex: "#e11d48", label: "Rose" },
  { hex: "#d97706", label: "Amber" },
  { hex: "#475569", label: "Slate" },
];

const inputClass =
  "w-full rounded-[12px] border border-[#ece7f5] bg-[#f8f6fc] px-4 py-3 text-[14px] text-[#1f1638] font-[inherit] outline-none transition-colors focus:border-[var(--brand-border)] focus:bg-white";

export default function SettingsView() {
  const { currentProject, projects, fetchProjects, setCurrentProject } = useProjectStore();
  const { brandHex, setBrand } = useThemeStore();
  const [config, setConfig] = useState({
    monthly_budget_usd: 2000,
    timeline_weeks: 8,
    departments: ["engineering", "product"],
    max_agents: 6,
    github_username: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleSave = async () => {
    if (!currentProject) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await projectApi.patchConfig(currentProject.id, {
        monthly_budget_usd: config.monthly_budget_usd,
        timeline_weeks: config.timeline_weeks,
        departments: config.departments,
        max_agents: config.max_agents,
        github_username: config.github_username || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save settings. Please try again.");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[32px] border border-[#e7e0f6] bg-[radial-gradient(circle_at_top_left,var(--brand-surface)_0%,transparent_40%),linear-gradient(180deg,#fcfbff_0%,#f7f5fb_100%)] p-7 shadow-[0_24px_70px_-50px_rgba(42,26,92,0.3)]">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-white/75 px-3 py-1 text-xs font-medium text-[var(--brand)] backdrop-blur">
          <Sparkles size={12} />
          Configuration
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[#1f1638]">Settings</h2>
            <p className="mt-1 text-sm text-[#675f7e]">Manage your project configuration and appearance.</p>
          </div>
          {projects.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#7a7390]">Project:</span>
              <select
                value={currentProject?.id ?? ""}
                onChange={(e) => {
                  const p = projects.find((proj) => proj.id === e.target.value);
                  if (p) setCurrentProject(p);
                }}
                className="rounded-[10px] border border-[#ece7f5] bg-white px-3 py-1.5 text-[13px] text-[#1f1638] outline-none focus:border-[var(--brand-border)]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* ── Appearance ─────────────────────────────────────────── */}
      <section className="rounded-[28px] border border-[#ece7f5] bg-white p-6 shadow-[0_16px_42px_-34px_rgba(42,26,92,0.25)]">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: "var(--brand-chip)" }}>
            <Palette size={15} className="text-[var(--brand)]" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#1f1638] m-0">Appearance</p>
            <p className="text-[11px] text-[#7a7390] m-0">Brand colour — updates the entire app in real time</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {PRESET_COLOURS.map(({ hex, label }) => (
            <button
              key={hex}
              title={label}
              onClick={() => setBrand(hex)}
              className="transition-transform hover:scale-110"
              style={{
                width: 30,
                height: 30,
                borderRadius: 9999,
                background: hex,
                border: "none",
                cursor: "pointer",
                outline: brandHex.toLowerCase() === hex.toLowerCase() ? `3px solid ${hex}` : "2px solid transparent",
                outlineOffset: 2,
                boxShadow: brandHex.toLowerCase() === hex.toLowerCase() ? `0 0 0 4px color-mix(in srgb, ${hex} 20%, transparent)` : "none",
              }}
            />
          ))}

          {/* Custom colour picker */}
          <label
            className="relative flex cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110"
            title="Custom colour"
            style={{
              width: 30,
              height: 30,
              background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
              boxShadow: "0 0 0 2px white, 0 0 0 3px #ece7f5",
            }}
          >
            <input
              type="color"
              value={brandHex}
              onChange={(e) => setBrand(e.target.value)}
              className="absolute opacity-0 inset-0 w-full h-full cursor-pointer"
            />
          </label>

          <span className="ml-1 rounded-[8px] border border-[#ece7f5] bg-[#f8f6fc] px-3 py-1 font-mono text-[12px] text-[#675f7e]">
            {brandHex}
          </span>
        </div>
      </section>

      {!currentProject && (
        <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-700">
          No project selected. Create a project first via the CTO Call page.
        </div>
      )}

      {/* ── Project config ─────────────────────────────────────── */}
      <section className="rounded-[28px] border border-[#ece7f5] bg-white p-6 shadow-[0_16px_42px_-34px_rgba(42,26,92,0.25)]">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: "var(--brand-chip)" }}>
            <Settings2 size={15} className="text-[var(--brand)]" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#1f1638] m-0">Project Configuration</p>
            <p className="text-[11px] text-[#7a7390] m-0">Budget, timeline, team structure</p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">Monthly Budget (USD)</label>
            <input
              type="number"
              value={config.monthly_budget_usd}
              onChange={(e) => setConfig((c) => ({ ...c, monthly_budget_usd: Number(e.target.value) }))}
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-[#7a7390]">
              Estimated agent team: {Math.max(3, Math.floor(config.monthly_budget_usd / 500))} agents
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">Max Agents</label>
            <input
              type="number"
              value={config.max_agents}
              onChange={(e) => setConfig((c) => ({ ...c, max_agents: Number(e.target.value) }))}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">
              Timeline — {config.timeline_weeks} weeks
            </label>
            <input
              type="range"
              min={1}
              max={52}
              value={config.timeline_weeks}
              onChange={(e) => setConfig((c) => ({ ...c, timeline_weeks: Number(e.target.value) }))}
              className="w-full"
              style={{ accentColor: "var(--brand)" }}
            />
            <div className="mt-1 flex justify-between text-[10px] text-[#7a7390]">
              <span>1 week</span><span>52 weeks</span>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[12px] font-semibold text-[#675f7e]">Active Departments</label>
            <div className="flex flex-wrap gap-2">
              {["engineering", "marketing", "product", "support"].map((dept) => {
                const active = config.departments.includes(dept);
                return (
                  <button
                    key={dept}
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        departments: active
                          ? c.departments.filter((d) => d !== dept)
                          : [...c.departments, dept],
                      }))
                    }
                    className="rounded-full border px-4 py-1.5 text-[12px] capitalize transition-all font-medium"
                    style={{
                      background: active ? "var(--brand-chip)" : "#f8f6fc",
                      color: active ? "var(--brand)" : "#7a7390",
                      borderColor: active ? "var(--brand-border)" : "#ece7f5",
                    }}
                  >
                    {dept}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">GitHub Username</label>
            <input
              type="text"
              value={config.github_username}
              onChange={(e) => setConfig((c) => ({ ...c, github_username: e.target.value }))}
              placeholder="your-github-handle"
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-[#7a7390]">
              Will be added as a collaborator on the project's GitHub repo.
            </p>
          </div>
        </div>

        {error && <p className="mt-4 text-[13px] text-red-600">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving || !currentProject}
          className="mt-6 flex items-center gap-2 rounded-[12px] px-6 py-3 text-[14px] font-bold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--brand)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-dark)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--brand)"; }}
        >
          {saved ? (
            <><CheckCircle size={16} /> Saved</>
          ) : (
            <><Save size={16} /> {saving ? "Saving…" : "Save Settings"}</>
          )}
        </button>
      </section>
    </div>
  );
}
