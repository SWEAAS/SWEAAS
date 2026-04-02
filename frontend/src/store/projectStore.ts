import { create } from "zustand";
import { projectApi } from "../api/client";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  github_repo_url: string | null;
  public_token: string | null;
  status: string;
}

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  setCurrentProject: (project: Project | null) => void;
  setProjects: (projects: Project[]) => void;
  fetchProjects: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,

  setCurrentProject: (project) => set({ currentProject: project }),
  setProjects: (projects) => set({ projects }),

  fetchProjects: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await projectApi.list();
      const projects: Project[] = res.data ?? [];
      set({ projects });
      // Auto-select first project if none is selected
      if (!get().currentProject && projects.length > 0) {
        set({ currentProject: projects[0] });
      }
    } catch {
      /* silently fail in dev */
    } finally {
      set({ loading: false });
    }
  },
}));
