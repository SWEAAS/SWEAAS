import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Search } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useProjectStore } from "../../store/projectStore";

const statusDot: Record<string, string> = {
  active:   "#059669",
  inactive: "#7a7390",
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
        borderBottom: "1px solid #ece7f5",
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
            background: open ? "var(--brand-chip)" : "var(--brand-surface)",
            border: `1px solid ${open ? "var(--brand-border)" : "#ece7f5"}`,
            borderRadius: 10,
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
                  background: statusDot[currentProject.status] ?? "#7a7390",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1f1638" }}>
                {currentProject.name}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--brand)",
                  background: "var(--brand-chip)",
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
            <span style={{ fontSize: 13, fontWeight: 500, color: "#7a7390" }}>
              Select project
            </span>
          )}
          <ChevronDown
            size={13}
            style={{
              color: "#7a7390",
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
              border: "1px solid #ece7f5",
              borderRadius: 14,
              boxShadow: "var(--shadow-lg)",
              padding: "6px",
              zIndex: 50,
              animation: "slide-up 0.18s var(--ease-out) both",
            }}
          >
            {projects.length === 0 ? (
              <p style={{ padding: "10px 12px", fontSize: 13, color: "#7a7390" }}>
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
                    background: currentProject?.id === p.id ? "var(--brand-chip)" : "transparent",
                    border: "none",
                    borderRadius: 9,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.12s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (currentProject?.id !== p.id)
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-surface)";
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
                      background: statusDot[p.status] ?? "#7a7390",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: currentProject?.id === p.id ? 600 : 500,
                        color: currentProject?.id === p.id ? "var(--brand)" : "#1f1638",
                        margin: 0,
                      }}
                    >
                      {p.name}
                    </p>
                    {p.description && (
                      <p
                        style={{
                          fontSize: 11,
                          color: "#7a7390",
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
              color: "#7a7390",
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
              border: "1px solid #ece7f5",
              borderRadius: 10,
              background: "var(--brand-surface)",
              color: "#1f1638",
              outline: "none",
              width: 200,
              fontFamily: "inherit",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--brand-border)";
              e.currentTarget.style.background = "#FFFFFF";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#ece7f5";
              e.currentTarget.style.background = "var(--brand-surface)";
            }}
          />
        </div>

        <button
          style={{
            position: "relative",
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "transparent",
            border: "1px solid #ece7f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--brand-surface)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Bell size={15} style={{ color: "#675f7e" }} />
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
            borderLeft: "1px solid #ece7f5",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--brand-dark), var(--brand))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              boxShadow: "var(--shadow-brand)",
            }}
          >
            {initials}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#675f7e" }}>
            {user?.email ?? "user@sweaas.dev"}
          </span>
        </div>
      </div>
    </header>
  );
}
