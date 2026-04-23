import * as Sentry from "@sentry/react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import { isSupabaseConfigured } from "./lib/supabase";
import { useAuthStore } from "./store/authStore";
import AuthCallbackView from "./views/AuthCallbackView";
import CTOCallView from "./views/CTOCallView";
import CTOReplicaDirectoryView from "./views/CTOReplicaDirectoryView";
import CustomerCallPreview from "./views/CustomerCallPreview";
import DashboardView from "./views/DashboardView";
import LoginView from "./views/LoginView";
import AgentDirectoryView from "./views/AgentDirectoryView";
import NotificationsView from "./views/NotificationsView";
import OnboardingView from "./views/OnboardingView";
import OrgChartView from "./views/OrgChartView";
import ReportsView from "./views/ReportsView";
import RevenueView from "./views/RevenueView";
import SettingsView from "./views/SettingsView";
import { lazy, Suspense, useEffect } from "react";

// The unified HQ experience — campus exterior + interactive office interior —
// lives at /welcome-hw. Legacy /hq URLs redirect here (see route below).
const WelcomeHWView = lazy(() => import("./three/WelcomeHWView"));

function ProtectedRoute({ children, requireOnboarding = true }: { children: React.ReactNode; requireOnboarding?: boolean }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  useEffect(() => {
    if (isAuthenticated && !user) {
      void fetchProfile();
    }
  }, [isAuthenticated, user, fetchProfile]);

  if (isSupabaseConfigured() && !initialized) {
    return (
      <div className="min-h-screen bg-sweaas-bg flex items-center justify-center text-sweaas-text-secondary">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireOnboarding && user && !user.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

function SentryFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-sweaas-bg text-sweaas-text-primary p-8">
      <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
      <p className="text-sweaas-text-secondary mb-6">
        An unexpected error occurred. Our team has been notified.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-2 bg-sweaas-accent text-white rounded-lg hover:opacity-90 transition-opacity"
      >
        Reload Page
      </button>
    </div>
  );
}

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  return <>{children}</>;
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<SentryFallback />}>
      <BrowserRouter>
        <AuthBootstrap>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/auth/callback" element={<AuthCallbackView />} />

          <Route
            path="/onboarding"
            element={
              <ProtectedRoute requireOnboarding={false}>
                <OnboardingView />
              </ProtectedRoute>
            }
          />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardView />} />
            <Route
              path="/welcome-hw"
              element={
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-96 text-sweaas-text-secondary">
                      Loading 3D Headquarters...
                    </div>
                  }
                >
                  <WelcomeHWView />
                </Suspense>
              }
            />
            {/* Legacy /hq URL — redirect to the unified welcome scene so old
                links from org chart, notifications, etc. still work. */}
            <Route path="/hq" element={<Navigate to="/welcome-hw" replace />} />
            <Route path="/agents" element={<AgentDirectoryView />} />
            <Route path="/org-chart" element={<OrgChartView />} />
            <Route path="/budget" element={<DashboardView />} />
            <Route path="/revenue" element={<RevenueView />} />
            <Route path="/reports" element={<ReportsView />} />
            <Route path="/cto-call" element={<CTOCallView />} />
            <Route path="/cto-call/all" element={<CTOReplicaDirectoryView />} />
            <Route path="/customer-support" element={<CustomerCallPreview />} />
            <Route path="/notifications" element={<NotificationsView />} />
            <Route path="/settings" element={<SettingsView />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </AuthBootstrap>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  );
}
