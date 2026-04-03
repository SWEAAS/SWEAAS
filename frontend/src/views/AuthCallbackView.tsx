import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

export default function AuthCallbackView() {
  const navigate = useNavigate();
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  useEffect(() => {
    const run = async () => {
      if (!isSupabaseConfigured()) {
        navigate("/login", { replace: true });
        return;
      }

      const supabase = getSupabase();
      const params = new URLSearchParams(window.location.search);
      if (params.get("error")) {
        const desc = params.get("error_description") || params.get("error");
        navigate(`/login?error=${encodeURIComponent(desc || "oauth_error")}`, { replace: true });
        return;
      }

      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          navigate(`/login?error=${encodeURIComponent(error.message)}`, { replace: true });
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        localStorage.setItem("sweaas_token", session.access_token);
        useAuthStore.setState({
          token: session.access_token,
          isAuthenticated: true,
        });
        await fetchProfile();
        navigate("/dashboard", { replace: true });
        return;
      }

      navigate("/login?error=no_session", { replace: true });
    };

    void run();
  }, [navigate, fetchProfile]);

  return (
    <div className="min-h-screen bg-sweaas-bg flex items-center justify-center text-sweaas-text-secondary">
      Completing sign-in…
    </div>
  );
}
