import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isSupabaseConfigured } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

type Banner =
  | { kind: "error"; message: string }
  | { kind: "success"; message: string }
  | { kind: "info"; message: string }
  | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

function Alert({ banner }: { banner: Banner }) {
  if (!banner) return null;
  const styles =
    banner.kind === "error"
      ? "bg-red-50 border-red-200 text-red-800"
      : banner.kind === "success"
        ? "bg-green-50 border-green-200 text-green-800"
        : "bg-blue-50 border-blue-200 text-blue-800";
  const icon = banner.kind === "error" ? "⚠" : banner.kind === "success" ? "✓" : "ℹ";
  return (
    <div
      role={banner.kind === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-sm mb-4 ${styles}`}
    >
      <span aria-hidden className="font-semibold">
        {icon}
      </span>
      <span className="flex-1 whitespace-pre-line">{banner.message}</span>
    </div>
  );
}

export default function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [pending, setPending] = useState(false);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const login = useAuthStore((s) => s.login);
  const signUp = useAuthStore((s) => s.signUp);
  const signInWithOAuth = useAuthStore((s) => s.signInWithOAuth);
  const resendConfirmation = useAuthStore((s) => s.resendConfirmation);
  const initialized = useAuthStore((s) => s.initialized);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const q = searchParams.get("error");
    if (q) setBanner({ kind: "error", message: decodeURIComponent(q) });
  }, [searchParams]);

  useEffect(() => {
    if (initialized && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [initialized, isAuthenticated, navigate]);

  const validate = (): string | null => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return "Please enter your email.";
    if (!EMAIL_RE.test(trimmedEmail)) return "That doesn't look like a valid email address.";
    if (!password) return "Please enter your password.";
    if (isSignUp) {
      if (password.length < MIN_PASSWORD)
        return `Password must be at least ${MIN_PASSWORD} characters.`;
      if (!fullName.trim()) return "Please enter your full name.";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    setPendingConfirmEmail(null);

    const validationError = validate();
    if (validationError) {
      setBanner({ kind: "error", message: validationError });
      return;
    }

    setPending(true);
    try {
      if (isSignUp) {
        const out = await signUp(email.trim(), password, fullName.trim() || undefined);
        if (out.alreadyRegistered) {
          setBanner({
            kind: "error",
            message: out.error ?? "An account with this email already exists.",
          });
          return;
        }
        if (out.error) {
          setBanner({ kind: "error", message: out.error });
          return;
        }
        if (out.needsConfirmation) {
          setPendingConfirmEmail(email.trim());
          setBanner({
            kind: "success",
            message: `We sent a confirmation link to ${email.trim()}.\nClick the link in your inbox to verify your account, then sign in.`,
          });
          return;
        }
        setBanner({ kind: "success", message: "Account created. Redirecting…" });
      } else {
        const out = await login(email.trim(), password);
        if (out.error) {
          setBanner({ kind: "error", message: out.error });
          return;
        }
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setBanner({
        kind: "error",
        message: err instanceof Error ? err.message : "Unexpected error. Please try again.",
      });
    } finally {
      setPending(false);
    }
  };

  const oauth = async (provider: "google" | "github") => {
    setBanner(null);
    setPendingConfirmEmail(null);
    setPending(true);
    try {
      const out = await signInWithOAuth(provider);
      if (out.error) setBanner({ kind: "error", message: out.error });
    } finally {
      setPending(false);
    }
  };

  const handleResend = async () => {
    if (!pendingConfirmEmail) return;
    setResending(true);
    try {
      const out = await resendConfirmation(pendingConfirmEmail);
      if (out.error) {
        setBanner({ kind: "error", message: out.error });
      } else {
        setBanner({
          kind: "success",
          message: `Confirmation email re-sent to ${pendingConfirmEmail}.`,
        });
      }
    } finally {
      setResending(false);
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

          {!isSupabaseConfigured() && (
            <Alert
              banner={{
                kind: "info",
                message:
                  "Supabase env vars are not set — using local dev sign-in. OAuth and email signup are disabled.",
              }}
            />
          )}

          {isSupabaseConfigured() && (
            <div className="flex flex-col gap-3 mb-6">
              <button
                type="button"
                disabled={pending}
                onClick={() => void oauth("google")}
                className="w-full py-3 rounded-lg font-medium border border-sweaas-border bg-white hover:bg-sweaas-bg transition-colors text-sweaas-text disabled:opacity-60"
              >
                Continue with Google
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void oauth("github")}
                className="w-full py-3 rounded-lg font-medium border border-sweaas-border bg-[#24292f] text-white hover:opacity-90 transition-opacity disabled:opacity-60"
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

          <Alert banner={banner} />

          {pendingConfirmEmail && (
            <div className="mb-4 -mt-2 text-sm">
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={resending}
                className="text-sweaas-blue font-medium hover:underline disabled:opacity-60"
              >
                {resending ? "Resending…" : "Resend confirmation email"}
              </button>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium mb-2" htmlFor="auth-name">
                  Full name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ada Lovelace"
                  className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
                  autoComplete="name"
                  disabled={pending}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
                autoComplete="email"
                disabled={pending}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  isSignUp ? `At least ${MIN_PASSWORD} characters` : "Enter your password"
                }
                className="w-full px-4 py-3 border border-sweaas-border rounded-lg focus:outline-none focus:border-sweaas-blue"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                disabled={pending}
              />
              {isSignUp && (
                <p className="text-xs text-sweaas-text-secondary mt-1">
                  Use {MIN_PASSWORD} or more characters.
                </p>
              )}
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
              disabled={pending}
              onClick={() => {
                setIsSignUp(!isSignUp);
                setBanner(null);
                setPendingConfirmEmail(null);
              }}
              className="text-sweaas-blue font-medium hover:underline disabled:opacity-60"
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
