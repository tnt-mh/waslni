import { type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Compass, LogOut } from 'lucide-react';
import { useStore, currentUser } from './lib/store';
import { I18nProvider, useI18n } from './i18n';
import { ToastProvider, Screen, EmptyState } from './components/feedback';
import { AppShell } from './components/AppShell';
import { Banner, Button } from './components/ui';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { LoginScreen } from './screens/auth/LoginScreen';
import { SignupScreen } from './screens/auth/SignupScreen';
import { PhoneScreen } from './screens/auth/PhoneScreen';
import { ProfileSetupScreen } from './screens/auth/ProfileSetupScreen';
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

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useStore(currentUser);
  const logout = useStore((s) => s.logout);
  const { t } = useI18n();
  if (!user) return <Navigate to="/welcome" replace />;
  if (user.status === 'suspended') {
    return (
      <Screen noNav>
        <div className="screen-body col gap-16" style={{ paddingTop: 48 }}>
          <Banner kind="error">{t('auth.suspended')}</Banner>
          <Button block variant="outline" onClick={logout}><LogOut size={16} /> {t('auth.logout')}</Button>
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
      <Route path="/profile-setup" element={<RequireAuth><ProfileSetupScreen /></RequireAuth>} />

      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
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
        <Route path="/admin" element={<AdminScreen />} />
      </Route>

      <Route path="/book/:id" element={<RequireAuth><BookScreen /></RequireAuth>} />
      <Route path="/chat/:id" element={<RequireAuth><ConversationScreen /></RequireAuth>} />
      <Route path="/driver/verification" element={<RequireAuth><VerificationScreen /></RequireAuth>} />
      <Route path="/driver/publish" element={<RequireAuth><PublishRideScreen /></RequireAuth>} />
      <Route path="/review/:bookingId" element={<RequireAuth><ReviewScreen /></RequireAuth>} />
      <Route path="/report/:type/:id" element={<RequireAuth><ReportScreen /></RequireAuth>} />
      <Route path="/sos" element={<RequireAuth><SosScreen /></RequireAuth>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  const language = useStore((s) => s.language);
  return (
    <I18nProvider lang={language}>
      <ToastProvider>
        <HashRouter>
          <div className="app-frame">
            <AppRoutes />
          </div>
        </HashRouter>
      </ToastProvider>
    </I18nProvider>
  );
}