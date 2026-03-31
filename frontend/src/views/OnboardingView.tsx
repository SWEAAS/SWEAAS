import { useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  GitBranch,
  CreditCard,
  CheckCircle,
} from "lucide-react";

type Step = "company" | "github" | "budget" | "departments" | "review";

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
    { key: "company", label: "Company", icon: Building2 },
    { key: "github", label: "GitHub", icon: GitBranch },
    { key: "budget", label: "Budget", icon: CreditCard },
    { key: "departments", label: "Team", icon: Building2 },
    { key: "review", label: "Review", icon: CheckCircle },
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
    <div className="max-w-2xl mx-auto py-12">
      <h2 className="text-3xl font-bold text-sweaas-text text-center mb-2">
        Welcome to SWEAAS
      </h2>
      <p className="text-sweaas-text-secondary text-center mb-10">
        Set up your AI-powered engineering team in minutes
      </p>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2 mb-12">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sweaas-blue text-white"
                    : isDone
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 text-sweaas-text-secondary"
                }`}
              >
                {isDone ? <CheckCircle size={18} /> : <Icon size={18} />}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-12 h-0.5 ${isDone ? "bg-green-500" : "bg-gray-200"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-2xl border border-sweaas-border p-8">
        {step === "company" && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Company Information</h3>
            <div>
              <label className="block text-sm font-medium mb-2">
                Company Name
              </label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, company_name: e.target.value }))
                }
                placeholder="Acme Inc."
                className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Contact Email
              </label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contact_email: e.target.value }))
                }
                placeholder="you@company.com"
                className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
              />
            </div>
          </div>
        )}

        {step === "github" && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">GitHub Access</h3>
            <p className="text-sm text-sweaas-text-secondary">
              We'll create a repository for your project and optionally give you
              collaborator access.
            </p>
            <div>
              <label className="block text-sm font-medium mb-2">
                GitHub Username (optional)
              </label>
              <input
                type="text"
                value={form.github_username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, github_username: e.target.value }))
                }
                placeholder="your-github-handle"
                className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
              />
            </div>
          </div>
        )}

        {step === "budget" && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Budget & Timeline</h3>
            <div>
              <label className="block text-sm font-medium mb-2">
                Monthly Budget (USD)
              </label>
              <input
                type="number"
                value={form.monthly_budget_usd}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    monthly_budget_usd: Number(e.target.value),
                  }))
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
                value={form.timeline_weeks}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    timeline_weeks: Number(e.target.value),
                  }))
                }
                className="w-full accent-sweaas-blue"
              />
              <p className="text-sm text-sweaas-text-secondary mt-1">
                {form.timeline_weeks} weeks
              </p>
            </div>
          </div>
        )}

        {step === "departments" && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Select Departments</h3>
            <p className="text-sm text-sweaas-text-secondary">
              Choose which departments your AI team should cover.
            </p>
            <div className="grid grid-cols-3 gap-4">
              {["engineering", "marketing", "product"].map((dept) => (
                <button
                  key={dept}
                  onClick={() => toggleDept(dept)}
                  className={`p-4 rounded-xl border-2 transition-colors text-sm font-medium capitalize ${
                    form.departments.includes(dept)
                      ? "border-sweaas-blue bg-sweaas-blue/5 text-sweaas-blue"
                      : "border-sweaas-border text-sweaas-text-secondary hover:border-sweaas-blue-light"
                  }`}
                >
                  {dept}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Review & Launch</h3>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Company:</strong> {form.company_name}
              </p>
              <p>
                <strong>Email:</strong> {form.contact_email}
              </p>
              <p>
                <strong>GitHub:</strong>{" "}
                {form.github_username || "Not provided"}
              </p>
              <p>
                <strong>Budget:</strong> ${form.monthly_budget_usd}/month
              </p>
              <p>
                <strong>Timeline:</strong> {form.timeline_weeks} weeks
              </p>
              <p>
                <strong>Departments:</strong> {form.departments.join(", ")}
              </p>
            </div>
            <button className="w-full py-3 bg-sweaas-blue text-white rounded-lg font-medium hover:bg-sweaas-blue-dark transition-colors mt-6">
              Launch My AI Team
            </button>
          </div>
        )}

        {/* Navigation */}
        {step !== "review" && (
          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep(steps[currentIdx - 1]?.key ?? "company")}
              disabled={currentIdx === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm text-sweaas-text-secondary hover:text-sweaas-text disabled:opacity-30"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              onClick={() => setStep(steps[currentIdx + 1]?.key ?? "review")}
              className="flex items-center gap-2 px-6 py-2 bg-sweaas-blue text-white text-sm rounded-lg hover:bg-sweaas-blue-dark transition-colors"
            >
              Next <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
