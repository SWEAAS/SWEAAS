import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle, Palette, RefreshCw, Save, Settings2, Sparkles, Video } from "lucide-react";
import {
  communicationApi,
  notificationApi,
  projectApi,
  type TavusReconciliationItem,
  type TavusReconciliationResponse,
  type TavusWarmCheckAttempt,
} from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useNotificationStore } from "../store/notificationStore";
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
  const user = useAuthStore((state) => state.user);
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
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [warmCheckLoading, setWarmCheckLoading] = useState(false);
  const [warmCheckResult, setWarmCheckResult] = useState<TavusWarmCheckAttempt[] | null>(null);
  const [warmCheckOk, setWarmCheckOk] = useState<boolean | null>(null);
  const [reconciliation, setReconciliation] = useState<TavusReconciliationResponse | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);

  const { preferences, fetchPreferences, updatePreferences } = useNotificationStore();
  const [phoneInput, setPhoneInput] = useState("");
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  const isAdmin = useMemo(() => {
    const role = (user?.role ?? "").toLowerCase();
    return user?.email === "user@sweaas.dev" || role === "owner" || role === "admin";
  }, [user?.email, user?.role]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchPreferences(); }, [fetchPreferences]);

  const handleNotifSave = async () => {
    if (!preferences) return;
    setNotifSaving(true);
    try {
      if (phoneInput) {
        await notificationApi.updateContactInfo({ phone_number: phoneInput });
      }
      await updatePreferences({
        email_enabled: preferences.email_enabled,
        sms_enabled: preferences.sms_enabled,
        in_app_enabled: preferences.in_app_enabled,
        report_notifications: preferences.report_notifications,
        budget_notifications: preferences.budget_notifications,
        action_required_notifications: preferences.action_required_notifications,
        feedback_notifications: preferences.feedback_notifications,
        agent_status_notifications: preferences.agent_status_notifications,
        security_notifications: preferences.security_notifications,
        budget_threshold_percent: preferences.budget_threshold_percent,
        digest_enabled: preferences.digest_enabled,
        digest_frequency: preferences.digest_frequency,
        quiet_hours_start: preferences.quiet_hours_start,
        quiet_hours_end: preferences.quiet_hours_end,
        timezone: preferences.timezone,
      });
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 3000);
    } catch {
      /* silent */
    } finally {
      setNotifSaving(false);
    }
  };

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

  const handleFetchFreshProfiles = async () => {
    setWarmCheckLoading(true);
    setWarmCheckResult(null);
    setWarmCheckOk(null);
    setReconciliation(null);
    setReconciliationError(null);
    setActionMessage(null);
    setDismissedKeys([]);
    setSyncModalOpen(true);

    try {
      const response = await communicationApi.warmCheckReplicas();
      setWarmCheckResult(response.data.attempts);
      setWarmCheckOk(response.data.ok);
    } catch (syncError) {
      setWarmCheckResult(null);
      setWarmCheckOk(false);
      setReconciliationError("Warm check failed before Tavus could confirm availability.");
    } finally {
      setWarmCheckLoading(false);
    }
  };

  const loadReconciliation = async () => {
    setReconciliationLoading(true);
    setReconciliationError(null);
    setActionMessage(null);
    try {
      const response = await communicationApi.reconcileReplicas();
      setReconciliation(response.data);
    } catch (syncError) {
      setReconciliationError("Could not compare Tavus personas with the local catalog.");
    } finally {
      setReconciliationLoading(false);
    }
  };

  const handleReconciliationAction = async (
    item: TavusReconciliationItem,
    action: "append_new_replica" | "update_stored_replica" | "replace_with_live" | "delete_database_replica" | "dismiss",
  ) => {
    const databaseReplicaId = item.database_replica?.replica_id ?? null;
    const liveReplicaId = item.live_replica?.replica_id ?? null;
    const loadingKey = `${databaseReplicaId ?? "none"}:${liveReplicaId ?? "none"}`;
    if (action === "dismiss") {
      setDismissedKeys((current) => [...current, loadingKey]);
      setActionMessage("Dismissed for this review session.");
      return;
    }
    setActionLoadingKey(loadingKey);
    setActionMessage(null);

    try {
      await communicationApi.applyReplicaReconciliationAction({
        action,
        database_replica_id: databaseReplicaId,
        live_replica_id: liveReplicaId,
      });
      setActionMessage("Replica catalog updated.");
      await loadReconciliation();
    } catch (syncError) {
      setReconciliationError("The requested catalog update did not complete.");
    } finally {
      setActionLoadingKey(null);
    }
  };

  return (
    <>
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

      {isAdmin ? (
        <section className="rounded-[28px] border border-[#ece7f5] bg-white p-6 shadow-[0_16px_42px_-34px_rgba(42,26,92,0.25)]">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: "var(--brand-chip)" }}>
              <RefreshCw size={15} className="text-[var(--brand)]" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-[#1f1638] m-0">Persona Catalog</p>
              <p className="text-[11px] text-[#7a7390] m-0">Admin-only Tavus warm check, reconciliation, and catalog refresh.</p>
            </div>
          </div>

          <p className="text-[13px] leading-6 text-[#675f7e]">
            Fetch fresh profiles checks Tavus availability first, then lets you review mismatches before updating the stored persona catalog used by the app.
          </p>

          <button
            type="button"
            onClick={handleFetchFreshProfiles}
            disabled={warmCheckLoading}
            className="mt-5 inline-flex items-center gap-2 rounded-[12px] px-5 py-3 text-[14px] font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            <RefreshCw size={16} className={warmCheckLoading ? "animate-spin" : ""} />
            {warmCheckLoading ? "Checking Tavus…" : "Fetch fresh profiles"}
          </button>
        </section>
      ) : null}

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

      {/* ── Notification preferences ──────────────────────────── */}
      <section className="rounded-[28px] border border-[#ece7f5] bg-white p-6 shadow-[0_16px_42px_-34px_rgba(42,26,92,0.25)]">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: "var(--brand-chip)" }}>
            <Bell size={15} className="text-[var(--brand)]" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#1f1638] m-0">Notification Preferences</p>
            <p className="text-[11px] text-[#7a7390] m-0">Control how and when you receive alerts</p>
          </div>
        </div>

        {preferences ? (
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">Phone number (for SMS)</label>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+1 (555) 123-4567"
                className={inputClass}
              />
            </div>

            <div>
              <p className="mb-2 text-[12px] font-semibold text-[#675f7e]">Channels</p>
              <div className="flex flex-wrap gap-4">
                {([
                  ["email_enabled", "Email"],
                  ["sms_enabled", "SMS"],
                  ["in_app_enabled", "In-app"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-[13px] text-[#1f1638] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences[key]}
                      onChange={(e) => updatePreferences({ [key]: e.target.checked })}
                      className="accent-[var(--brand)] w-4 h-4"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[12px] font-semibold text-[#675f7e]">Notification types</p>
              <div className="grid gap-2 md:grid-cols-2">
                {([
                  ["report_notifications", "Reports generated"],
                  ["budget_notifications", "Budget alerts"],
                  ["action_required_notifications", "Action required"],
                  ["feedback_notifications", "Feedback received"],
                  ["agent_status_notifications", "Agent status changes"],
                  ["security_notifications", "Security alerts"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-[13px] text-[#1f1638] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences[key]}
                      onChange={(e) => updatePreferences({ [key]: e.target.checked })}
                      className="accent-[var(--brand)] w-4 h-4"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">Budget alert threshold (%)</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={preferences.budget_threshold_percent}
                  onChange={(e) => updatePreferences({ budget_threshold_percent: Math.max(10, Math.min(100, Number(e.target.value) || 85)) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">Timezone</label>
                <input
                  type="text"
                  value={preferences.timezone}
                  onChange={(e) => updatePreferences({ timezone: e.target.value })}
                  placeholder="UTC"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">Quiet hours start</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={preferences.quiet_hours_start ?? ""}
                  onChange={(e) => updatePreferences({ quiet_hours_start: e.target.value ? Number(e.target.value) : null })}
                  placeholder="e.g. 22 (10 PM)"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">Quiet hours end</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={preferences.quiet_hours_end ?? ""}
                  onChange={(e) => updatePreferences({ quiet_hours_end: e.target.value ? Number(e.target.value) : null })}
                  placeholder="e.g. 8 (8 AM)"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[13px] text-[#1f1638] cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.digest_enabled}
                  onChange={(e) => updatePreferences({ digest_enabled: e.target.checked })}
                  className="accent-[var(--brand)] w-4 h-4"
                />
                Daily digest email
              </label>
            </div>

            <button
              onClick={handleNotifSave}
              disabled={notifSaving}
              className="inline-flex items-center gap-2 rounded-[12px] px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {notifSaving ? "Saving…" : notifSaved ? <><CheckCircle size={14} /> Saved</> : <><Save size={14} /> Save preferences</>}
            </button>
          </div>
        ) : (
          <p className="text-[13px] text-[#7a7390]">Loading notification preferences…</p>
        )}
      </section>

      {!currentProject && (
        <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-700">
          No project selected. Create a project first via the Cto Call page.
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
    {syncModalOpen ? (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#120d1f]/40 p-4 backdrop-blur-sm">
        <div className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#ece7f5] bg-white shadow-[0_28px_90px_-48px_rgba(22,18,40,0.42)]">
          <div className="flex items-start justify-between gap-4 border-b border-[#f0ebf8] px-6 py-5">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
                Tavus Persona Sync
              </p>
              <h3 className="mt-1 text-[24px] font-semibold tracking-tight text-[#1f1638]">
                {warmCheckLoading
                  ? "Checking Tavus availability"
                  : warmCheckOk
                    ? "Tavus is reachable"
                    : "Warm check failed"}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSyncModalOpen(false)}
              className="rounded-full border border-[#ece7f5] px-3 py-1.5 text-[12px] font-semibold text-[#675f7e]"
            >
              Close
            </button>
          </div>

          <div className="max-h-[80vh] overflow-y-auto px-6 py-6">
            {warmCheckLoading ? (
              <div className="rounded-[22px] border border-[#ece7f5] bg-[#faf8fd] px-5 py-8 text-[14px] text-[#675f7e]">
                Running the Tavus warm check with retry backoff before we compare personas.
              </div>
            ) : null}

            {!warmCheckLoading && warmCheckResult ? (
              <div className="space-y-4">
                <div
                  className="rounded-[22px] border px-5 py-4"
                  style={{
                    borderColor: warmCheckOk ? "#d7efe2" : "#f2d7d7",
                    background: warmCheckOk ? "#f5fdf8" : "#fff7f7",
                  }}
                >
                  <div className="flex items-center gap-2 text-[14px] font-semibold text-[#1f1638]">
                    {warmCheckOk ? <CheckCircle size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-red-600" />}
                    {warmCheckOk
                      ? "Warm check succeeded. Tavus replied successfully."
                      : "Warm check failed. The attempt log below matches what was sent to Sentry."}
                  </div>
                  {reconciliationError ? (
                    <p className="mt-2 text-[13px] text-red-600">{reconciliationError}</p>
                  ) : null}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {warmCheckResult.map((attempt) => (
                    <div key={attempt.attempt} className="rounded-[18px] border border-[#ece7f5] bg-[#faf8fd] px-4 py-4">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#7a7390]">
                        Attempt {attempt.attempt}
                      </p>
                      <p className="mt-2 text-[14px] font-semibold text-[#1f1638]">
                        Status {attempt.status_code || "network-error"}
                      </p>
                      <p className="mt-1 text-[12px] text-[#675f7e]">
                        Waited {attempt.delay_seconds}s before this try.
                      </p>
                      <pre className="mt-3 overflow-x-auto rounded-[14px] bg-white p-3 text-[11px] leading-5 text-[#675f7e]">
                        {JSON.stringify(attempt.payload, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>

                {warmCheckOk ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={loadReconciliation}
                      disabled={reconciliationLoading}
                      className="inline-flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                      style={{ background: "var(--brand)" }}
                    >
                      <RefreshCw size={15} className={reconciliationLoading ? "animate-spin" : ""} />
                      {reconciliationLoading ? "Comparing personas…" : "See persona changes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSyncModalOpen(false)}
                      className="rounded-[12px] border border-[#ece7f5] px-4 py-2.5 text-[13px] font-semibold text-[#675f7e]"
                    >
                      Not now
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {reconciliation ? (
              <div className="mt-8 space-y-8">
                {actionMessage ? (
                  <div className="rounded-[18px] border border-[#d7efe2] bg-[#f5fdf8] px-4 py-3 text-[13px] text-emerald-700">
                    {actionMessage}
                  </div>
                ) : null}

                {([
                  ["Name Mismatch", reconciliation.name_mismatch],
                  ["Missing In Database", reconciliation.missing_in_database],
                  ["Updates To Stored Replica", reconciliation.updates_to_stored_replica],
                ] as Array<[string, TavusReconciliationItem[]]>).map(([label, items]) => (
                  <div key={label} className="space-y-4">
                    <div>
                      <h4 className="text-[17px] font-semibold text-[#1f1638]">{label}</h4>
                      <p className="mt-1 text-[12px] text-[#7a7390]">{items.length} item(s)</p>
                    </div>
                    {items.length === 0 ? (
                      <div className="rounded-[18px] border border-dashed border-[#ece7f5] bg-[#faf8fd] px-4 py-5 text-[13px] text-[#7a7390]">
                        No items in this group.
                      </div>
                    ) : (
                      <div className="grid gap-4 lg:grid-cols-2">
                        {items
                          .filter((item) => {
                            const itemKey = `${item.database_replica?.replica_id ?? "none"}:${item.live_replica?.replica_id ?? "none"}`;
                            return !dismissedKeys.includes(itemKey);
                          })
                          .map((item) => {
                          const cardKey = `${item.database_replica?.replica_id ?? "none"}:${item.live_replica?.replica_id ?? "none"}`;
                          const isActionLoading = actionLoadingKey === cardKey;
                          const liveReplica = item.live_replica;
                          const showVideo = previewVideoId === liveReplica?.replica_id;
                          const impactedUsage = item.impacted_onboarding_usage;
                          const hasDeleteRisk = Boolean(
                            impactedUsage &&
                            impactedUsage.total_assignment_count > 0 &&
                            item.actions.some((action) => action === "delete_database_replica" || action === "replace_with_live"),
                          );
                          return (
                            <div key={cardKey} className="rounded-[22px] border border-[#ece7f5] bg-white p-5 shadow-[0_16px_36px_-30px_rgba(17,24,39,0.22)]">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">
                                    {item.reason.replaceAll("_", " ")}
                                  </p>
                                  {item.changed_fields.length > 0 ? (
                                    <p className="mt-2 text-[12px] text-[#7a7390]">
                                      Changed: {item.changed_fields.join(", ")}
                                    </p>
                                  ) : null}
                                  {impactedUsage && impactedUsage.total_assignment_count > 0 ? (
                                    <p className="mt-2 text-[12px] text-[#7a7390]">
                                      Used in {impactedUsage.total_assignment_count} saved assignment(s) across {impactedUsage.organization_count} org(s).
                                    </p>
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <div className="rounded-[18px] bg-[#faf8fd] p-4">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a7390]">Database</p>
                                  <p className="mt-2 text-[14px] font-semibold text-[#1f1638]">{item.database_replica?.replica_name ?? "No stored match"}</p>
                                  <p className="mt-1 text-[12px] text-[#675f7e]">{item.database_replica?.replica_id ?? "n/a"}</p>
                                  <p className="mt-1 text-[12px] text-[#675f7e]">{item.database_replica?.model_name ?? "n/a"}</p>
                                </div>
                                <div className="rounded-[18px] bg-[#faf8fd] p-4">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a7390]">Live Tavus</p>
                                  <p className="mt-2 text-[14px] font-semibold text-[#1f1638]">{liveReplica?.replica_name ?? "No live candidate"}</p>
                                  <p className="mt-1 text-[12px] text-[#675f7e]">{liveReplica?.replica_id ?? "n/a"}</p>
                                  <p className="mt-1 text-[12px] text-[#675f7e]">{liveReplica?.model_name ?? "n/a"}</p>
                                </div>
                              </div>

                              {liveReplica?.thumbnail_video_url ? (
                                <div className="mt-4 rounded-[18px] border border-[#ece7f5] bg-[#faf8fd] p-4">
                                  {showVideo ? (
                                    <video
                                      src={liveReplica.thumbnail_video_url}
                                      controls
                                      className="aspect-[4/3] w-full rounded-[14px] object-cover"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setPreviewVideoId(liveReplica.replica_id)}
                                      className="inline-flex items-center gap-2 rounded-[12px] border border-[#ece7f5] bg-white px-4 py-2 text-[13px] font-semibold text-[#675f7e]"
                                    >
                                      <Video size={14} />
                                      Preview video before deciding
                                    </button>
                                  )}
                                </div>
                              ) : null}

                              <div className="mt-4 flex flex-wrap gap-2">
                                {item.actions.map((action) => (
                                  <button
                                    key={action}
                                    type="button"
                                    onClick={() => handleReconciliationAction(item, action as Parameters<typeof handleReconciliationAction>[1])}
                                    disabled={Boolean(actionLoadingKey)}
                                    className="rounded-[12px] border px-3 py-2 text-[12px] font-semibold capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                    style={{
                                      borderColor: action === "dismiss" ? "#ece7f5" : "var(--brand-border)",
                                      background: action === "dismiss" ? "#ffffff" : "var(--brand-surface)",
                                      color: action === "dismiss" ? "#675f7e" : "var(--brand)",
                                    }}
                                  >
                                    {action === "replace_with_live"
                                      ? "Delete old and append new"
                                      : action === "delete_database_replica"
                                        ? "Delete from database"
                                        : action === "append_new_replica"
                                          ? "Append new replica"
                                          : action === "update_stored_replica"
                                            ? "Update stored replica"
                                            : "Dismiss"}
                                  </button>
                                ))}
                              </div>
                              {hasDeleteRisk ? (
                                <p className="mt-3 text-[12px] text-amber-700">
                                  Risk: removing this stored face also affects {impactedUsage?.total_assignment_count} saved onboarding assignment(s) across {impactedUsage?.organization_count} org(s).
                                </p>
                              ) : null}
                              {isActionLoading ? (
                                <p className="mt-3 text-[12px] text-[#7a7390]">Applying action…</p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
