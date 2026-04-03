import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sweaas_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

// ── Agent API ────────────────────────────────────────────────────

export const agentApi = {
  list: () => api.get("/agents"),
  get: (id: string) => api.get(`/agents/${id}`),
  activity: (id: string) => api.get(`/agents/${id}/activity`),
  chat: (
    id: string,
    message: string,
    history: { role: "user" | "assistant"; content: string }[] = [],
  ) => api.post(`/agents/${id}/chat`, { message, history }),
};

// ── Budget API ───────────────────────────────────────────────────

export const budgetApi = {
  summary: () => api.get("/budget/summary"),
  estimate: (data: {
    seat_count: number;
    monthly_budget_usd: number;
    usage_profile: string;
  }) => api.post("/budget/estimate", data),
  agentConsumption: (id: string) => api.get(`/budget/agents/${id}`),
};

// ── Project API ──────────────────────────────────────────────────

export const projectApi = {
  list: () => api.get("/projects"),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: {
    name: string;
    description?: string;
    github_username?: string;
    monthly_budget_usd?: number;
    timeline_weeks?: number;
    departments?: string[];
  }) => api.post("/projects", data),
  patchConfig: (
    id: string,
    data: {
      monthly_budget_usd?: number;
      timeline_weeks?: number;
      departments?: string[];
      max_agents?: number;
      github_username?: string;
    },
  ) => api.patch(`/projects/${id}/config`, data),
};

// ── Onboarding API ───────────────────────────────────────────────

export const onboardingApi = {
  departments: () => api.get("/onboarding/departments"),
  assess: (data: {
    company_name: string;
    team_size: number;
    monthly_budget_usd: number;
    contact_email: string;
    github_username?: string;
  }) => api.post("/onboarding/assess", data),
  getTeamConfig: () => api.get("/onboarding/team-config"),
  saveTeamConfig: (data: {
    company_size: number;
    overall_budget_usd: number;
    department_sizes: {
      engineering: number;
      marketing: number;
      product: number;
      support: number;
    };
    cto_assignment: {
      agent_id: string;
      archetype_agent_id?: string | null;
      replica_id: string;
      replica_name: string;
      model_name: string;
      poster_image_url?: string | null;
      thumbnail_video_url?: string;
      department: "engineering" | "marketing" | "product" | "support";
      role: string;
      hierarchy_level: "cto" | "manager" | "specialist";
      parent_agent_id?: string | null;
    } | null;
    assignments: Array<{
      agent_id: string;
      archetype_agent_id?: string | null;
      replica_id: string;
      replica_name: string;
      model_name: string;
      poster_image_url?: string | null;
      thumbnail_video_url?: string;
      department: "engineering" | "marketing" | "product" | "support";
      role: string;
      hierarchy_level: "cto" | "manager" | "specialist";
      parent_agent_id?: string | null;
    }>;
    completed?: boolean;
  }) => api.put("/onboarding/team-config", data),
  patchCtoAssignment: (data: {
    cto_assignment: {
      agent_id: string;
      archetype_agent_id?: string | null;
      replica_id: string;
      replica_name: string;
      model_name: string;
      poster_image_url?: string | null;
      thumbnail_video_url?: string;
      department: "engineering" | "marketing" | "product" | "support";
      role: string;
      hierarchy_level: "cto" | "manager" | "specialist";
      parent_agent_id?: string | null;
    } | null;
  }) => api.patch("/onboarding/team-config/cto", data),
};

// ── Observability API ────────────────────────────────────────────

export const observabilityApi = {
  overview: () => api.get("/observability/overview"),
  reports: () => api.get("/observability/reports"),
  sentryIssues: () => api.get("/observability/sentry/issues"),
};

// ── Communication API ────────────────────────────────────────────

export const communicationApi = {
  replicas: () => api.get("/communication/replicas"),
  warmCheckReplicas: () => api.post("/communication/admin/replicas/warm-check"),
  tavusConfigCheck: () => api.get<TavusConfigCheckResponse>("/communication/admin/tavus-config-check"),
  reconcileReplicas: () => api.get("/communication/admin/replicas/reconciliation"),
  applyReplicaReconciliationAction: (data: {
    action: "append_new_replica" | "update_stored_replica" | "replace_with_live" | "delete_database_replica" | "dismiss";
    database_replica_id?: string | null;
    live_replica_id?: string | null;
  }) => api.post("/communication/admin/replicas/reconciliation/actions", data),
  ctoContext: () => api.get("/communication/cto-context"),
  ctoCall: (data: {
    project_id?: string | null;
    topic: string;
    replica_id?: string | null;
    target?: {
      agent_id: string;
      name: string;
      role: string;
      department: "engineering" | "marketing" | "product" | "support";
      hierarchy_level: "cto" | "manager" | "specialist";
    } | null;
  }) =>
    api.post("/communication/cto-call", data),
  customerCall: (data: {
    project_id?: string;
    topic: string;
    user_email?: string;
  }) => api.post("/communication/customer-call", data),
  /** Public endpoint for end users — authenticates via X-Project-Token, not SWEAAS JWT. */
  publicCustomerCall: (data: { topic: string; project_id?: string }, projectToken: string) =>
    axios.post(
      `${import.meta.env.VITE_API_BASE_URL || "/api/v1"}/communication/customer-call/public`,
      data,
      { headers: { "Content-Type": "application/json", "X-Project-Token": projectToken } },
    ),
  explainerVideo: (data: {
    project_id: string;
    topic: string;
    video_type?: string;
  }) => api.post("/communication/explainer-video", data),
};

export interface TavusWarmCheckAttempt {
  attempt: number;
  delay_seconds: number;
  status_code: number;
  success: boolean;
  payload: Record<string, unknown>;
}

export interface TavusConfigResourceCheck {
  configured_id: string;
  found: boolean;
  status_code: number;
  detail: string;
  name?: string | null;
}

export interface TavusConfigCheckResponse {
  ok: boolean;
  api_key_configured: boolean;
  internal_call_replica?: TavusConfigResourceCheck | null;
  internal_call_persona?: TavusConfigResourceCheck | null;
  warnings: string[];
}

export interface TavusReplicaSnapshot {
  replica_id: string;
  replica_name: string;
  thumbnail_video_url: string;
  model_name: string;
  updated_at?: string | null;
}

export interface TavusReplicaUsageSummary {
  organization_count: number;
  cto_assignment_count: number;
  team_assignment_count: number;
  total_assignment_count: number;
}

export interface TavusReconciliationItem {
  reason: "name_mismatch" | "missing_in_database" | "updates_to_stored_replica";
  actions: string[];
  changed_fields: string[];
  database_replica?: TavusReplicaSnapshot | null;
  live_replica?: TavusReplicaSnapshot | null;
  impacted_onboarding_usage?: TavusReplicaUsageSummary | null;
}

export interface TavusReconciliationResponse {
  name_mismatch: TavusReconciliationItem[];
  missing_in_database: TavusReconciliationItem[];
  updates_to_stored_replica: TavusReconciliationItem[];
}

export const feedbackApi = {
  submit: (data: {
    project_id?: string;
    title: string;
    body: string;
    category?: string;
    source?: string;
    priority?: string;
  }) => api.post("/feedback", data),
  list: (projectId?: string) =>
    api.get("/feedback", { params: projectId ? { project_id: projectId } : {} }),
};
