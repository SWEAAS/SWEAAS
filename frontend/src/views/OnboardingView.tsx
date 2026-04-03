import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle,
  CreditCard,
  Phone,
  Sparkles,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { communicationApi } from "../api/client";
import { getFeaturedReplicas } from "../components/cto-page/replicaUtils";
import type { TavusReplica } from "../components/cto-page/types";
import {
  MAX_ORG_SIZE,
  useTeamOnboardingStore,
} from "../store/teamOnboardingStore";
import {
  buildDepartmentSizesForCompanySize,
  getDepartmentSizesWithFallback,
  getRoleLabelForAssignment,
  normalizeDepartmentSizesForCompanySize,
  recommendTeamAssignments,
} from "../utils/teamOnboarding";

type Step = "company" | "departments" | "cto" | "review";

const inputClass =
  "w-full rounded-[12px] border border-[#ece7f5] bg-[#f8f6fc] px-4 py-3 text-[14px] text-[#1f1638] font-[inherit] outline-none transition-colors focus:border-[var(--brand-border)] focus:bg-white";

function formatCurrency(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

export default function OnboardingView() {
  const navigate = useNavigate();
  const { config, fetchConfig, saveConfig, saving, error } = useTeamOnboardingStore();
  const [step, setStep] = useState<Step>("company");
  const [replicas, setReplicas] = useState<TavusReplica[]>([]);
  const [replicasLoading, setReplicasLoading] = useState(false);
  const [replicasError, setReplicasError] = useState<string | null>(null);
  const [companySize, setCompanySize] = useState(50);
  const [overallBudgetUsd, setOverallBudgetUsd] = useState(6000);
  const [departmentSizes, setDepartmentSizes] = useState(buildDepartmentSizesForCompanySize(50));
  const [selectedCtoReplicaId, setSelectedCtoReplicaId] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [budgetAlertThreshold, setBudgetAlertThreshold] = useState(85);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(true);

  const steps: { key: Step; label: string; icon: typeof Building2 }[] = [
    { key: "company", label: "Company", icon: Building2 },
    { key: "departments", label: "Departments", icon: Users },
    { key: "cto", label: "Cto", icon: Phone },
    { key: "review", label: "Review", icon: CheckCircle },
  ];

  const currentIdx = steps.findIndex((candidate) => candidate.key === step);

  useEffect(() => {
    void fetchConfig();
    setReplicasLoading(true);
    setReplicasError(null);
    communicationApi
      .replicas()
      .then((response) => setReplicas(response.data.replicas ?? []))
      .catch(() => {
        setReplicas([]);
        setReplicasError("Could not load Tavus replicas. We can still save once replicas come back.");
      })
      .finally(() => setReplicasLoading(false));
  }, [fetchConfig]);

  useEffect(() => {
    setCompanySize(config.company_size || 50);
    setOverallBudgetUsd(config.overall_budget_usd || 6000);
    setDepartmentSizes(
      normalizeDepartmentSizesForCompanySize(
        config.company_size || 50,
        config.assignments.length > 0
          ? getDepartmentSizesWithFallback(config.department_sizes)
          : buildDepartmentSizesForCompanySize(config.company_size || 50),
      ),
    );
    setSelectedCtoReplicaId(config.cto_assignment?.replica_id ?? null);
  }, [config]);

  const featuredReplicas = useMemo(() => getFeaturedReplicas(replicas), [replicas]);

  useEffect(() => {
    if (!selectedCtoReplicaId && featuredReplicas.length > 0) {
      setSelectedCtoReplicaId(config.cto_assignment?.replica_id ?? featuredReplicas[0].replica_id);
    }
  }, [config.cto_assignment?.replica_id, featuredReplicas, selectedCtoReplicaId]);

  const selectedCtoReplica = useMemo(
    () => replicas.find((replica) => replica.replica_id === selectedCtoReplicaId) ?? null,
    [replicas, selectedCtoReplicaId],
  );

  const nonCtoHeadcount = Math.max(0, companySize - 1);
  const assignedHeadcount = useMemo(
    () => Object.values(departmentSizes).reduce((sum, value) => sum + value, 0),
    [departmentSizes],
  );
  const unassignedHeadcount = nonCtoHeadcount - assignedHeadcount;

  const recommendation = useMemo(
    () =>
      recommendTeamAssignments(
        replicas,
        departmentSizes,
        selectedCtoReplica
          ? {
              agent_id: "cto-01",
              archetype_agent_id: "cto-01",
              department: "engineering",
              role: "cto",
              hierarchy_level: "cto",
              parent_agent_id: null,
              ...selectedCtoReplica,
            }
          : null,
      ),
    [departmentSizes, replicas, selectedCtoReplica],
  );
  const previewAssignments = recommendation.assignments.slice(0, 24);

  async function handleSave() {
    const result = await saveConfig({
      completed: true,
      company_size: companySize,
      overall_budget_usd: overallBudgetUsd,
      department_sizes: departmentSizes,
      cto_assignment: selectedCtoReplica
        ? {
            agent_id: "cto-01",
            archetype_agent_id: "cto-01",
            department: "engineering",
            role: "cto",
            hierarchy_level: "cto",
            parent_agent_id: null,
            ...selectedCtoReplica,
          }
        : null,
      assignments: recommendation.assignments,
    });

    if (result) {
      try {
        const { notificationApi } = await import("../api/client");
        if (phoneNumber) {
          await notificationApi.updateContactInfo({ phone_number: phoneNumber });
        }
        await notificationApi.updatePreferences({
          email_enabled: emailNotifications,
          sms_enabled: smsNotifications,
          budget_threshold_percent: budgetAlertThreshold,
        });
      } catch {
        /* preferences will use defaults — non-blocking */
      }
      navigate("/dashboard");
    }
  }

  function updateDepartmentSize(department: keyof typeof departmentSizes, value: number) {
    setDepartmentSizes((current) => ({
      ...current,
      [department]: Math.max(0, Math.min(value, nonCtoHeadcount)),
    }));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-6">
      <section className="overflow-hidden rounded-[32px] border border-[#e7e0f6] bg-[radial-gradient(circle_at_top_left,var(--brand-surface)_0%,transparent_40%),linear-gradient(180deg,#fcfbff_0%,#f7f5fb_100%)] px-8 py-7 shadow-[0_24px_70px_-50px_rgba(42,26,92,0.3)]">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-white/75 px-3 py-1 text-xs font-medium text-[var(--brand)] backdrop-blur">
          <Sparkles size={12} />
          Team onboarding
        </div>
        <h2 className="text-3xl font-semibold tracking-tight text-[#1f1638]">Onboard your team</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#675f7e]">
          Answer a few setup questions and we&apos;ll help you shape your AI organization, choose the
          right people for each role, and carry that setup through the rest of the product.
        </p>
      </section>

      <div className="flex items-center justify-center gap-2">
        {steps.map((candidate, index) => {
          const Icon = candidate.icon;
          const isActive = index === currentIdx;
          const isDone = index < currentIdx;
          return (
            <div key={candidate.key} className="flex items-center gap-2">
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
                  {candidate.label}
                </span>
              </div>
              {index < steps.length - 1 ? (
                <div
                  className="mb-5 h-0.5 w-10 transition-colors"
                  style={{ background: isDone ? "#059669" : "#ece7f5" }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <section className="rounded-[28px] border border-[#ece7f5] bg-white p-8 shadow-[0_16px_42px_-34px_rgba(42,26,92,0.25)]">
        {step === "company" ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-[18px] font-semibold text-[#1f1638]">Company profile</h3>
              <p className="mt-1 text-[13px] text-[#675f7e]">
                These values define the size and budget of the AI organization you are configuring.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">
                  Organization size
                </label>
                <input
                  type="number"
                  min={1}
                  max={MAX_ORG_SIZE}
                  value={companySize}
                  onChange={(event) => {
                    const nextCompanySize = Math.max(1, Math.min(MAX_ORG_SIZE, Number(event.target.value) || 1));
                    setCompanySize(nextCompanySize);
                    setDepartmentSizes((current) => normalizeDepartmentSizesForCompanySize(nextCompanySize, current));
                  }}
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-[#7a7390]">
                  This is the total number of AI agents in your organization, including the Cto. The hard max is {MAX_ORG_SIZE.toLocaleString()}.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">
                  Overall monthly budget (USD)
                </label>
                <input
                  type="number"
                  min={1}
                  value={overallBudgetUsd}
                  onChange={(event) => setOverallBudgetUsd(Math.max(1, Number(event.target.value) || 1))}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Contact & Notifications */}
            <div className="mt-2 rounded-[22px] border border-[#ece7f5] bg-[#faf8fd] p-5">
              <h4 className="text-[14px] font-semibold text-[#1f1638] mb-1">Contact & Notifications</h4>
              <p className="text-[12px] text-[#675f7e] mb-4">
                You'll automatically receive email and SMS notifications for reports, budget alerts, and action items.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">
                    Phone number (for SMS alerts)
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-[#675f7e]">
                    Budget alert threshold (%)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={budgetAlertThreshold}
                    onChange={(e) => setBudgetAlertThreshold(Math.max(10, Math.min(100, Number(e.target.value) || 85)))}
                    className={inputClass}
                  />
                  <p className="mt-1 text-[11px] text-[#7a7390]">
                    Get alerted when any agent exceeds this % of its budget
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-6">
                <label className="flex items-center gap-2 text-[13px] text-[#1f1638] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    className="accent-[var(--brand)] w-4 h-4"
                  />
                  Email notifications
                </label>
                <label className="flex items-center gap-2 text-[13px] text-[#1f1638] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsNotifications}
                    onChange={(e) => setSmsNotifications(e.target.checked)}
                    className="accent-[var(--brand)] w-4 h-4"
                  />
                  SMS notifications
                </label>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[18px] border border-[#ece7f5] bg-[#f8f6fc] px-4 py-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#7a7390]">
                  <Users size={14} />
                  Organization size
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#1f1638]">{companySize}</p>
              </div>
              <div className="rounded-[18px] border border-[#ece7f5] bg-[#f8f6fc] px-4 py-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#7a7390]">
                  <CreditCard size={14} />
                  Budget
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#1f1638]">
                  {formatCurrency(overallBudgetUsd)}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {step === "departments" ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-[18px] font-semibold text-[#1f1638]">Department sizes</h3>
              <p className="mt-1 text-[13px] text-[#675f7e]">
                Split your non-Cto headcount across departments. We will generate a hierarchical roster from these counts, then reuse personas silently with alphabetic suffixes once the unique face pool is exhausted.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {(Object.keys(departmentSizes) as Array<keyof typeof departmentSizes>).map((department) => (
                <div key={department} className="rounded-[22px] border border-[#ece7f5] bg-[#faf8fd] px-5 py-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-semibold capitalize text-[#1f1638]">{department}</p>
                      <p className="mt-1 text-[11px] text-[#7a7390]">Total employees in this department</p>
                    </div>
                    <span className="text-2xl font-semibold text-[#1f1638]">
                      {departmentSizes[department as keyof typeof departmentSizes]}
                    </span>
                  </div>

                  <div className="mt-4">
                    <input
                      type="number"
                      min={0}
                      max={nonCtoHeadcount}
                      value={departmentSizes[department]}
                      onChange={(event) => updateDepartmentSize(department, Number(event.target.value) || 0)}
                      className={inputClass}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[18px] border border-[#ece7f5] bg-[#f8f6fc] px-4 py-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#7a7390]">
                  <Users size={14} />
                  Non-Cto headcount
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#1f1638]">{nonCtoHeadcount}</p>
              </div>
              <div className="rounded-[18px] border border-[#ece7f5] bg-[#f8f6fc] px-4 py-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#7a7390]">
                  <Users size={14} />
                  Assigned
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#1f1638]">{assignedHeadcount}</p>
              </div>
              <div className="rounded-[18px] border border-[#ece7f5] bg-[#f8f6fc] px-4 py-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[#7a7390]">
                  <Users size={14} />
                  Remaining
                </div>
                <p className={`mt-2 text-2xl font-semibold ${unassignedHeadcount === 0 ? "text-[#1f1638]" : "text-amber-600"}`}>
                  {unassignedHeadcount}
                </p>
              </div>
            </div>

            {unassignedHeadcount !== 0 ? (
              <p className="text-[13px] text-amber-700">
                Department totals must equal {nonCtoHeadcount} before you continue.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === "cto" ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-[18px] font-semibold text-[#1f1638]">Choose your Cto face</h3>
              <p className="mt-1 text-[13px] text-[#675f7e]">
                This face becomes the default Cto identity. In very large orgs, the same underlying Tavus persona may still be reused elsewhere with suffix-based display names.
              </p>
            </div>

            {replicasLoading ? (
              <div className="rounded-[22px] border border-[#ece7f5] bg-[#faf8fd] px-5 py-8 text-[13px] text-[#675f7e]">
                Loading Tavus replicas...
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {featuredReplicas.map((replica) => {
                  const selected = selectedCtoReplicaId === replica.replica_id;
                  return (
                    <button
                      key={replica.replica_id}
                      type="button"
                      onClick={() => setSelectedCtoReplicaId(replica.replica_id)}
                      className={[
                        "overflow-hidden rounded-[22px] border bg-white text-left transition-[transform,border-color,box-shadow] duration-200 ease-out",
                        selected
                          ? "border-[var(--brand-border)] shadow-[0_22px_46px_-30px_rgba(124,92,255,0.4)] ring-2 ring-[var(--brand-border)]"
                          : "border-[#ece7f5] hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-24px_rgba(17,24,39,0.22)]",
                      ].join(" ")}
                    >
                      <div className="aspect-[4/3] overflow-hidden bg-[#f0ebfb]">
                        {replica.poster_image_url ? (
                          <img
                            src={replica.poster_image_url}
                            alt={replica.replica_name}
                            className="h-full w-full object-cover"
                          />
                        ) : replica.thumbnail_video_url ? (
                          <video
                            src={replica.thumbnail_video_url}
                            className="h-full w-full object-cover"
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                          />
                        ) : null}
                      </div>
                      <div className="px-4 py-4">
                        <p className="text-[15px] font-semibold text-[#1f1638]">{replica.replica_name}</p>
                        <p className="mt-1 text-[12px] text-[#675f7e]">{replica.model_name}</p>
                        {selected ? (
                          <span className="mt-3 inline-flex rounded-full bg-[var(--brand-chip)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand)]">
                            Selected Cto
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {replicasError ? <p className="text-[13px] text-[#9b3d6b]">{replicasError}</p> : null}
          </div>
        ) : null}

        {step === "review" ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-[18px] font-semibold text-[#1f1638]">Review your generated team</h3>
              <p className="mt-1 text-[13px] text-[#675f7e]">
                We generate the full org from your department totals, then reuse personas with subtle alphabetic suffixes only when the unique face pool runs out.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="rounded-[22px] border border-[#ece7f5] bg-[#faf8fd] px-5 py-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7a7390]">
                  Workspace summary
                </p>
                <div className="mt-4 space-y-3 text-[13px]">
                  <div className="flex justify-between gap-4">
                    <span className="text-[#7a7390]">Employees</span>
                    <span className="font-semibold text-[#1f1638]">{companySize}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[#7a7390]">Budget</span>
                    <span className="font-semibold text-[#1f1638]">{formatCurrency(overallBudgetUsd)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[#7a7390]">AI roster</span>
                    <span className="font-semibold text-[#1f1638]">{1 + recommendation.assignments.length}</span>
                  </div>
                </div>

                <div className="mt-5 rounded-[18px] border border-[#ece7f5] bg-white px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7a7390]">Cto</p>
                  <p className="mt-2 text-[16px] font-semibold text-[#1f1638]">
                    {selectedCtoReplica?.replica_name ?? "No Cto selected"}
                  </p>
                  <p className="mt-1 text-[12px] text-[#675f7e]">
                    This face becomes the default on the Cto call page.
                  </p>
                </div>
              </div>

              <div className="rounded-[22px] border border-[#ece7f5] bg-white px-5 py-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7a7390]">
                  Assigned personas
                </p>
                <p className="mt-2 text-[12px] text-[#7a7390]">
                  Showing {previewAssignments.length} of {recommendation.assignments.length} non-Cto assignments.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {previewAssignments.map((assignment) => {
                    return (
                      <div
                        key={assignment.agent_id}
                        className="overflow-hidden rounded-[18px] border border-[#ece7f5] bg-[#faf8fd]"
                      >
                        <div className="aspect-[4/3] overflow-hidden bg-[#f0ebfb]">
                          {assignment.poster_image_url ? (
                            <img
                              src={assignment.poster_image_url}
                              alt={assignment.replica_name}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="px-4 py-4">
                          <p className="text-[14px] font-semibold text-[#1f1638]">
                            {getRoleLabelForAssignment(assignment)}
                          </p>
                          <p className="mt-1 text-[12px] capitalize text-[#7a7390]">
                            {assignment.department}
                          </p>
                          <p className="mt-3 text-[15px] font-medium text-[#2f2554]">
                            {assignment.replica_name}
                          </p>
                          <p className="mt-1 text-[12px] text-[#675f7e]">{assignment.model_name}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {recommendation.assignments.length > previewAssignments.length ? (
                  <p className="mt-4 text-[12px] text-[#7a7390]">
                    {recommendation.assignments.length - previewAssignments.length} additional employees will be generated when you save.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (currentIdx === 0) {
                navigate("/dashboard");
                return;
              }
              setStep(steps[currentIdx - 1]?.key ?? "company");
            }}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#ece7f5] px-4 text-[13px] font-medium text-[#675f7e] transition-colors hover:bg-[#faf8fd] hover:text-[#1f1638]"
          >
            <ArrowLeft size={15} />
            {currentIdx === 0 ? "Back to dashboard" : "Back"}
          </button>

          {step !== "review" ? (
            <button
              type="button"
              onClick={() => setStep(steps[currentIdx + 1]?.key ?? "review")}
              disabled={step === "departments" && unassignedHeadcount !== 0}
              className="flex h-10 items-center gap-2 rounded-[12px] px-6 text-[13px] font-bold text-white transition-opacity"
              style={{ background: "var(--brand)" }}
            >
              Next
              <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={
                saving ||
                !selectedCtoReplica ||
                unassignedHeadcount !== 0 ||
                recommendation.assignments.length !== nonCtoHeadcount
              }
              className="h-11 rounded-[12px] px-6 text-[14px] font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {saving ? "Saving team..." : config.completed ? "Update team onboarding" : "Save and populate product"}
            </button>
          )}
        </div>

        {error ? <p className="mt-4 text-[13px] text-red-600">{error}</p> : null}
      </section>
    </div>
  );
}
