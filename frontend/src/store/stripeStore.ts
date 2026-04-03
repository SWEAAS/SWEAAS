import { create } from "zustand";
import { stripeApi } from "../api/client";

interface ConnectStatus {
  stripe_account_id: string | null;
  onboarding_complete: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
}

interface RevenueSummary {
  total_revenue_cents: number;
  total_fees_cents: number;
  net_earnings_cents: number;
  payment_count: number;
  currency: string;
}

interface RevenueBreakdownItem {
  month: string;
  revenue_cents: number;
  fees_cents: number;
  net_cents: number;
  payment_count: number;
}

interface Balance {
  available_cents: number;
  pending_cents: number;
  currency: string;
}

interface PayoutItem {
  id: string;
  stripe_payout_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  arrival_date: string | null;
  created_at: string;
}

interface PaymentItem {
  id: string;
  project_id: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  net_amount_cents: number;
  currency: string;
  status: string;
  end_user_email: string | null;
  created_at: string;
}

interface StripeState {
  connectStatus: ConnectStatus;
  revenue: RevenueSummary;
  breakdown: RevenueBreakdownItem[];
  balance: Balance;
  payouts: PayoutItem[];
  payments: PaymentItem[];
  paymentsTotalCount: number;
  loading: boolean;
  error: string | null;

  fetchConnectStatus: () => Promise<void>;
  fetchRevenue: (projectId?: string) => Promise<void>;
  fetchBreakdown: (projectId?: string) => Promise<void>;
  fetchBalance: () => Promise<void>;
  fetchPayouts: () => Promise<void>;
  fetchPayments: (projectId?: string, limit?: number, offset?: number) => Promise<void>;
  startOnboarding: () => Promise<string | null>;
  refreshAccountLink: () => Promise<string | null>;
  fetchAll: (projectId?: string) => Promise<void>;
}

export const useStripeStore = create<StripeState>((set, get) => ({
  connectStatus: {
    stripe_account_id: null,
    onboarding_complete: false,
    charges_enabled: false,
    payouts_enabled: false,
  },
  revenue: {
    total_revenue_cents: 0,
    total_fees_cents: 0,
    net_earnings_cents: 0,
    payment_count: 0,
    currency: "usd",
  },
  breakdown: [],
  balance: { available_cents: 0, pending_cents: 0, currency: "usd" },
  payouts: [],
  payments: [],
  paymentsTotalCount: 0,
  loading: false,
  error: null,

  fetchConnectStatus: async () => {
    try {
      const res = await stripeApi.connectStatus();
      set({ connectStatus: res.data });
    } catch {
      /* no connected account yet */
    }
  },

  fetchRevenue: async (projectId?: string) => {
    try {
      const res = await stripeApi.revenue(projectId);
      set({ revenue: res.data });
    } catch {
      /* empty */
    }
  },

  fetchBreakdown: async (projectId?: string) => {
    try {
      const res = await stripeApi.revenueBreakdown(projectId);
      set({ breakdown: res.data.months ?? [] });
    } catch {
      /* empty */
    }
  },

  fetchBalance: async () => {
    try {
      const res = await stripeApi.balance();
      set({ balance: res.data });
    } catch {
      /* empty */
    }
  },

  fetchPayouts: async () => {
    try {
      const res = await stripeApi.payouts();
      set({ payouts: res.data.payouts ?? [] });
    } catch {
      /* empty */
    }
  },

  fetchPayments: async (projectId?: string, limit = 50, offset = 0) => {
    try {
      const res = await stripeApi.payments(projectId, limit, offset);
      set({
        payments: res.data.payments ?? [],
        paymentsTotalCount: res.data.total_count ?? 0,
      });
    } catch {
      /* empty */
    }
  },

  startOnboarding: async () => {
    set({ loading: true, error: null });
    try {
      const res = await stripeApi.onboard();
      set({ loading: false });
      return res.data.account_link_url ?? null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Onboarding failed";
      set({ loading: false, error: msg });
      return null;
    }
  },

  refreshAccountLink: async () => {
    set({ loading: true, error: null });
    try {
      const res = await stripeApi.refreshAccountLink();
      set({ loading: false });
      return res.data.account_link_url ?? null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to refresh link";
      set({ loading: false, error: msg });
      return null;
    }
  },

  fetchAll: async (projectId?: string) => {
    set({ loading: true, error: null });
    try {
      await Promise.all([
        get().fetchConnectStatus(),
        get().fetchRevenue(projectId),
        get().fetchBreakdown(projectId),
        get().fetchBalance(),
        get().fetchPayouts(),
        get().fetchPayments(projectId),
      ]);
    } catch {
      /* individual fetchers handle errors */
    } finally {
      set({ loading: false });
    }
  },
}));
