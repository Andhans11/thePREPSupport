import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import { ToastProvider } from './contexts/ToastContext';
import { TicketProvider } from './contexts/TicketContext';
import { GmailProvider } from './contexts/GmailContext';
import { ModulesProvider } from './contexts/ModulesContext';
import { GoogleCalendarProvider } from './contexts/GoogleCalendarContext';
import { MasterDataProvider } from './contexts/MasterDataContext';
import { DashboardProvider } from './contexts/DashboardContext';
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
import { TimeRegistrationPage } from './pages/TimeRegistrationPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';
import { AddEmailInboxPage } from './pages/AddEmailInboxPage';
import { AddCalendarPage } from './pages/AddCalendarPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { useCurrentUserRole } from './hooks/useCurrentUserRole';
import { useModules } from './contexts/ModulesContext';
import { canAccessModule } from './types/modules';
import { isAgent } from './types/roles';

function HomeOrLanding() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <p className="text-[#64748b]">Laster…</p>
      </div>
    );
  }
  if (!user) {
    if (location.pathname !== '/') {
      const redirect = `${location.pathname}${location.search}${location.hash}`;
      return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
    }
    return <LandingPage />;
  }
  return <Layout />;
}

function AnalyticsGuard() {
  const { role, loading: roleLoading } = useCurrentUserRole();
  const { loading, analyticsEnabled, roleAccess } = useModules();
  if (loading || roleLoading) return null;
  if (!canAccessModule('analytics', analyticsEnabled, roleAccess.analytics, role)) {
    return <Navigate to="/" replace />;
  }
  return <AnalyticsPage />;
}

function PlanningGuard() {
  const { role, loading: roleLoading } = useCurrentUserRole();
  const { loading, planningEnabled, roleAccess } = useModules();
  if (loading || roleLoading) return null;
  if (!canAccessModule('planning', planningEnabled, roleAccess.planning, role)) {
    return <Navigate to="/" replace />;
  }
  return <PlanningPage />;
}

function TimeRegistrationGuard() {
  const { role, loading: roleLoading } = useCurrentUserRole();
  const { loading, timeRegistrationEnabled, roleAccess } = useModules();
  if (loading || roleLoading) return null;
  if (!canAccessModule('time_registration', timeRegistrationEnabled, roleAccess.time_registration, role)) {
    return <Navigate to="/" replace />;
  }
  return <TimeRegistrationPage />;
}

function CalendarGuard() {
  const { role, loading: roleLoading } = useCurrentUserRole();
  const { loading, calendarEnabled, roleAccess } = useModules();
  if (loading || roleLoading) return null;
  const moduleOk = canAccessModule('calendar', calendarEnabled, roleAccess.calendar, role);
  const agentTenantCalendar = calendarEnabled && isAgent(role);
  if (!moduleOk && !agentTenantCalendar) {
    return <Navigate to="/" replace />;
  }
  return <CalendarPage />;
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
      <Route path="/oauth/callback/calendar" element={<OAuthCallbackPage />} />
      <Route path="/" element={<HomeOrLanding />}>
        <Route index element={<DashboardPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="analytics" element={<AnalyticsGuard />} />
        <Route path="planning" element={<PlanningGuard />} />
        <Route path="timeregistrering" element={<TimeRegistrationGuard />} />
        <Route path="kalender" element={<CalendarGuard />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/inboxes/new" element={<AddEmailInboxPage />} />
        <Route path="settings/calendar/new" element={<AddCalendarPage />} />
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
              <ModulesProvider>
                <GoogleCalendarProvider>
                  <MasterDataProvider>
                    <DashboardProvider>
                      <TicketProvider>
                        <AppRoutes />
                      </TicketProvider>
                    </DashboardProvider>
                  </MasterDataProvider>
                </GoogleCalendarProvider>
              </ModulesProvider>
            </GmailProvider>
          </ToastProvider>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
