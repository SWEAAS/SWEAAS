import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CreditCard,
  FileText,
  MessageSquare,
  Shield,
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

const priorityDot: Record<string, string> = {
  low: "#16a34a",
  medium: "#2563eb",
  high: "#d97706",
  critical: "#dc2626",
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

function NotificationRow({ item }: { item: NotificationItem }) {
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const dotColor = priorityDot[item.priority] || priorityDot.medium;
  const Icon = typeIcons[item.type] || Bell;
  const isUnread = !item.read_at;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid #ece7f5",
        background: isUnread ? "#faf8ff" : "transparent",
        transition: "background 0.1s ease",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#f5f3fa";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isUnread ? "#faf8ff" : "transparent";
      }}
    >
      {isUnread && (
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 20,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: dotColor,
          }}
        />
      )}

      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "#f5f3fa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={14} style={{ color: "#7a7390" }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: isUnread ? 600 : 500,
              color: "#1f1638",
              lineHeight: 1.3,
            }}
          >
            {item.title}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#9a94ac",
              flexShrink: 0,
            }}
          >
            {typeLabels[item.type] || item.type}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "#b3adc4",
              marginLeft: "auto",
              flexShrink: 0,
            }}
          >
            {timeAgo(item.created_at)}
          </span>
        </div>

        <p
          style={{
            fontSize: 13,
            color: "#675f7e",
            margin: "2px 0 0",
            lineHeight: 1.45,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {item.body}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
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
          {isUnread && (
            <button
              onClick={() => markAsRead([item.id])}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "#9a94ac",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Mark read
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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 0",
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    color: active ? "#1f1638" : "#9a94ac",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid var(--brand)" : "2px solid transparent",
    cursor: "pointer",
    marginRight: 20,
    transition: "color 0.1s ease",
  });

  return (
    <div className="mx-auto max-w-3xl">
      {/* Compact utility header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 0 16px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#1f1638",
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            Notifications
          </h2>
          <p style={{ fontSize: 13, color: "#9a94ac", margin: "2px 0 0" }}>
            {unreadCount > 0
              ? `${unreadCount} unread`
              : "All caught up"}
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={() => markAllAsRead()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--brand)",
              background: "none",
              border: "1px solid #ece7f5",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      {/* Tab-style filter bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid #ece7f5",
          marginBottom: 0,
        }}
      >
        <button onClick={() => setFilter("all")} style={tabStyle(filter === "all")}>
          All{totalCount > 0 ? ` (${totalCount})` : ""}
        </button>
        <button onClick={() => setFilter("unread")} style={tabStyle(filter === "unread")}>
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </button>
      </div>

      {/* Notification list */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #ece7f5",
          borderTop: "none",
          borderRadius: "0 0 8px 8px",
        }}
      >
        {loading ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#9a94ac", margin: 0 }}>Loading…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <Bell size={28} style={{ color: "#d1cce0", marginBottom: 10 }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: "#7a7390", margin: 0 }}>
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
            <p style={{ fontSize: 13, color: "#b3adc4", margin: "4px 0 0" }}>
              Alerts for reports, budgets, and agent activity will appear here.
            </p>
          </div>
        ) : (
          notifications.map((item) => <NotificationRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
