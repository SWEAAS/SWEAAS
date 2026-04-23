import * as Sentry from "@sentry/react";
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    Sentry.captureException(error, {
      tags: {
        api_url: error.config?.url,
        api_method: error.config?.method,
        status_code: error.response?.status,
      },
    });
    return Promise.reject(error);
  },
);

export default api;

// ── Agent API ────────────────────────────────────────────────────

export const agentApi = {
  list: (projectId?: string) =>
    api.get("/agents", { params: projectId ? { project_id: projectId } : {} }),
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
  summary: (projectId?: string) =>
    api.get("/budget/summary", { params: projectId ? { project_id: projectId } : {} }),
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
  overview: (projectId?: string) =>
    api.get("/observability/overview", { params: projectId ? { project_id: projectId } : {} }),
  reports: (projectId?: string) =>
    api.get("/observability/reports", { params: projectId ? { project_id: projectId } : {} }),
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

// ── Organization API ─────────────────────────────────────────────

export const organizationApi = {
  list: () => api.get("/organizations"),
  update: (orgId: string, data: { name: string }) =>
    api.patch(`/organizations/${orgId}`, data),
};

// ── Stripe Connect API ──────────────────────────────────────────

export const stripeApi = {
  onboard: () => api.post("/stripe/connect/onboard"),
  connectStatus: () => api.get("/stripe/connect/status"),
  refreshAccountLink: () => api.post("/stripe/connect/account-link"),
  createCheckout: (projectId: string, priceId: string) =>
    api.post("/stripe/checkout", { project_id: projectId, price_id: priceId }),
  revenue: (projectId?: string) =>
    api.get("/stripe/revenue", { params: projectId ? { project_id: projectId } : {} }),
  revenueBreakdown: (projectId?: string) =>
    api.get("/stripe/revenue/breakdown", { params: projectId ? { project_id: projectId } : {} }),
  payments: (projectId?: string, limit = 50, offset = 0) =>
    api.get("/stripe/payments", {
      params: {
        ...(projectId ? { project_id: projectId } : {}),
        limit,
        offset,
      },
    }),
  balance: () => api.get("/stripe/balance"),
  payouts: () => api.get("/stripe/payouts"),
};

// ── Orchestration API ────────────────────────────────────────────

export const orchestrationApi = {
  execute: (data: { project_id: string; task: string; feedback_items?: unknown[] }) =>
    api.post("/orchestration/execute", data),
  status: (projectId: string) => api.get(`/orchestration/status/${projectId}`),
  sessions: (projectId: string) => api.get(`/orchestration/sessions/${projectId}`),
  reports: (projectId: string) => api.get(`/orchestration/reports/${projectId}`),
  reportDetail: (projectId: string, reportId: string) =>
    api.get(`/orchestration/reports/${projectId}/${reportId}`),
  reportPdf: (projectId: string, reportId: string) =>
    api.get(`/orchestration/reports/${projectId}/${reportId}/pdf`),
  // Direct URLs for <a href="..." download> buttons. They respect the base
  // URL set via VITE_API_BASE_URL (or the dev proxy) and include the auth
  // header automatically because the browser replays localStorage cookies —
  // for JWT-protected downloads we fetch via axios and turn the blob into
  // an object URL instead. See `downloadReportMarkdown` below.
  reportMarkdownUrl: (projectId: string, reportId: string) =>
    `${api.defaults.baseURL ?? ""}/orchestration/reports/${projectId}/${reportId}/markdown`,
  reportPdfUrl: (projectId: string, reportId: string) =>
    `${api.defaults.baseURL ?? ""}/orchestration/reports/${projectId}/${reportId}/pdf`,
  // JWT-safe downloaders: fetch the response as a blob with the auth header
  // attached, then trigger a browser download.
  async downloadReportMarkdown(projectId: string, reportId: string, filename: string) {
    const res = await api.get(`/orchestration/reports/${projectId}/${reportId}/markdown`, {
      responseType: "blob",
    });
    triggerBlobDownload(res.data, filename);
  },
  async downloadReportPdf(projectId: string, reportId: string, filename: string) {
    const res = await api.get(`/orchestration/reports/${projectId}/${reportId}/pdf`, {
      responseType: "blob",
    });
    // When S3 is configured the server may return a JSON `{download_url}`
    // payload instead of the PDF bytes. Handle both.
    if (res.data instanceof Blob && res.data.type.includes("application/pdf")) {
      triggerBlobDownload(res.data, filename);
      return;
    }
    const text = await (res.data as Blob).text().catch(() => "");
    try {
      const parsed = JSON.parse(text);
      if (parsed?.download_url) {
        window.open(parsed.download_url, "_blank", "noopener,noreferrer");
        return;
      }
    } catch {
      // fallthrough
    }
    triggerBlobDownload(res.data as Blob, filename);
  },
};

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Feedback API ────────────────────────────────────────────────

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

// ── Notification API ────────────────────────────────────────────

export const notificationApi = {
  list: (projectId?: string, limit = 50, offset = 0, unreadOnly = false) =>
    api.get("/notifications", {
      params: {
        ...(projectId ? { project_id: projectId } : {}),
        limit,
        offset,
        unread_only: unreadOnly,
      },
    }),
  counts: () => api.get("/notifications/count"),
  markRead: (notificationIds: string[]) =>
    api.post("/notifications/read", { notification_ids: notificationIds }),
  markAllRead: () => api.post("/notifications/read-all"),
  getPreferences: (projectId?: string) =>
    api.get("/notifications/preferences", {
      params: projectId ? { project_id: projectId } : {},
    }),
  updatePreferences: (data: Record<string, unknown>) =>
    api.put("/notifications/preferences", data),
  updateContactInfo: (data: { phone_number?: string; notification_email?: string }) =>
    api.put("/notifications/contact-info", data),
  send: (data: {
    user_id?: string;
    project_id?: string;
    type?: string;
    priority?: string;
    title: string;
    body: string;
    link_url?: string;
    channel?: string;
  }) => api.post("/notifications/send", data),
};
