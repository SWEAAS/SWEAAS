import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { organizationApi } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { useProjectStore } from "../../store/projectStore";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
  is_current: boolean;
}

/**
 * GitHub-style org dropdown in the sidebar.
 *
 *   current org ▼
 *   ─────────────
 *     SWEAAS Dev          ✓
 *     Acme Robotics
 *   ─────────────
 *     + New organization
 *
 * Switching orgs calls `POST /organizations/{id}/switch`, then rehydrates the
 * project + profile stores so every downstream view (Dashboard, Agents, HQ,
 * Reports, Notifications) automatically re-keys to the new org's data.
 */
export default function OrgSwitcher() {
  const user = useAuthStore((s) => s.user);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await organizationApi.list();
      setOrgs(res.data as Org[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = useMemo(() => orgs.find((o) => o.is_current) ?? orgs[0] ?? null, [orgs]);

  async function switchTo(org: Org) {
    if (org.is_current) {
      setOpen(false);
      return;
    }
    try {
      await organizationApi.switch(org.id);
    } catch {
      // If switch failed we just bail — user stays in the previous org.
      setOpen(false);
      return;
    }
    setOpen(false);
    // Clear the selected project (the new org likely has different ones) and
    // let the stores re-hydrate from scratch.
    setCurrentProject(null);
    await Promise.all([load(), fetchProjects(), fetchProfile()]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await organizationApi.create({ name });
      // Backend already switched us to the new org as part of create.
      const created = res.data as Org;
      setNewName("");
      setShowCreate(false);
      setOpen(false);
      setCurrentProject(null);
      await Promise.all([load(), fetchProjects(), fetchProfile()]);
      void created;
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not create organization.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div ref={containerRef} style={{ padding: "0 24px 12px", position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 10,
          background: "var(--brand-surface)",
          border: "1px solid var(--brand-border)",
          width: "100%",
          cursor: "pointer",
          textAlign: "left",
          color: "#1f1638",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: "var(--brand)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>
            {(current?.name || "?").charAt(0).toUpperCase()}
          </span>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#1f1638",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Loading…" : current?.name ?? "No organization"}
        </span>
        <ChevronDown size={14} color="#7a7390" />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 24,
            right: 24,
            marginTop: 4,
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #ece7f5",
            boxShadow: "0 16px 42px -24px rgba(42,26,92,0.25)",
            zIndex: 40,
            overflow: "hidden",
          }}
        >
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {orgs.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => switchTo(org)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "9px 12px",
                  border: "none",
                  background: org.is_current ? "var(--brand-chip)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12.5,
                  color: "#1f1638",
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: "var(--brand-surface)",
                    color: "var(--brand)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {org.name.charAt(0).toUpperCase()}
                </span>
                <span style={{ flex: 1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {org.name}
                </span>
                {org.is_current && <Check size={13} color="var(--brand)" />}
              </button>
            ))}
          </div>
          <div style={{ borderTop: "1px solid #ece7f5" }} />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setShowCreate(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "9px 12px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
              fontSize: 12.5,
              color: "var(--brand)",
              fontWeight: 600,
            }}
          >
            <Plus size={13} />
            New organization
          </button>
        </div>
      )}

      {showCreate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(18,13,31,0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !saving && setShowCreate(false)}
        >
          <form
            onSubmit={handleCreate}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 20,
              padding: 28,
              width: "min(480px, 92vw)",
              border: "1px solid #ece7f5",
              boxShadow: "0 28px 90px -48px rgba(22,18,40,0.42)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1f1638" }}>
              New organization
            </h2>
            <p style={{ margin: "6px 0 16px", fontSize: 13, color: "#675f7e" }}>
              Organizations are isolated workspaces — projects, agents, budgets, and reports never cross between them.
            </p>
            <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 600, color: "#1f1638" }}>
              Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Acme Robotics"
              autoFocus
              disabled={saving}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                borderRadius: 10,
                border: "1px solid #ece7f5",
                background: "#faf8fd",
                color: "#1f1638",
                outline: "none",
              }}
            />
            {error && (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#dc2626" }}>{error}</p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowCreate(false)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid #ece7f5",
                  background: "#fff",
                  color: "#1f1638",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--brand)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Creating…" : "Create organization"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
