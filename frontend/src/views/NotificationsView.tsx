import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CreditCard,
  FileText,
  Filter,
  MessageSquare,
  Shield,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useNotificationStore, type NotificationItem } from "../store/notificationStore";
import { useProjectStore } from "../store/projectStore";

const typeIcons: Record<string, typeof Bell> = {
  report_generated: FileText,
  budget_threshold: CreditCard,
  budget_exhausted: AlertTriangle,
  action_required: Zap,
  feedback_received: MessageSquare,
  agent_status_change: Users,
  cto_review_scheduled: Bell,
  orchestration_complete: FileText,
  security_alert: Shield,
  system: Bell,
};

const typeLabels: Record<string, string> = {
  report_generated: "Report",
  budget_threshold: "Budget",
  budget_exhausted: "Budget",
  action_required: "Action",
  feedback_received: "Feedback",
  agent_status_change: "Agent",
  cto_review_scheduled: "CTO Review",
  orchestration_complete: "Session",
  security_alert: "Security",
  system: "System",
};

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
  medium: { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },
  high: { bg: "#fef3c7", text: "#d97706", border: "#fde68a" },
  critical: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function NotificationCard({ item }: { item: NotificationItem }) {
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const colors = priorityColors[item.priority] || priorityColors.medium;
  const Icon = typeIcons[item.type] || Bell;

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: "16px 20px",
        background: item.read_at ? "#fff" : colors.bg,
        border: `1px solid ${item.read_at ? "#ece7f5" : colors.border}`,
        borderRadius: 16,
        opacity: item.read_at ? 0.75 : 1,
        transition: "all 0.15s ease",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: item.read_at ? "#f8f6fc" : "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: `1px solid ${item.read_at ? "#ece7f5" : colors.border}`,
        }}
      >
        <Icon size={16} style={{ color: item.read_at ? "#7a7390" : colors.text }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: colors.text,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              padding: "1px 8px",
              borderRadius: 20,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {item.priority}
          </span>
          <span style={{ fontSize: 10, fontWeight: 500, color: "#9a94ac", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {typeLabels[item.type] || item.type}
          </span>
          <span style={{ fontSize: 11, color: "#9a94ac", marginLeft: "auto" }}>
            {timeAgo(item.created_at)}
          </span>
        </div>

        <p style={{ fontSize: 14, fontWeight: item.read_at ? 500 : 600, color: "#1f1638", margin: "0 0 4px" }}>
          {item.title}
        </p>
        <p style={{ fontSize: 13, color: "#675f7e", margin: 0, lineHeight: 1.5 }}>
          {item.body}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          {item.link_url && (
            <a
              href={item.link_url}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--brand)",
                textDecoration: "none",
              }}
            >
              View details
            </a>
          )}
          {!item.read_at && (
            <button
              onClick={() => markAsRead([item.id])}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "#7a7390",
                background: "none",
                border: "none",
                cursor: "pointer",
                marginLeft: item.link_url ? 12 : 0,
              }}
            >
              Mark as read
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotificationsView() {
  const {
    notifications,
    totalCount,
    unreadCount,
    loading,
    fetchNotifications,
    markAllAsRead,
  } = useNotificationStore();
  const { currentProject } = useProjectStore();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    fetchNotifications(currentProject?.id, filter === "unread");
  }, [fetchNotifications, currentProject?.id, filter]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-[#e7e0f6] bg-[radial-gradient(circle_at_top_left,var(--brand-surface)_0%,transparent_40%),linear-gradient(180deg,#fcfbff_0%,#f7f5fb_100%)] p-7 shadow-[0_24px_70px_-50px_rgba(42,26,92,0.3)]">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-white/75 px-3 py-1 text-xs font-medium text-[var(--brand)] backdrop-blur">
          <Sparkles size={12} />
          Communications
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-[#1f1638]">Notifications</h2>
        <p className="mt-1 text-sm text-[#675f7e]">
          Stay informed about reports, budget alerts, agent activity, and more.
        </p>
      </section>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setFilter("all")}
            style={{
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: filter === "all" ? 600 : 500,
              color: filter === "all" ? "var(--brand)" : "#7a7390",
              background: filter === "all" ? "var(--brand-chip)" : "transparent",
              border: `1px solid ${filter === "all" ? "var(--brand-border)" : "#ece7f5"}`,
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setFilter("unread")}
            style={{
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: filter === "unread" ? 600 : 500,
              color: filter === "unread" ? "var(--brand)" : "#7a7390",
              background: filter === "unread" ? "var(--brand-chip)" : "transparent",
              border: `1px solid ${filter === "unread" ? "var(--brand-border)" : "#ece7f5"}`,
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            <Filter size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
            Unread ({unreadCount})
          </button>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={() => markAllAsRead()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--brand)",
              background: "var(--brand-chip)",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            <CheckCheck size={14} /> Mark all as read
          </button>
        )}
      </div>

      <div className="space-y-3">
        {loading ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "#7a7390" }}>Loading notifications…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center" }}>
            <Bell size={40} style={{ color: "#d1cce0", margin: "0 auto 16px" }} />
            <p style={{ fontSize: 16, fontWeight: 500, color: "#7a7390", margin: 0 }}>
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
            <p style={{ fontSize: 13, color: "#9a94ac", margin: "6px 0 0" }}>
              You'll receive alerts for reports, budget thresholds, feedback, and more.
            </p>
          </div>
        ) : (
          notifications.map((item) => <NotificationCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
