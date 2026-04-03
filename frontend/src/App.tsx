import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import { useAuthStore } from "./store/authStore";
import CTOCallView from "./views/CTOCallView";
import CTOReplicaDirectoryView from "./views/CTOReplicaDirectoryView";
import CustomerCallPreview from "./views/CustomerCallPreview";
import DashboardView from "./views/DashboardView";
import LoginView from "./views/LoginView";
import OnboardingView from "./views/OnboardingView";
import OrgChartView from "./views/OrgChartView";
import SettingsView from "./views/SettingsView";
import { lazy, Suspense } from "react";

const HQView = lazy(() => import("./three/HQView"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginView />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardView />} />
          <Route path="/onboarding" element={<OnboardingView />} />
          <Route
            path="/hq"
            element={
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-96 text-sweaas-text-secondary">
                    Loading 3D Headquarters...
                  </div>
                }
              >
                <HQView />
              </Suspense>
            }
          />
          <Route path="/agents" element={<DashboardView />} />
          <Route path="/org-chart" element={<OrgChartView />} />
          <Route path="/budget" element={<DashboardView />} />
          <Route path="/reports" element={<DashboardView />} />
          <Route path="/cto-call" element={<CTOCallView />} />
          <Route path="/cto-call/all" element={<CTOReplicaDirectoryView />} />
          <Route path="/customer-support" element={<CustomerCallPreview />} />
          <Route path="/settings" element={<SettingsView />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
