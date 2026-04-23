import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { projectApi } from "../../api/client";
import type { Project } from "../../store/projectStore";
import { useProjectStore } from "../../store/projectStore";

/**
 * Create-a-project modal used by the header dropdown's "+ New project" action.
 *
 * On submit:
 *   1. POST /projects (creates the row, optional GitHub repo, Sentry project)
 *   2. refetch the project list and switch the header to the new project
 *   3. navigate to /onboarding?project_id=<new_id>
 *
 * The onboarding view reads the query param and passes it to
 * PUT /onboarding/team-config so agents land on *this* project, not the org's
 * first one.
 */
export default function NewProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { fetchProjects, setCurrentProject } = useProjectStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await projectApi.create({
        name: name.trim(),
        description: description.trim(),
        github_username: githubUsername.trim() || undefined,
      });
      const proj = res.data as Project;
      await fetchProjects();
      setCurrentProject(proj);
      onClose();
      // Reuse the 4-step onboarding wizard for the brand-new project.
      navigate(`/onboarding?project_id=${proj.id}`);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not create the project. Try again in a moment.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: 28,
          width: "min(520px, 92vw)",
          border: "1px solid #ece7f5",
          boxShadow: "0 28px 90px -48px rgba(22,18,40,0.42)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Plus size={18} color="var(--brand)" />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1f1638" }}>
            New project
          </h2>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#675f7e", lineHeight: 1.5 }}>
          Each project has its own agent team, repo, budget, and reports. After
          this you'll pick department sizes, choose a CTO face, and confirm the
          team — just like first-time onboarding.
        </p>

        <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 600, color: "#1f1638" }}>
          Project name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. customer-portal"
          disabled={submitting}
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 14,
            borderRadius: 10,
            border: "1px solid #ece7f5",
            background: "#faf8fd",
            color: "#1f1638",
            outline: "none",
            marginBottom: 14,
            boxSizing: "border-box",
          }}
        />

        <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 600, color: "#1f1638" }}>
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What are you building?"
          rows={3}
          disabled={submitting}
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 14,
            borderRadius: 10,
            border: "1px solid #ece7f5",
            background: "#faf8fd",
            color: "#1f1638",
            outline: "none",
            resize: "vertical",
            marginBottom: 14,
            boxSizing: "border-box",
            fontFamily: "inherit",
          }}
        />

        <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 600, color: "#1f1638" }}>
          Your GitHub username <span style={{ fontWeight: 400, color: "#7a7390" }}>(optional)</span>
        </label>
        <input
          value={githubUsername}
          onChange={(e) => setGithubUsername(e.target.value)}
          placeholder="github-handle"
          disabled={submitting}
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 14,
            borderRadius: 10,
            border: "1px solid #ece7f5",
            background: "#faf8fd",
            color: "#1f1638",
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        {error && (
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "#dc2626" }}>{error}</p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid #ece7f5",
              background: "#fff",
              color: "#1f1638",
              fontSize: 13,
              fontWeight: 500,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 10,
              border: "none",
              background: "var(--brand)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting || !name.trim() ? 0.6 : 1,
            }}
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            {submitting ? "Creating…" : "Create + onboard team"}
          </button>
        </div>
      </form>
    </div>
  );
}
