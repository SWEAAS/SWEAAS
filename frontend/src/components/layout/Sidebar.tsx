import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Warehouse,
  Settings,
  Users,
  CreditCard,
  DollarSign,
  BarChart3,
  Bell,
  GitBranch,
  LogOut,
  Video,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useNotificationStore } from "../../store/notificationStore";
import OrgSwitcher from "./OrgSwitcher";

const navItems = [
  { to: "/dashboard",  icon: LayoutDashboard, label: "Dashboard" },
  { to: "/hq",         icon: Building2,       label: "Visit The Office" },
  { to: "/welcome-hw", icon: Warehouse,       label: "Welcome to HQ" },
  { to: "/agents",     icon: Users,           label: "Agents" },
  { to: "/org-chart",  icon: GitBranch,       label: "Org Chart" },
  { to: "/budget",     icon: CreditCard,      label: "Budget" },
  { to: "/revenue",    icon: DollarSign,      label: "Revenue" },
  { to: "/reports",    icon: BarChart3,       label: "Reports" },
  { to: "/cto-call",   icon: Video,           label: "CTO Call" },
  { to: "/notifications", icon: Bell,         label: "Notifications" },
  { to: "/settings",   icon: Settings,        label: "Settings" },
];

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout);
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <aside
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        width: 232,
        background: "#FFFFFF",
        borderRight: "1px solid #ece7f5",
        display: "flex",
        flexDirection: "column",
        boxShadow: "1px 0 0 #ece7f5",
      }}
    >
      {/* Logo */}
      <div style={{ padding: "24px 24px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: "linear-gradient(135deg, var(--brand-dark), var(--brand))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "var(--shadow-brand)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
              S
            </span>
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#1f1638", margin: 0, letterSpacing: "-0.03em" }}>
              SWEAAS
            </p>
            <p style={{ fontSize: 10, color: "#7a7390", margin: 0, fontWeight: 500 }}>
              SWE as a Service
            </p>
          </div>
        </div>
      </div>

      <OrgSwitcher />

      <div style={{ height: 1, background: "#ece7f5", margin: "0 16px 8px" }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: "4px 8px", overflowY: "auto" }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 14px",
              borderRadius: 10,
              marginBottom: 2,
              fontSize: 13.5,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "var(--brand)" : "#675f7e",
              background: isActive ? "var(--brand-chip)" : "transparent",
              textDecoration: "none",
              transition: "background 0.15s ease, color 0.15s ease",
            })}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              if (!el.getAttribute("aria-current")) {
                el.style.background = "var(--brand-surface)";
                el.style.color = "var(--brand)";
              }
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              if (!el.getAttribute("aria-current")) {
                el.style.background = "transparent";
                el.style.color = "#675f7e";
              }
            }}
          >
            <Icon size={16} strokeWidth={1.8} />
            {label}
            {label === "Notifications" && unreadCount > 0 && (
              <span
                style={{
                  marginLeft: "auto",
                  minWidth: 18,
                  height: 18,
                  borderRadius: 20,
                  background: "#dc2626",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                  padding: "0 5px",
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div style={{ height: 1, background: "#ece7f5", margin: "0 16px 8px" }} />

      {/* Logout */}
      <div style={{ padding: "8px 8px 16px" }}>
        <button
          onClick={logout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 14px",
            borderRadius: 10,
            width: "100%",
            fontSize: 13.5,
            fontWeight: 500,
            color: "#7a7390",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            transition: "background 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#fef2f2";
            (e.currentTarget as HTMLButtonElement).style.color = "#dc2626";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "#7a7390";
          }}
        >
          <LogOut size={16} />
          Log out
        </button>
      </div>
    </aside>
  );
}
