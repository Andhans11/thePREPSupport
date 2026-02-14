import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import { ToastProvider } from './contexts/ToastContext';
import { TicketProvider } from './contexts/TicketContext';
import { GmailProvider } from './contexts/GmailContext';
import { MasterDataProvider } from './contexts/MasterDataContext';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { LandingPage } from './pages/LandingPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { TicketsPage } from './pages/TicketsPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { PlanningPage } from './pages/PlanningPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotificationsPage } from './pages/NotificationsPage';

function HomeOrLanding() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <p className="text-[#64748b]">Laster…</p>
      </div>
    );
  }
  if (!user) {
    return <LandingPage />;
  }
  return <Layout />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/" element={<HomeOrLanding />}>
        <Route index element={<DashboardPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="planning" element={<PlanningPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <ToastProvider>
            <GmailProvider>
              <MasterDataProvider>
                <TicketProvider>
                  <AppRoutes />
                </TicketProvider>
              </MasterDataProvider>
            </GmailProvider>
          </ToastProvider>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
