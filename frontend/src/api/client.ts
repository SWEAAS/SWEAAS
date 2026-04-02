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
  chat: (id: string, message: string) =>
    api.post(`/agents/${id}/chat`, { message }),
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
};

// ── Observability API ────────────────────────────────────────────

export const observabilityApi = {
  overview: () => api.get("/observability/overview"),
  reports: () => api.get("/observability/reports"),
  sentryIssues: () => api.get("/observability/sentry/issues"),
};

// ── Communication API ────────────────────────────────────────────

export const communicationApi = {
  ctoContext: () => api.get("/communication/cto-context"),
  ctoCall: (data: { project_id: string; topic: string }) =>
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
