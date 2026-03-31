import { Bell, Search } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useProjectStore } from "../../store/projectStore";

export default function Header() {
  const user = useAuthStore((s) => s.user);
  const currentProject = useProjectStore((s) => s.currentProject);

  return (
    <header className="h-16 bg-white border-b border-sweaas-border flex items-center justify-between px-8">
      <div className="flex items-center gap-4">
        {currentProject && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-sweaas-text">
              {currentProject.name}
            </span>
            <span className="text-xs bg-sweaas-blue/10 text-sweaas-blue px-2 py-0.5 rounded-full">
              {currentProject.status}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sweaas-text-secondary"
          />
          <input
            type="text"
            placeholder="Search..."
            className="pl-9 pr-4 py-2 text-sm border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue w-60"
          />
        </div>

        <button className="relative p-2 hover:bg-gray-50 rounded-lg">
          <Bell size={18} className="text-sweaas-text-secondary" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-sweaas-yellow rounded-full" />
        </button>

        <div className="flex items-center gap-2 pl-4 border-l border-sweaas-border">
          <div className="w-8 h-8 bg-sweaas-blue rounded-full flex items-center justify-center text-white text-xs font-medium">
            {user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <span className="text-sm text-sweaas-text-secondary">
            {user?.email ?? "user@sweaas.dev"}
          </span>
        </div>
      </div>
    </header>
  );
}
