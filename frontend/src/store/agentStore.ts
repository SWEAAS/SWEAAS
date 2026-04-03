import { create } from "zustand";
import { agentApi } from "../api/client";

export interface Agent {
  agent_id: string;
  archetype_agent_id?: string | null;
  name: string;
  role: string;
  department: string;
  hierarchy_level: string;
  status: string;
  daily_token_budget: number;
  tokens_used_today: number;
  current_focus: string;
  parent_agent_id?: string | null;
  replica_id?: string | null;
  poster_image_url?: string | null;
  thumbnail_video_url?: string;
  model_name?: string;
}

interface AgentState {
  agents: Agent[];
  selectedAgent: Agent | null;
  loading: boolean;
  fetchAgents: () => Promise<void>;
  selectAgent: (agent: Agent | null) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  selectedAgent: null,
  loading: false,

  fetchAgents: async () => {
    set({ loading: true });
    try {
      const res = await agentApi.list();
      set({ agents: res.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  selectAgent: (agent) => set({ selectedAgent: agent }),
}));
