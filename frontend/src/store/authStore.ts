import { create } from "zustand";
import api from "../api/client";

interface User {
  uid: string;
  email: string;
  full_name: string;
  github_username: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User, token: string) => void;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem("sweaas_token"),
  isAuthenticated: !!localStorage.getItem("sweaas_token"),

  login: async (_email: string, _password: string) => {
    // Dev mode: set a dev token so the backend auth middleware accepts requests.
    // In production this would go through Supabase Auth and return a real JWT.
    const devToken = "dev-token";
    localStorage.setItem("sweaas_token", devToken);
    set({ token: devToken, isAuthenticated: true });

    // Immediately fetch the real user profile from the backend
    await get().fetchProfile();
  },

  fetchProfile: async () => {
    try {
      const res = await api.get("/auth/me");
      const profile = res.data;
      set({
        user: {
          uid: profile.uid ?? profile.id ?? "unknown",
          email: profile.email ?? "",
          full_name: profile.full_name ?? profile.name ?? "User",
          github_username: profile.github_username ?? "",
          role: profile.role ?? "authenticated",
        },
      });
    } catch {
      // Fallback for dev mode when backend is unreachable
      if (!get().user) {
        set({
          user: {
            uid: "dev-user",
            email: "user@sweaas.dev",
            full_name: "Dev User",
            github_username: "",
            role: "owner",
          },
        });
      }
    }
  },

  logout: () => {
    localStorage.removeItem("sweaas_token");
    set({ user: null, token: null, isAuthenticated: false });
  },

  setUser: (user, token) => {
    localStorage.setItem("sweaas_token", token);
    set({ user, token, isAuthenticated: true });
  },
}));
