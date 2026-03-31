import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Settings,
  Users,
  CreditCard,
  BarChart3,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/hq", icon: Building2, label: "Visit The Office" },
  { to: "/agents", icon: Users, label: "Agents" },
  { to: "/budget", icon: CreditCard, label: "Budget" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-sweaas-border flex flex-col">
      <div className="p-6 border-b border-sweaas-border">
        <h1 className="text-2xl font-bold text-sweaas-blue">SWEAAS</h1>
        <p className="text-xs text-sweaas-text-secondary mt-1">
          SWE as a Service
        </p>
      </div>

      <nav className="flex-1 py-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                isActive
                  ? "bg-sweaas-blue/10 text-sweaas-blue border-r-2 border-sweaas-blue font-medium"
                  : "text-sweaas-text-secondary hover:bg-gray-50"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-sweaas-border">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-2 text-sm text-sweaas-text-secondary hover:text-red-500 w-full transition-colors"
        >
          <LogOut size={18} />
          Log Out
        </button>
      </div>
    </aside>
  );
}
