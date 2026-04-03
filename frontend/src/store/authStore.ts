import { create } from "zustand";

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
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem("sweaas_token"),
  isAuthenticated: !!localStorage.getItem("sweaas_token"),

  login: async (_email: string, _password: string) => {
    // In production, this calls Supabase Auth
    const devUser: User = {
      uid: "dev-user",
      email: _email,
      full_name: "Dev User",
      github_username: "",
      role: _email === "user@sweaas.dev" ? "owner" : "authenticated",
    };
    const devToken = "dev-token";
    localStorage.setItem("sweaas_token", devToken);
    set({ user: devUser, token: devToken, isAuthenticated: true });
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
