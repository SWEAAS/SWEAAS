import { create } from "zustand";
import { budgetApi } from "../api/client";

interface AgentBudget {
  agent_id: string;
  name: string;
  token_budget: number;
  tokens_used: number;
  usage_percent: number;
  status: string;
}

interface BudgetState {
  totalBudget: number;
  totalConsumed: number;
  totalMonthlyBudgetUsd: number;
  consumptionPercent: number;
  agents: AgentBudget[];
  loading: boolean;
  fetchSummary: (projectId?: string) => Promise<void>;
}

export const useBudgetStore = create<BudgetState>((set) => ({
  totalBudget: 0,
  totalConsumed: 0,
  totalMonthlyBudgetUsd: 0,
  consumptionPercent: 0,
  agents: [],
  loading: false,

  fetchSummary: async (projectId?: string) => {
    set({ loading: true });
    try {
      const res = await budgetApi.summary(projectId);
      set({
        totalBudget: res.data.total_token_budget,
        totalConsumed: res.data.total_tokens_consumed,
        totalMonthlyBudgetUsd: res.data.total_monthly_budget_usd,
        consumptionPercent: res.data.consumption_percent,
        agents: res.data.agents,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
}));
