import { create } from "zustand";

interface Project {
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
  setCurrentProject: (project: Project | null) => void;
  setProjects: (projects: Project[]) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),
  setProjects: (projects) => set({ projects }),
}));
