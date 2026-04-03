import { useEffect } from "react";
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
  CircleDollarSign,
  Clock,
  ExternalLink,
  Loader2,
  Receipt,
  ShieldAlert,
  TrendingUp,
  Wallet,
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
    succeeded: { label: "Succeeded", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    paid: { label: "Paid", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    pending: { label: "Pending", cls: "text-amber-700 bg-amber-50 border-amber-200" },
    failed: { label: "Failed", cls: "text-red-700 bg-red-50 border-red-200" },
    canceled: { label: "Canceled", cls: "text-gray-600 bg-gray-50 border-gray-200" },
    refunded: { label: "Refunded", cls: "text-blue-700 bg-blue-50 border-blue-200" },
  };
  const s = map[status] ?? { label: status, cls: "text-gray-600 bg-gray-50 border-gray-200" };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </span>
  );
}

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
    <div className="space-y-6">
      {/* ── Connect status banner ──────────────────────────────── */}
      <section
        className={`overflow-hidden rounded-[28px] border p-6 shadow-[0_24px_70px_-50px_rgba(42,26,92,0.45)] ${
          onboarded
            ? "border-emerald-200 bg-[linear-gradient(135deg,#064e3b_0%,#059669_55%,#34d399_100%)] text-white"
            : "border-[#e7e0f6] bg-[linear-gradient(135deg,#1f1638_0%,#3e2c72_55%,#7c5cff_100%)] text-white"
        }`}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/88 backdrop-blur">
              {onboarded ? <BadgeCheck size={12} /> : <ShieldAlert size={12} />}
              {onboarded ? "Stripe Connected" : "Stripe Setup Required"}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {onboarded
                ? "Your Stripe account is connected"
                : "Connect your Stripe account to receive payouts"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
              {onboarded
                ? `Payments are flowing to your connected account (${connectStatus.stripe_account_id}). Payouts are ${connectStatus.payouts_enabled ? "enabled" : "pending activation"}.`
                : "Complete Stripe onboarding so we can route payments to your account and you can start receiving revenue from your projects."}
            </p>
          </div>
          {!onboarded && (
            <button
              type="button"
              onClick={handleOnboard}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-white/20 bg-white px-5 py-3 text-[14px] font-semibold text-[#1f1638] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ExternalLink size={15} />
              )}
              {connectStatus.stripe_account_id ? "Resume Setup" : "Start Setup"}
            </button>
          )}
        </div>
      </section>

      {/* ── Balance + Revenue stats ────────────────────────────── */}
      <section className="rounded-[32px] border border-[#ece7f5] bg-[radial-gradient(circle_at_top_left,var(--brand-surface)_0%,transparent_40%),linear-gradient(180deg,#fcfbff_0%,#f7f5fb_100%)] p-6 shadow-[0_30px_80px_-50px_rgba(42,26,92,0.3)]">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[
            {
              label: "Available Balance",
              value: centsToUsd(balance.available_cents),
              icon: Wallet,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
            },
            {
              label: "Pending Balance",
              value: centsToUsd(balance.pending_cents),
              icon: Clock,
              color: "text-amber-600",
              bg: "bg-amber-50",
            },
            {
              label: "Total Revenue",
              value: centsToUsd(revenue.total_revenue_cents),
              icon: TrendingUp,
              color: "text-[var(--brand)]",
              bg: "bg-[var(--brand-surface)]",
            },
            {
              label: "Platform Fees",
              value: centsToUsd(revenue.total_fees_cents),
              icon: Receipt,
              color: "text-red-500",
              bg: "bg-red-50",
            },
            {
              label: "Net Earnings",
              value: centsToUsd(revenue.net_earnings_cents),
              icon: CircleDollarSign,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
            },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div
              key={label}
              className="rounded-[18px] border border-white/70 bg-white/80 px-5 py-4 backdrop-blur"
            >
              <div className={`mb-2 inline-flex rounded-[8px] p-1.5 ${bg}`}>
                <Icon size={14} className={color} />
              </div>
              <p className="text-xl font-semibold text-[#1f1638]">{value}</p>
              <p className="text-[10px] uppercase tracking-[0.15em] text-[#7a7390]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Revenue chart ──────────────────────────────────────── */}
      {chartData.length > 0 && (
        <section className="rounded-[32px] border border-[#ece7f5] bg-[#f8f6fc] p-5 shadow-[0_20px_60px_-40px_rgba(42,26,92,0.25)]">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-[#675f7e]" />
            <h3 className="text-[15px] font-semibold text-[#1f1638]">Monthly Revenue</h3>
          </div>
          <div className="h-72 rounded-[22px] border border-[#ece7f5] bg-white p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c5cff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7c5cff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ece7f5" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#7a7390" }} />
                <YAxis tick={{ fontSize: 11, fill: "#7a7390" }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #ece7f5",
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, undefined]}
                />
                <Area
                  type="monotone"
                  dataKey="Revenue"
                  stroke="#7c5cff"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="Net Earnings"
                  stroke="#34d399"
                  strokeWidth={2}
                  fill="url(#netGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── Recent payments ────────────────────────────────────── */}
      <section className="rounded-[32px] border border-[#ece7f5] bg-[#f8f6fc] p-5 shadow-[0_20px_60px_-40px_rgba(42,26,92,0.25)]">
        <div className="mb-4 flex items-center gap-2">
          <Banknote size={16} className="text-[#675f7e]" />
          <h3 className="text-[15px] font-semibold text-[#1f1638]">Recent Payments</h3>
          <span className="ml-auto text-[11px] text-[#7a7390]">
            {revenue.payment_count} total
          </span>
        </div>
        <div className="overflow-hidden rounded-[22px] border border-[#ece7f5] bg-white">
          {payments.length === 0 ? (
            <div className="flex items-center gap-3 p-6 text-[13px] text-[#7a7390]">
              <CheckCircle size={15} className="text-emerald-500" />
              No payments yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#ece7f5] text-[10px] uppercase tracking-wider text-[#7a7390]">
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Fee</th>
                    <th className="px-5 py-3 font-semibold">Net</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ece7f5]">
                  {payments.slice(0, 20).map((p) => (
                    <tr key={p.id} className="hover:bg-[#f8f6fc]/60 transition-colors">
                      <td className="whitespace-nowrap px-5 py-3 text-[#1f1638]">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-5 py-3 font-medium text-[#1f1638]">
                        {centsToUsd(p.amount_cents)}
                      </td>
                      <td className="px-5 py-3 text-red-500">
                        -{centsToUsd(p.platform_fee_cents)}
                      </td>
                      <td className="px-5 py-3 font-medium text-emerald-600">
                        {centsToUsd(p.net_amount_cents)}
                      </td>
                      <td className="px-5 py-3">{statusBadge(p.status)}</td>
                      <td className="px-5 py-3 text-[#7a7390]">{p.end_user_email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Payout history ─────────────────────────────────────── */}
      <section className="rounded-[32px] border border-[#ece7f5] bg-[#f8f6fc] p-5 shadow-[0_20px_60px_-40px_rgba(42,26,92,0.25)]">
        <div className="mb-4 flex items-center gap-2">
          <ArrowUpRight size={16} className="text-[#675f7e]" />
          <h3 className="text-[15px] font-semibold text-[#1f1638]">Payout History</h3>
          <span className="ml-auto text-[11px] text-[#7a7390]">
            {payouts.length} payouts
          </span>
        </div>
        <div className="overflow-hidden rounded-[22px] border border-[#ece7f5] bg-white">
          {payouts.length === 0 ? (
            <div className="flex items-center gap-3 p-6 text-[13px] text-[#7a7390]">
              <CheckCircle size={15} className="text-emerald-500" />
              No payouts yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#ece7f5] text-[10px] uppercase tracking-wider text-[#7a7390]">
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Arrival</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ece7f5]">
                  {payouts.map((po) => (
                    <tr key={po.id} className="hover:bg-[#f8f6fc]/60 transition-colors">
                      <td className="whitespace-nowrap px-5 py-3 text-[#1f1638]">
                        {po.created_at ? new Date(po.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-5 py-3 font-medium text-[#1f1638]">
                        {centsToUsd(po.amount_cents)}
                      </td>
                      <td className="px-5 py-3">{statusBadge(po.status)}</td>
                      <td className="px-5 py-3 text-[#7a7390]">
                        {po.arrival_date
                          ? new Date(po.arrival_date).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
