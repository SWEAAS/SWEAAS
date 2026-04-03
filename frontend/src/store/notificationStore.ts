import { create } from "zustand";
import { notificationApi } from "../api/client";

export interface NotificationItem {
  id: string;
  type: string;
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  body: string;
  link_url: string | null;
  channel: string;
  status: string;
  project_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  report_notifications: boolean;
  budget_notifications: boolean;
  action_required_notifications: boolean;
  feedback_notifications: boolean;
  agent_status_notifications: boolean;
  security_notifications: boolean;
  budget_threshold_percent: number;
  budget_threshold_amount_usd: number | null;
  digest_enabled: boolean;
  digest_frequency: string;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  timezone: string;
}

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  totalCount: number;
  countByPriority: Record<string, number>;
  preferences: NotificationPreferences | null;
  loading: boolean;
  panelOpen: boolean;

  fetchNotifications: (projectId?: string, unreadOnly?: boolean) => Promise<void>;
  fetchCounts: () => Promise<void>;
  fetchPreferences: (projectId?: string) => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences> & { project_id?: string | null }) => Promise<void>;
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  togglePanel: () => void;
  closePanel: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  totalCount: 0,
  countByPriority: {},
  preferences: null,
  loading: false,
  panelOpen: false,

  fetchNotifications: async (projectId?: string, unreadOnly = false) => {
    set({ loading: true });
    try {
      const res = await notificationApi.list(projectId, 50, 0, unreadOnly);
      set({
        notifications: res.data.notifications,
        totalCount: res.data.total_count,
        unreadCount: res.data.unread_count,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  fetchCounts: async () => {
    try {
      const res = await notificationApi.counts();
      set({
        unreadCount: res.data.unread,
        totalCount: res.data.total,
        countByPriority: res.data.by_priority,
      });
    } catch {
      /* silently fail */
    }
  },

  fetchPreferences: async (projectId?: string) => {
    try {
      const res = await notificationApi.getPreferences(projectId);
      set({ preferences: res.data });
    } catch {
      /* silently fail */
    }
  },

  updatePreferences: async (prefs) => {
    try {
      const res = await notificationApi.updatePreferences(prefs);
      set({ preferences: res.data });
    } catch {
      /* silently fail */
    }
  },

  markAsRead: async (ids: string[]) => {
    try {
      await notificationApi.markRead(ids);
      const notifications = get().notifications.map((n) =>
        ids.includes(n.id) ? { ...n, read_at: new Date().toISOString(), status: "read" } : n,
      );
      const unreadCount = notifications.filter((n) => !n.read_at).length;
      set({ notifications, unreadCount });
    } catch {
      /* silently fail */
    }
  },

  markAllAsRead: async () => {
    try {
      await notificationApi.markAllRead();
      const notifications = get().notifications.map((n) => ({
        ...n,
        read_at: n.read_at || new Date().toISOString(),
        status: "read",
      }));
      set({ notifications, unreadCount: 0 });
    } catch {
      /* silently fail */
    }
  },

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  closePanel: () => set({ panelOpen: false }),
}));
