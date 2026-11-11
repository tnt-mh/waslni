import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Plus, Route } from 'lucide-react';
import { Screen, EmptyState } from '../../components/feedback';
import { ScreenHeader } from '../../components/AppShell';
import { Button, IconButton, Segmented } from '../../components/ui';
import { RideCard } from '../../components/RideCard';
import { useStore, currentUser } from '../../lib/store';
import { useI18n } from '../../i18n';

type Tab = 'upcoming' | 'completed' | 'cancelled';

export function MyRidesScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const me = useStore(currentUser)!;
  const rides = useStore(useShallow((s) => s.rides.filter((r) => r.driverId === me.id)));
  const [tab, setTab] = useState<Tab>('upcoming');

  const list = rides
    .filter((r) => (tab === 'upcoming' ? r.status === 'published' || r.status === 'in_progress' : r.status === tab))
    .sort((a, b) => (tab === 'upcoming' ? a.departureAt.localeCompare(b.departureAt) : b.departureAt.localeCompare(a.departureAt)));

  return (
    <Screen>
      <ScreenHeader
        title={t('driver.myRides')}
        back={false}
        right={<IconButton label={t('driver.publishRide')} onClick={() => navigate('/driver/publish')}><Plus size={20} /></IconButton>}
      />
      <div className="screen-body col gap-16">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: t('res.upcoming') },
            { value: 'completed', label: t('driver.completedRides') },
            { value: 'cancelled', label: t('ride.cancelled') },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState
            icon={<Route size={28} />}
            title={t('driver.noRides')}
            text={t('driver.noRidesHint')}
            action={<Button onClick={() => navigate('/driver/publish')}>{t('driver.publishRide')}</Button>}
          />
        ) : (
          <div className="col gap-12 stagger">
            {list.map((r) => <RideCard key={r.id} ride={r} showDriver={false} to={`/driver/ride/${r.id}`} />)}
          </div>
        )}
      </div>
    </Screen>
  );
}