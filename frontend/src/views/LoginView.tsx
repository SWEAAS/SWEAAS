import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isSupabaseConfigured } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

export default function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signupNote, setSignupNote] = useState<string | null>(null);

  const login = useAuthStore((s) => s.login);
  const signUp = useAuthStore((s) => s.signUp);
  const signInWithOAuth = useAuthStore((s) => s.signInWithOAuth);
  const initialized = useAuthStore((s) => s.initialized);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const q = searchParams.get("error");
    if (q) setLocalError(decodeURIComponent(q));
  }, [searchParams]);

  useEffect(() => {
    if (initialized && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [initialized, isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSignupNote(null);
    setPending(true);
    try {
      if (isSignUp) {
        const out = await signUp(email, password, fullName.trim() || undefined);
        if (out.error) {
          setLocalError(out.error);
          return;
        }
        if (out.needsConfirmation) {
          setSignupNote("Check your email to confirm your account, then sign in.");
          return;
        }
      } else {
        const out = await login(email, password);
        if (out.error) {
          setLocalError(out.error);
          return;
        }
      }
      navigate("/dashboard", { replace: true });
    } finally {
      setPending(false);
    }
  };

  const oauth = async (provider: "google" | "github") => {
    setLocalError(null);
    setSignupNote(null);
    setPending(true);
    try {
      const out = await signInWithOAuth(provider);
      if (out.error) setLocalError(out.error);
    } finally {
      setPending(false);
    }
  };

  if (isSupabaseConfigured() && !initialized) {
    return (
      <div className="min-h-screen bg-sweaas-bg flex items-center justify-center text-sweaas-text-secondary">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sweaas-bg flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-sweaas-blue mb-2">SWEAAS</h1>
          <p className="text-sweaas-text-secondary">
            Your AI-powered engineering team
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-sweaas-border p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-sweaas-text mb-6">
            {isSignUp ? "Create Account" : "Welcome Back"}
          </h2>

          {isSupabaseConfigured() && (
            <div className="flex flex-col gap-3 mb-6">
              <button
                type="button"
                disabled={pending}
                onClick={() => void oauth("google")}
                className="w-full py-3 rounded-lg font-medium border border-sweaas-border bg-white hover:bg-sweaas-bg transition-colors text-sweaas-text"
              >
                Continue with Google
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void oauth("github")}
                className="w-full py-3 rounded-lg font-medium border border-sweaas-border bg-[#24292f] text-white hover:opacity-90 transition-opacity"
              >
                Continue with GitHub
              </button>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-sweaas-border" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-sweaas-text-secondary">or use email</span>
                </div>
              </div>
            </div>
          )}

          {localError && (
            <p className="text-sm text-red-600 mb-4" role="alert">
              {localError}
            </p>
          )}
          {signupNote && (
            <p className="text-sm text-sweaas-text-secondary mb-4">{signupNote}</p>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium mb-2">Full name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ada Lovelace"
                  className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
                required
                minLength={6}
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full py-3 bg-sweaas-blue text-white rounded-lg font-medium hover:bg-sweaas-blue-dark transition-colors disabled:opacity-60"
            >
              {pending ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
            </button>
          </form>

          <p className="text-center text-sm text-sweaas-text-secondary mt-6">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setLocalError(null);
                setSignupNote(null);
              }}
              className="text-sweaas-blue font-medium hover:underline"
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </p>

          {!isSupabaseConfigured() && (
            <p className="text-center text-xs text-sweaas-text-secondary mt-4">
              Supabase env vars are not set — using local dev sign-in (no OAuth).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
