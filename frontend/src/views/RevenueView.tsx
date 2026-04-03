import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  CheckCircle,
  ExternalLink,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { useStripeStore } from "../store/stripeStore";
import { useProjectStore } from "../store/projectStore";

function centsToUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    succeeded: { label: "Succeeded", cls: "text-emerald-700 bg-emerald-50" },
    paid: { label: "Paid", cls: "text-emerald-700 bg-emerald-50" },
    pending: { label: "Pending", cls: "text-amber-700 bg-amber-50" },
    failed: { label: "Failed", cls: "text-red-700 bg-red-50" },
    canceled: { label: "Canceled", cls: "text-gray-500 bg-gray-100" },
    refunded: { label: "Refunded", cls: "text-blue-700 bg-blue-50" },
  };
  const s = map[status] ?? { label: status, cls: "text-gray-500 bg-gray-100" };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </span>
  );
}

type Tab = "payments" | "payouts";

export default function RevenueView() {
  const {
    connectStatus,
    revenue,
    breakdown,
    balance,
    payouts,
    payments,
    loading,
    fetchAll,
    startOnboarding,
    refreshAccountLink,
  } = useStripeStore();
  const { currentProject } = useProjectStore();
  const [activeTab, setActiveTab] = useState<Tab>("payments");

  useEffect(() => {
    fetchAll(currentProject?.id);
  }, [fetchAll, currentProject?.id]);

  const handleOnboard = async () => {
    const url = connectStatus.stripe_account_id
      ? await refreshAccountLink()
      : await startOnboarding();
    if (url) window.open(url, "_blank");
  };

  const chartData = breakdown.map((m) => ({
    month: m.month,
    Revenue: m.revenue_cents / 100,
    "Net Earnings": m.net_cents / 100,
    Fees: m.fees_cents / 100,
  }));

  const onboarded = connectStatus.onboarding_complete && connectStatus.charges_enabled;

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-sweaas-text-tertiary)]">
            Billing
          </p>
          <h1 className="text-lg font-semibold text-[var(--color-sweaas-text)]">Revenue</h1>
        </div>
      </div>

      {/* ── Connect status ───────────────────────────────────────── */}
      {!onboarded && (
        <section className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={15} className="shrink-0 text-amber-600" />
            <div>
              <p className="text-[13px] font-medium text-amber-900">Stripe setup required</p>
              <p className="text-[12px] leading-snug text-amber-700/80">
                Complete onboarding so payments can flow to your account.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOnboard}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-amber-900 shadow-xs transition-colors hover:bg-amber-50 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            {connectStatus.stripe_account_id ? "Resume Setup" : "Start Setup"}
          </button>
        </section>
      )}

      {onboarded && (
        <section className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-2.5">
          <BadgeCheck size={14} className="shrink-0 text-emerald-600" />
          <p className="text-[12px] text-emerald-800">
            Stripe connected
            <span className="ml-1 text-emerald-600/70">
              ({connectStatus.stripe_account_id})
            </span>
            {connectStatus.payouts_enabled
              ? " — payouts enabled"
              : " — payouts pending activation"}
          </p>
        </section>
      )}

      {/* ── KPI stat row ─────────────────────────────────────────── */}
      <section className="flex flex-wrap items-stretch gap-3">
        {[
          { label: "Available", value: centsToUsd(balance.available_cents), accent: "text-emerald-600" },
          { label: "Pending", value: centsToUsd(balance.pending_cents), accent: "text-amber-600" },
          { label: "Total Revenue", value: centsToUsd(revenue.total_revenue_cents), accent: "text-[var(--brand)]" },
          { label: "Fees", value: centsToUsd(revenue.total_fees_cents), accent: "text-red-500" },
          { label: "Net Earnings", value: centsToUsd(revenue.net_earnings_cents), accent: "text-emerald-600" },
        ].map(({ label, value, accent }) => (
          <div
            key={label}
            className="flex min-w-[140px] flex-1 flex-col rounded-xl border border-[var(--color-sweaas-border)] bg-white px-4 py-3"
          >
            <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-sweaas-text-tertiary)]">
              {label}
            </span>
            <span className={`mt-0.5 text-lg font-semibold ${accent}`}>{value}</span>
          </div>
        ))}
      </section>

      {/* ── Revenue chart ────────────────────────────────────────── */}
      {chartData.length > 0 && (
        <section className="rounded-xl border border-[var(--color-sweaas-border)] bg-white">
          <div className="border-b border-[var(--color-sweaas-border)] px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-[var(--color-sweaas-text)]">
              Monthly Revenue
            </h2>
          </div>
          <div className="h-64 px-4 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ece7f5" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#7a7390" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#7a7390" }}
                  tickFormatter={(v) => `$${v}`}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #ece7f5",
                    fontSize: 12,
                    boxShadow: "0 2px 8px rgba(31,22,56,0.08)",
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, undefined]}
                />
                <Area
                  type="monotone"
                  dataKey="Revenue"
                  stroke="var(--brand)"
                  strokeWidth={1.5}
                  fill="url(#revGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="Net Earnings"
                  stroke="#34d399"
                  strokeWidth={1.5}
                  fill="url(#netGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── Payments / Payouts tabbed panel ───────────────────────── */}
      <section className="rounded-xl border border-[var(--color-sweaas-border)] bg-white">
        <div className="flex items-center gap-1 border-b border-[var(--color-sweaas-border)] px-4">
          {([
            { key: "payments" as Tab, label: "Payments", count: revenue.payment_count, icon: Banknote },
            { key: "payouts" as Tab, label: "Payouts", count: payouts.length, icon: ArrowUpRight },
          ]).map(({ key, label, count, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                activeTab === key
                  ? "text-[var(--color-sweaas-text)]"
                  : "text-[var(--color-sweaas-text-tertiary)] hover:text-[var(--color-sweaas-text-secondary)]"
              }`}
            >
              <Icon size={13} />
              {label}
              <span className="rounded bg-[var(--color-sweaas-surface)] px-1.5 py-px text-[10px] font-semibold text-[var(--color-sweaas-text-secondary)]">
                {count}
              </span>
              {activeTab === key && (
                <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[var(--brand)]" />
              )}
            </button>
          ))}
        </div>

        {/* Payments tab */}
        {activeTab === "payments" && (
          payments.length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-8 text-[13px] text-[var(--color-sweaas-text-tertiary)]">
              <CheckCircle size={14} className="text-emerald-500" />
              No payments yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-sweaas-border)] text-[10px] uppercase tracking-wider text-[var(--color-sweaas-text-tertiary)]">
                    <th className="px-4 py-2 font-semibold">Date</th>
                    <th className="px-4 py-2 font-semibold">Amount</th>
                    <th className="px-4 py-2 font-semibold">Fee</th>
                    <th className="px-4 py-2 font-semibold">Net</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                    <th className="px-4 py-2 font-semibold">Customer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-sweaas-border)]">
                  {payments.slice(0, 20).map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-[var(--color-sweaas-bg)]">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-sweaas-text)]">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[var(--color-sweaas-text)]">
                        {centsToUsd(p.amount_cents)}
                      </td>
                      <td className="px-4 py-2.5 text-red-500">
                        -{centsToUsd(p.platform_fee_cents)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-emerald-600">
                        {centsToUsd(p.net_amount_cents)}
                      </td>
                      <td className="px-4 py-2.5">{statusBadge(p.status)}</td>
                      <td className="px-4 py-2.5 text-[var(--color-sweaas-text-tertiary)]">
                        {p.end_user_email ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Payouts tab */}
        {activeTab === "payouts" && (
          payouts.length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-8 text-[13px] text-[var(--color-sweaas-text-tertiary)]">
              <CheckCircle size={14} className="text-emerald-500" />
              No payouts yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--color-sweaas-border)] text-[10px] uppercase tracking-wider text-[var(--color-sweaas-text-tertiary)]">
                    <th className="px-4 py-2 font-semibold">Date</th>
                    <th className="px-4 py-2 font-semibold">Amount</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                    <th className="px-4 py-2 font-semibold">Arrival</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-sweaas-border)]">
                  {payouts.map((po) => (
                    <tr key={po.id} className="transition-colors hover:bg-[var(--color-sweaas-bg)]">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-sweaas-text)]">
                        {po.created_at ? new Date(po.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[var(--color-sweaas-text)]">
                        {centsToUsd(po.amount_cents)}
                      </td>
                      <td className="px-4 py-2.5">{statusBadge(po.status)}</td>
                      <td className="px-4 py-2.5 text-[var(--color-sweaas-text-tertiary)]">
                        {po.arrival_date
                          ? new Date(po.arrival_date).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  );
}
