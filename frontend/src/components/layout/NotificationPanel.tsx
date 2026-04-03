import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CreditCard,
  FileText,
  MessageSquare,
  Shield,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useNotificationStore, type NotificationItem } from "../../store/notificationStore";

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

const priorityColors: Record<string, { bg: string; text: string; dot: string }> = {
  low: { bg: "#f0fdf4", text: "#16a34a", dot: "#16a34a" },
  medium: { bg: "#eff6ff", text: "#2563eb", dot: "#2563eb" },
  high: { bg: "#fef3c7", text: "#d97706", dot: "#d97706" },
  critical: { bg: "#fef2f2", text: "#dc2626", dot: "#dc2626" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function NotificationItemRow({ item, onClose }: { item: NotificationItem; onClose: () => void }) {
  const navigate = useNavigate();
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const colors = priorityColors[item.priority] || priorityColors.medium;
  const Icon = typeIcons[item.type] || Bell;

  const handleClick = () => {
    if (!item.read_at) {
      markAsRead([item.id]);
    }
    if (item.link_url) {
      try {
        const url = new URL(item.link_url);
        navigate(url.pathname);
      } catch {
        navigate(item.link_url);
      }
    }
    onClose();
  };

  return (
    <button
      onClick={handleClick}
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 16px",
        background: item.read_at ? "transparent" : colors.bg,
        border: "none",
        borderBottom: "1px solid #f3f0f8",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.12s ease",
        opacity: item.read_at ? 0.7 : 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#f8f5ff"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = item.read_at ? "transparent" : colors.bg; }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: colors.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={14} style={{ color: colors.text }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!item.read_at && (
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors.dot, flexShrink: 0 }} />
          )}
          <p style={{ fontSize: 13, fontWeight: item.read_at ? 500 : 600, color: "#1f1638", margin: 0, lineHeight: 1.3 }}>
            {item.title}
          </p>
        </div>
        <p style={{ fontSize: 12, color: "#7a7390", margin: "3px 0 0", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {item.body}
        </p>
        <p style={{ fontSize: 11, color: "#9a94ac", margin: "4px 0 0" }}>
          {timeAgo(item.created_at)}
        </p>
      </div>
    </button>
  );
}

export default function NotificationPanel() {
  const { notifications, unreadCount, panelOpen, closePanel, fetchNotifications, markAllAsRead } =
    useNotificationStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panelOpen) {
      fetchNotifications();
    }
  }, [panelOpen, fetchNotifications]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closePanel();
      }
    };
    if (panelOpen) {
      document.addEventListener("mousedown", handle);
    }
    return () => document.removeEventListener("mousedown", handle);
  }, [panelOpen, closePanel]);

  if (!panelOpen) return null;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: 60,
        right: 16,
        width: 400,
        maxHeight: "calc(100vh - 80px)",
        background: "#fff",
        border: "1px solid #ece7f5",
        borderRadius: 16,
        boxShadow: "0 12px 48px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        animation: "slide-up 0.18s ease both",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px", borderBottom: "1px solid #f3f0f8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1f1638", margin: 0 }}>Notifications</h3>
          {unreadCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "var(--brand)", padding: "1px 8px", borderRadius: 20 }}>
              {unreadCount}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead()}
              style={{
                display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 11, fontWeight: 500,
                color: "var(--brand)", background: "var(--brand-chip)", border: "none", borderRadius: 6, cursor: "pointer",
              }}
            >
              <CheckCheck size={12} /> Mark all read
            </button>
          )}
          <button
            onClick={closePanel}
            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: "#7a7390" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {notifications.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <Bell size={32} style={{ color: "#d1cce0", marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: "#7a7390", margin: 0 }}>No notifications yet</p>
            <p style={{ fontSize: 12, color: "#9a94ac", margin: "4px 0 0" }}>
              You'll be notified about reports, budget alerts, and more.
            </p>
          </div>
        ) : (
          notifications.map((item) => (
            <NotificationItemRow key={item.id} item={item} onClose={closePanel} />
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div style={{ padding: "10px 16px", borderTop: "1px solid #f3f0f8", textAlign: "center" }}>
          <button
            onClick={() => { closePanel(); window.location.hash = "#notifications"; }}
            style={{ fontSize: 12, fontWeight: 500, color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }}
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}
