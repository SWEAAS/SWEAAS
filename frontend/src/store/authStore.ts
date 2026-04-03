import { create } from "zustand";
import api from "../api/client";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

export interface User {
  uid: string;
  email: string;
  full_name: string;
  github_username: string;
  role: string;
  onboarding_completed: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  initialized: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signInWithOAuth: (provider: "google" | "github") => Promise<{ error?: string }>;
  logout: () => void;
  setUser: (user: User, token: string) => void;
  fetchProfile: () => Promise<void>;
  initialize: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;
let supabaseListenerAttached = false;

async function devFallbackLogin(set: (partial: Partial<AuthState>) => void, get: () => AuthState) {
  const devToken = "dev-token";
  localStorage.setItem("sweaas_token", devToken);
  set({ token: devToken, isAuthenticated: true });
  await get().fetchProfile();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: typeof window !== "undefined" ? localStorage.getItem("sweaas_token") : null,
  isAuthenticated:
    typeof window !== "undefined" ? !!localStorage.getItem("sweaas_token") : false,
  initialized: false,

  initialize: () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (!isSupabaseConfigured()) {
        set({ initialized: true });
        return;
      }

      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        localStorage.setItem("sweaas_token", session.access_token);
        set({ token: session.access_token, isAuthenticated: true });
        await get().fetchProfile();
      }

      if (!supabaseListenerAttached) {
        supabaseListenerAttached = true;
        supabase.auth.onAuthStateChange((_event, next) => {
          if (next?.access_token) {
            localStorage.setItem("sweaas_token", next.access_token);
            set({ token: next.access_token, isAuthenticated: true });
            void get().fetchProfile();
          } else {
            localStorage.removeItem("sweaas_token");
            set({ token: null, isAuthenticated: false, user: null });
          }
        });
      }

      set({ initialized: true });
    })();
    return initPromise;
  },

  login: async (email, password) => {
    if (!isSupabaseConfigured()) {
      await devFallbackLogin(set, get);
      return {};
    }
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.session?.access_token) {
      localStorage.setItem("sweaas_token", data.session.access_token);
      set({ token: data.session.access_token, isAuthenticated: true });
      await get().fetchProfile();
    }
    return {};
  },

  signUp: async (email, password, fullName) => {
    if (!isSupabaseConfigured()) {
      return {
        error:
          "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
      };
    }
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName ?? "" } },
    });
    if (error) return { error: error.message };
    if (data.session?.access_token) {
      localStorage.setItem("sweaas_token", data.session.access_token);
      set({ token: data.session.access_token, isAuthenticated: true });
      await get().fetchProfile();
      return {};
    }
    return { needsConfirmation: true };
  },

  signInWithOAuth: async (provider) => {
    if (!isSupabaseConfigured()) {
      return { error: "Supabase is not configured." };
    }
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) return { error: error.message };
    return {};
  },

  logout: () => {
    if (isSupabaseConfigured()) {
      void getSupabase().auth.signOut();
    }
    localStorage.removeItem("sweaas_token");
    set({ user: null, token: null, isAuthenticated: false });
  },

  setUser: (user, token) => {
    localStorage.setItem("sweaas_token", token);
    set({ user, token, isAuthenticated: true });
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
          onboarding_completed: profile.onboarding_completed ?? false,
        },
      });
    } catch {
      if (!isSupabaseConfigured() && !get().user) {
        set({
          user: {
            uid: "dev-user",
            email: "user@sweaas.dev",
            full_name: "Dev User",
            github_username: "",
            role: "owner",
            onboarding_completed: false,
          },
        });
      }
    }
  },
}));
