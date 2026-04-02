import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Settings,
  Users,
  CreditCard,
  BarChart3,
  GitBranch,
  LogOut,
  Video,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";

const navItems = [
  { to: "/dashboard",  icon: LayoutDashboard, label: "Dashboard" },
  { to: "/hq",         icon: Building2,       label: "Visit The Office" },
  { to: "/agents",     icon: Users,           label: "Agents" },
  { to: "/org-chart",  icon: GitBranch,       label: "Org Chart" },
  { to: "/budget",     icon: CreditCard,      label: "Budget" },
  { to: "/reports",    icon: BarChart3,       label: "Reports" },
  { to: "/cto-call",   icon: Video,           label: "CTO Call" },
  { to: "/settings",   icon: Settings,        label: "Settings" },
];

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        width: 232,
        background: "#FFFFFF",
        borderRight: "1px solid #E2E8F4",
        display: "flex",
        flexDirection: "column",
        boxShadow: "1px 0 0 #E2E8F4",
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
              background: "linear-gradient(135deg, #1B47D6, #3B82F6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(27,71,214,0.3)",
              flexShrink: 0,
            }}
          >
            <span
              style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}
            >
              S
            </span>
          </div>
          <div>
            <p
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "#0C1526",
                margin: 0,
                letterSpacing: "-0.03em",
              }}
            >
              SWEAAS
            </p>
            <p style={{ fontSize: 10, color: "#8A96B0", margin: 0, fontWeight: 500 }}>
              SWE as a Service
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          height: 1,
          background: "#E2E8F4",
          margin: "0 16px 8px",
        }}
      />

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
              borderRadius: 8,
              marginBottom: 2,
              fontSize: 13.5,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "#1B47D6" : "#4D5E80",
              background: isActive ? "#EBF0FF" : "transparent",
              textDecoration: "none",
              transition: "background 0.15s ease, color 0.15s ease",
            })}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              if (!el.getAttribute("aria-current")) {
                el.style.background = "#F0F4FF";
                el.style.color = "#1B47D6";
              }
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              if (!el.getAttribute("aria-current")) {
                el.style.background = "transparent";
                el.style.color = "#4D5E80";
              }
            }}
          >
            <Icon size={16} strokeWidth={isActive => isActive ? 2.2 : 1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div
        style={{
          height: 1,
          background: "#E2E8F4",
          margin: "0 16px 8px",
        }}
      />

      {/* Logout */}
      <div style={{ padding: "8px 8px 16px" }}>
        <button
          onClick={logout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 14px",
            borderRadius: 8,
            width: "100%",
            fontSize: 13.5,
            fontWeight: 500,
            color: "#8A96B0",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            transition: "background 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#FEF2F2";
            (e.currentTarget as HTMLButtonElement).style.color = "#DC2626";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "#8A96B0";
          }}
        >
          <LogOut size={16} />
          Log out
        </button>
      </div>
    </aside>
  );
}
