import { useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CloudOff, Compass, LoaderCircle } from 'lucide-react';
import { useStore, currentUser } from './lib/store';
import { canStaff } from './lib/staff';
import { runtimeConfigError, runtimeMode } from './lib/runtime';
import { I18nProvider, useI18n } from './i18n';
import { ToastProvider, Screen, EmptyState } from './components/feedback';
import { AppShell } from './components/AppShell';
import { Button } from './components/ui';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { LoginScreen } from './screens/auth/LoginScreen';
import { SignupScreen } from './screens/auth/SignupScreen';
import { PhoneScreen } from './screens/auth/PhoneScreen';
import { ProfileSetupScreen } from './screens/auth/ProfileSetupScreen';
import { ResetPasswordScreen } from './screens/auth/ResetPasswordScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SearchScreen } from './screens/SearchScreen';
import { RideDetailScreen } from './screens/RideDetailScreen';
import { BookScreen } from './screens/BookScreen';
import { ReservationsScreen } from './screens/ReservationsScreen';
import { ReservationDetailScreen } from './screens/ReservationDetailScreen';
import { RideRequestsScreen } from './screens/RideRequestsScreen';
import { DriverDashboard } from './screens/driver/DriverDashboard';
import { VerificationScreen } from './screens/driver/VerificationScreen';
import { PublishRideScreen } from './screens/driver/PublishRideScreen';
import { MyRidesScreen } from './screens/driver/MyRidesScreen';
import { ManageRideScreen } from './screens/driver/ManageRideScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { ConversationScreen } from './screens/ConversationScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { PublicProfileScreen } from './screens/PublicProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { IntegrationsScreen } from './screens/IntegrationsScreen';
import { SafetyScreen } from './screens/SafetyScreen';
import { SosScreen } from './screens/SosScreen';
import { ReportScreen } from './screens/ReportScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { AdminScreen } from './screens/AdminScreen';
import { AccountAccessScreen } from './screens/AccountAccessScreen';

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useStore(currentUser);
  if (!user) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

function RequireActive({ children }: { children: ReactNode }) {
  const user = useStore(currentUser);
  if (!user) return <Navigate to="/welcome" replace />;
  if (user.status === 'suspended' || user.restrictionStatus === 'banned' || user.restrictionStatus === 'timeout') {
    return <Navigate to="/account/restrictions" replace />;
  }
  return <>{children}</>;
}

function RequireStaff({ children }: { children: ReactNode }) {
  const user = useStore(currentUser);
  const { t } = useI18n();
  if (!user) return <Navigate to="/welcome" replace />;
  if (user.status === 'suspended' || user.restrictionStatus === 'banned' || user.restrictionStatus === 'timeout') {
    return <Navigate to="/account/restrictions" replace />;
  }
  if (!canStaff(user, 'view_admin')) {
    return (
      <Screen noNav>
        <div className="screen-body" style={{ paddingTop: 48 }}>
          <EmptyState icon={<Compass size={28} />} title={t('admin.roleGuard')} />
        </div>
      </Screen>
    );
  }
  return <>{children}</>;
}

function HomeOrDashboard() {
  const user = useStore(currentUser)!;
  return user.mode === 'driver' ? <DriverDashboard /> : <HomeScreen />;
}

function NotFound() {
  const { t } = useI18n();
  return (
    <Screen noNav>
      <div className="screen-body" style={{ paddingTop: 48 }}>
        <EmptyState
          icon={<Compass size={28} />}
          title={t('error.notFound')}
          action={<Button onClick={() => window.location.assign('#/')}>{t('nav.home')}</Button>}
        />
      </div>
    </Screen>
  );
}

function AppRoutes() {
  const user = useStore(currentUser);
  return (
    <Routes>
      <Route path="/welcome" element={user ? <Navigate to="/" replace /> : <WelcomeScreen />} />
      <Route path="/onboarding" element={<OnboardingScreen />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/signup" element={<SignupScreen />} />
      <Route path="/phone" element={<PhoneScreen />} />
      <Route path="/reset-password" element={<ResetPasswordScreen />} />
      <Route path="/profile-setup" element={<RequireActive><ProfileSetupScreen /></RequireActive>} />

      <Route element={<RequireActive><AppShell /></RequireActive>}>
        <Route path="/" element={<HomeOrDashboard />} />
        <Route path="/driver" element={<Navigate to="/" replace />} />
        <Route path="/search" element={<SearchScreen />} />
        <Route path="/ride/:id" element={<RideDetailScreen />} />
        <Route path="/reservations" element={<ReservationsScreen />} />
        <Route path="/reservation/:id" element={<ReservationDetailScreen />} />
        <Route path="/requests" element={<RideRequestsScreen />} />
        <Route path="/driver/rides" element={<MyRidesScreen />} />
        <Route path="/driver/ride/:id" element={<ManageRideScreen />} />
        <Route path="/messages" element={<MessagesScreen />} />
        <Route path="/notifications" element={<NotificationsScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/user/:id" element={<PublicProfileScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/integrations" element={<IntegrationsScreen />} />
        <Route path="/safety" element={<SafetyScreen />} />
        <Route path="/admin" element={<RequireStaff><AdminScreen /></RequireStaff>} />
      </Route>

      <Route path="/account/restrictions" element={<RequireAuth><AccountAccessScreen view="restrictions" /></RequireAuth>} />
      <Route path="/appeals" element={<RequireAuth><AccountAccessScreen view="appeals" /></RequireAuth>} />

      <Route path="/book/:id" element={<RequireActive><BookScreen /></RequireActive>} />
      <Route path="/chat/:id" element={<RequireActive><ConversationScreen /></RequireActive>} />
      <Route path="/driver/verification" element={<RequireActive><VerificationScreen /></RequireActive>} />
      <Route path="/driver/publish" element={<RequireActive><PublishRideScreen /></RequireActive>} />
      <Route path="/review/:bookingId" element={<RequireActive><ReviewScreen /></RequireActive>} />
      <Route path="/report/:type/:id" element={<RequireActive><ReportScreen /></RequireActive>} />
      <Route path="/sos" element={<RequireActive><SosScreen /></RequireActive>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  const language = useStore((s) => s.language);
  const initialize = useStore((s) => s.initialize);
  const connectionStatus = useStore((s) => s.connectionStatus);
  const connectionError = useStore((s) => s.connectionError);
  const { t } = useI18n();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const blocked = runtimeConfigError || (runtimeMode === 'production' && connectionStatus === 'error' ? connectionError : null);

  return (
    <I18nProvider lang={language}>
      <ToastProvider>
        <HashRouter>
          <div className="app-frame">
            {blocked ? (
              <Screen noNav>
                <div className="screen-body col gap-16" style={{ paddingTop: 64 }}>
                  <EmptyState
                    icon={<CloudOff size={30} />}
                    title={t('connection.title')}
                    text={t(blocked)}
                    action={<Button onClick={() => window.location.reload()}>{t('common.retry')}</Button>}
                  />
                </div>
              </Screen>
            ) : runtimeMode === 'production' && connectionStatus === 'loading' ? (
              <Screen noNav>
                <div className="screen-body row" style={{ paddingTop: 64, justifyContent: 'center' }}>
                  <LoaderCircle className="spin" size={22} /> <span className="subtitle">{t('common.loading')}</span>
                </div>
              </Screen>
            ) : (
              <AppRoutes />
            )}
          </div>
        </HashRouter>
      </ToastProvider>
    </I18nProvider>
  );
}