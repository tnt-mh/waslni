import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Flag, Heart, MessageCircle, UserRound } from 'lucide-react';
import { Screen, EmptyState } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Button, SectionTitle } from '../components/ui';
import { ProfileView } from '../components/ProfileView';
import { RideCard } from '../components/RideCard';
import { useStore, currentUser } from '../lib/store';
import { useI18n } from '../i18n';

export function PublicProfileScreen() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const me = useStore(currentUser)!;
  const user = useStore((s) => s.users.find((u) => u.id === id));
  const isSaved = useStore((s) => s.savedDrivers.some((d) => d.userId === me.id && d.driverId === id));
  const toggleSavedDriver = useStore((s) => s.toggleSavedDriver);
  const ensureConversation = useStore((s) => s.ensureConversation);
  const rides = useStore(useShallow((s) => s.rides.filter((r) => r.driverId === id && r.status === 'published' && new Date(r.departureAt).getTime() > Date.now()).slice(0, 3)));

  if (!user) {
    return (
      <Screen>
        <ScreenHeader title={t('profile.title')} />
        <div className="screen-body"><EmptyState icon={<UserRound size={28} />} title={t('common.error')} /></div>
      </Screen>
    );
  }

  if (user.id === me.id) {
    return <Navigate to="/profile" replace />;
  }

  const contact = () => {
    const convId = ensureConversation(user.id);
    if (convId) navigate(`/chat/${convId}`);
  };

  return (
    <Screen>
      <ScreenHeader title={t('profile.title')} />
      <div className="screen-body col gap-16">
        <ProfileView user={user} />

        <div className="row gap-8">
          <Button block onClick={contact}><MessageCircle size={16} /> {t('profile.contact')}</Button>
          <Button variant={isSaved ? 'secondary' : 'outline'} onClick={() => toggleSavedDriver(user.id)} aria-label={isSaved ? t('ride.unsaveDriver') : t('ride.saveDriver')}>
            <Heart size={17} fill={isSaved ? 'currentColor' : 'none'} />
          </Button>
          <Button variant="ghost" onClick={() => navigate(`/report/user/${user.id}`)} aria-label={t('msg.reportUser')}>
            <Flag size={17} />
          </Button>
        </div>

        {rides.length > 0 && (
          <>
            <SectionTitle title={t('profile.publishedRides')} />
            <div className="col gap-12">
              {rides.map((r) => <RideCard key={r.id} ride={r} showDriver={false} />)}
            </div>
          </>
        )}
      </div>
    </Screen>
  );
}