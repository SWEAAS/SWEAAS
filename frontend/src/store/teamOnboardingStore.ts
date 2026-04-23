import { create } from "zustand";
import { onboardingApi } from "../api/client";
import type { TavusReplica } from "../components/cto-page/types";

export const MAX_UNIQUE_NON_SANTA_PERSONAS = 75;
export const MAX_PERSONA_NAME_VARIANTS = 1 + 26 + (26 * 26);
export const MAX_TEAM_ASSIGNMENTS = MAX_UNIQUE_NON_SANTA_PERSONAS * MAX_PERSONA_NAME_VARIANTS;
export const MAX_ORG_SIZE = MAX_TEAM_ASSIGNMENTS + 1;

export interface TeamPersonaAssignment extends TavusReplica {
  agent_id: string;
  archetype_agent_id?: string | null;
  department: "engineering" | "marketing" | "product" | "support";
  role: string;
  hierarchy_level: "cto" | "manager" | "specialist";
  parent_agent_id?: string | null;
}

export interface DepartmentSizes {
  engineering: number;
  marketing: number;
  product: number;
  support: number;
}

export interface TeamOnboardingConfig {
  completed: boolean;
  company_size: number;
  overall_budget_usd: number;
  department_sizes: DepartmentSizes;
  cto_assignment: TeamPersonaAssignment | null;
  assignments: TeamPersonaAssignment[];
  updated_at: string | null;
}

// Zero defaults — real distributions come from the onboarding view after
// the user picks a company size. Non-zero defaults would render as fake data
// on fresh loads.
export const DEFAULT_DEPARTMENT_SIZES: DepartmentSizes = {
  engineering: 0,
  marketing: 0,
  product: 0,
  support: 0,
};

export const DEFAULT_TEAM_ONBOARDING_CONFIG: TeamOnboardingConfig = {
  completed: false,
  company_size: 0,
  overall_budget_usd: 0,
  department_sizes: DEFAULT_DEPARTMENT_SIZES,
  cto_assignment: null,
  assignments: [],
  updated_at: null,
};

interface TeamOnboardingState {
  config: TeamOnboardingConfig;
  loading: boolean;
  saving: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  saveConfig: (
    nextConfig: Omit<TeamOnboardingConfig, "updated_at"> & { updated_at?: string | null },
    projectId?: string | null,
  ) => Promise<TeamOnboardingConfig | null>;
  patchCtoAssignment: (assignment: TeamPersonaAssignment | null) => Promise<void>;
}

export const useTeamOnboardingStore = create<TeamOnboardingState>((set) => ({
  config: DEFAULT_TEAM_ONBOARDING_CONFIG,
  loading: false,
  saving: false,
  error: null,

  fetchConfig: async () => {
    set({ loading: true, error: null });
    try {
      const response = await onboardingApi.getTeamConfig();
      set({ config: response.data, loading: false });
    } catch {
      set({ loading: false, error: "Could not load the team onboarding configuration." });
    }
  },

  saveConfig: async (nextConfig, projectId) => {
    set({ saving: true, error: null });
    try {
      const response = await onboardingApi.saveTeamConfig({
        company_size: nextConfig.company_size,
        overall_budget_usd: nextConfig.overall_budget_usd,
        department_sizes: nextConfig.department_sizes,
        cto_assignment: nextConfig.cto_assignment,
        assignments: nextConfig.assignments,
        completed: nextConfig.completed,
        ...(projectId ? { project_id: projectId } : {}),
      });
      set({ config: response.data, saving: false });
      return response.data;
    } catch {
      set({ saving: false, error: "Could not save the team onboarding configuration." });
      return null;
    }
  },

  patchCtoAssignment: async (assignment) => {
    try {
      const response = await onboardingApi.patchCtoAssignment({
        cto_assignment: assignment,
      });
      set({ config: response.data, error: null });
    } catch {
      set({ error: "Could not save the Cto face selection." });
    }
  },
}));
