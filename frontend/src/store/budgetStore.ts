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
  consumptionPercent: number;
  agents: AgentBudget[];
  loading: boolean;
  fetchSummary: () => Promise<void>;
}

export const useBudgetStore = create<BudgetState>((set) => ({
  totalBudget: 0,
  totalConsumed: 0,
  consumptionPercent: 0,
  agents: [],
  loading: false,

  fetchSummary: async () => {
    set({ loading: true });
    try {
      const res = await budgetApi.summary();
      set({
        totalBudget: res.data.total_token_budget,
        totalConsumed: res.data.total_tokens_consumed,
        consumptionPercent: res.data.consumption_percent,
        agents: res.data.agents,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
}));
