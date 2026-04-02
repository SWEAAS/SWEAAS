import { useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  GitBranch,
  CreditCard,
  CheckCircle,
  Sparkles,
} from "lucide-react";

type Step = "company" | "github" | "budget" | "departments" | "review";

const inputClass =
  "w-full rounded-[12px] border border-[#ece7f5] bg-[#f8f6fc] px-4 py-3 text-[14px] text-[#1f1638] font-[inherit] outline-none transition-colors focus:border-[var(--brand-border)] focus:bg-white";

export default function OnboardingView() {
  const [step, setStep] = useState<Step>("company");
  const [form, setForm] = useState({
    company_name: "",
    contact_email: "",
    github_username: "",
    monthly_budget_usd: 5000,
    timeline_weeks: 4,
    departments: ["engineering"] as string[],
  });

  const steps: { key: Step; label: string; icon: typeof Building2 }[] = [
    { key: "company",     label: "Company",  icon: Building2 },
    { key: "github",      label: "GitHub",   icon: GitBranch },
    { key: "budget",      label: "Budget",   icon: CreditCard },
    { key: "departments", label: "Team",     icon: Building2 },
    { key: "review",      label: "Review",   icon: CheckCircle },
  ];

  const currentIdx = steps.findIndex((s) => s.key === step);

  const toggleDept = (dept: string) => {
    setForm((f) => ({
      ...f,
      departments: f.departments.includes(dept)
        ? f.departments.filter((d) => d !== dept)
        : [...f.departments, dept],
    }));
  };

  return (
    <div className="mx-auto max-w-2xl py-12 space-y-6">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[32px] border border-[#e7e0f6] bg-[radial-gradient(circle_at_top_left,var(--brand-surface)_0%,transparent_40%),linear-gradient(180deg,#fcfbff_0%,#f7f5fb_100%)] px-8 py-7 text-center shadow-[0_24px_70px_-50px_rgba(42,26,92,0.3)]">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-white/75 px-3 py-1 text-xs font-medium text-[var(--brand)] backdrop-blur">
          <Sparkles size={12} />
          Getting started
        </div>
        <h2 className="text-3xl font-semibold tracking-tight text-[#1f1638]">Welcome to SWEAAS</h2>
        <p className="mt-2 text-sm text-[#675f7e]">Set up your AI-powered engineering team in minutes</p>
      </section>

      {/* ── Progress steps ────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-all"
                  style={{
                    background: isActive ? "var(--brand)" : isDone ? "#059669" : "#f8f6fc",
                    color: isActive || isDone ? "#fff" : "#7a7390",
                    boxShadow: isActive ? "var(--shadow-brand)" : "none",
                  }}
                >
                  {isDone ? <CheckCircle size={16} /> : <Icon size={16} />}
                </div>
                <span
                  className="text-[10px] font-medium uppercase tracking-[0.1em]"
                  style={{ color: isActive ? "var(--brand)" : isDone ? "#059669" : "#7a7390" }}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className="mb-5 h-0.5 w-10 transition-colors"
                  style={{ background: isDone ? "#059669" : "#ece7f5" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Step content ──────────────────────────────────────── */}
      <section className="rounded-[28px] border border-[#ece7f5] bg-white p-8 shadow-[0_16px_42px_-34px_rgba(42,26,92,0.25)]">
        {step === "company" && (
          <div className="space-y-5">
            <h3 className="text-[17px] font-semibold text-[#1f1638]">Company Information</h3>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">Company Name</label>
              <input type="text" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} placeholder="Acme Inc." className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">Contact Email</label>
              <input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} placeholder="you@company.com" className={inputClass} />
            </div>
          </div>
        )}

        {step === "github" && (
          <div className="space-y-5">
            <h3 className="text-[17px] font-semibold text-[#1f1638]">GitHub Access</h3>
            <p className="text-[13px] text-[#675f7e]">
              We'll create a repository for your project and optionally give you collaborator access.
            </p>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">GitHub Username (optional)</label>
              <input type="text" value={form.github_username} onChange={(e) => setForm((f) => ({ ...f, github_username: e.target.value }))} placeholder="your-github-handle" className={inputClass} />
            </div>
          </div>
        )}

        {step === "budget" && (
          <div className="space-y-5">
            <h3 className="text-[17px] font-semibold text-[#1f1638]">Budget & Timeline</h3>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">Monthly Budget (USD)</label>
              <input type="number" value={form.monthly_budget_usd} onChange={(e) => setForm((f) => ({ ...f, monthly_budget_usd: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">
                Timeline — {form.timeline_weeks} weeks
              </label>
              <input
                type="range" min={1} max={52} value={form.timeline_weeks}
                onChange={(e) => setForm((f) => ({ ...f, timeline_weeks: Number(e.target.value) }))}
                className="w-full"
                style={{ accentColor: "var(--brand)" }}
              />
              <div className="flex justify-between mt-1 text-[10px] text-[#7a7390]">
                <span>1 week</span><span>52 weeks</span>
              </div>
            </div>
          </div>
        )}

        {step === "departments" && (
          <div className="space-y-5">
            <h3 className="text-[17px] font-semibold text-[#1f1638]">Select Departments</h3>
            <p className="text-[13px] text-[#675f7e]">Choose which departments your AI team should cover.</p>
            <div className="grid grid-cols-3 gap-3">
              {["engineering", "marketing", "product"].map((dept) => {
                const active = form.departments.includes(dept);
                return (
                  <button
                    key={dept}
                    onClick={() => toggleDept(dept)}
                    className="rounded-[16px] border p-4 text-[13px] font-medium capitalize transition-all"
                    style={{
                      background: active ? "var(--brand-chip)" : "#f8f6fc",
                      color: active ? "var(--brand)" : "#7a7390",
                      borderColor: active ? "var(--brand-border)" : "#ece7f5",
                      borderWidth: active ? 2 : 1,
                    }}
                  >
                    {dept}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-5">
            <h3 className="text-[17px] font-semibold text-[#1f1638]">Review & Launch</h3>
            <div className="rounded-[16px] border border-[#ece7f5] bg-[#f8f6fc] p-5 space-y-2.5 text-[13px]">
              {[
                ["Company",     form.company_name],
                ["Email",       form.contact_email],
                ["GitHub",      form.github_username || "Not provided"],
                ["Budget",      `$${form.monthly_budget_usd}/month`],
                ["Timeline",    `${form.timeline_weeks} weeks`],
                ["Departments", form.departments.join(", ")],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <span className="font-semibold text-[#675f7e] w-24 shrink-0">{label}</span>
                  <span className="text-[#1f1638]">{value}</span>
                </div>
              ))}
            </div>
            <button
              className="mt-2 w-full rounded-[12px] py-3 text-[14px] font-bold text-white transition-opacity"
              style={{ background: "var(--brand)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-dark)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--brand)"; }}
            >
              Launch My AI Team
            </button>
          </div>
        )}

        {/* Navigation */}
        {step !== "review" && (
          <div className="mt-8 flex justify-between">
            <button
              onClick={() => setStep(steps[currentIdx - 1]?.key ?? "company")}
              disabled={currentIdx === 0}
              className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-medium text-[#7a7390] transition-colors hover:text-[#1f1638] disabled:opacity-30"
            >
              <ArrowLeft size={15} /> Back
            </button>
            <button
              onClick={() => setStep(steps[currentIdx + 1]?.key ?? "review")}
              className="flex items-center gap-2 rounded-[12px] px-6 py-2.5 text-[13px] font-bold text-white transition-opacity"
              style={{ background: "var(--brand)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-dark)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--brand)"; }}
            >
              Next <ArrowRight size={15} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
