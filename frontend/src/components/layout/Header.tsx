import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Search } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useProjectStore } from "../../store/projectStore";

const statusDot: Record<string, string> = {
  active:   "#059669",
  inactive: "#8A96B0",
  paused:   "#D97706",
};

export default function Header() {
  const user = useAuthStore((s) => s.user);
  const { projects, currentProject, setCurrentProject, fetchProjects } =
    useProjectStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const initials = (user?.email ?? "U")[0].toUpperCase();

  return (
    <header
      style={{
        height: 60,
        background: "#FFFFFF",
        borderBottom: "1px solid #E2E8F4",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Left: project selector */}
      <div ref={ref} style={{ position: "relative" }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 12px",
            background: open ? "#EBF0FF" : "#F5F8FE",
            border: `1px solid ${open ? "#C3D0F8" : "#E2E8F4"}`,
            borderRadius: 8,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {currentProject ? (
            <>
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: statusDot[currentProject.status] ?? "#8A96B0",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0C1526" }}>
                {currentProject.name}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#8A96B0",
                  background: "#F0F4FF",
                  padding: "1px 7px",
                  borderRadius: 20,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {currentProject.status}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 500, color: "#8A96B0" }}>
              Select project
            </span>
          )}
          <ChevronDown
            size={13}
            style={{
              color: "#8A96B0",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s var(--ease-out)",
              marginLeft: 2,
            }}
          />
        </button>

        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              minWidth: 260,
              background: "#FFFFFF",
              border: "1px solid #E2E8F4",
              borderRadius: 12,
              boxShadow: "var(--shadow-lg)",
              padding: "6px",
              zIndex: 50,
              animation: "slide-up 0.18s var(--ease-out) both",
            }}
          >
            {projects.length === 0 ? (
              <p style={{ padding: "10px 12px", fontSize: 13, color: "#8A96B0" }}>
                No projects found
              </p>
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setCurrentProject(p); setOpen(false); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "9px 12px",
                    background: currentProject?.id === p.id ? "#EBF0FF" : "transparent",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.12s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (currentProject?.id !== p.id)
                      (e.currentTarget as HTMLButtonElement).style.background = "#F5F8FE";
                  }}
                  onMouseLeave={(e) => {
                    if (currentProject?.id !== p.id)
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: statusDot[p.status] ?? "#8A96B0",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: currentProject?.id === p.id ? 600 : 500,
                        color: currentProject?.id === p.id ? "#1B47D6" : "#0C1526",
                        margin: 0,
                      }}
                    >
                      {p.name}
                    </p>
                    {p.description && (
                      <p
                        style={{
                          fontSize: 11,
                          color: "#8A96B0",
                          margin: "1px 0 0",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.description}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right: search + bell + avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ position: "relative" }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#8A96B0",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            placeholder="Search…"
            style={{
              paddingLeft: 30,
              paddingRight: 14,
              paddingTop: 7,
              paddingBottom: 7,
              fontSize: 13,
              border: "1px solid #E2E8F4",
              borderRadius: 8,
              background: "#F5F8FE",
              color: "#0C1526",
              outline: "none",
              width: 200,
              fontFamily: "inherit",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#C3D0F8";
              e.currentTarget.style.background = "#FFFFFF";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#E2E8F4";
              e.currentTarget.style.background = "#F5F8FE";
            }}
          />
        </div>

        <button
          style={{
            position: "relative",
            width: 34,
            height: 34,
            borderRadius: 8,
            background: "transparent",
            border: "1px solid #E2E8F4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#F5F8FE")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Bell size={15} style={{ color: "#4D5E80" }} />
          <span
            style={{
              position: "absolute",
              top: 7,
              right: 7,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#D97706",
              border: "1.5px solid #fff",
            }}
          />
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            paddingLeft: 12,
            borderLeft: "1px solid #E2E8F4",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #1B47D6, #3B82F6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              boxShadow: "0 2px 8px rgba(27,71,214,0.25)",
            }}
          >
            {initials}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#4D5E80" }}>
            {user?.email ?? "user@sweaas.dev"}
          </span>
        </div>
      </div>
    </header>
  );
}
