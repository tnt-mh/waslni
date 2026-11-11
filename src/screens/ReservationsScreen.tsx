import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import { Screen, EmptyState } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Button, Segmented } from '../components/ui';
import { BookingCard } from '../components/BookingCard';
import { useStore, currentUser } from '../lib/store';
import { useI18n } from '../i18n';

export function ReservationsScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const me = useStore(currentUser)!;
  const bookings = useStore((s) => s.bookings);
  const rides = useStore((s) => s.rides);
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const asDriver = me.mode === 'driver';

  const mine = useMemo(() => {
    const list = asDriver
      ? bookings.filter((b) => rides.some((r) => r.id === b.rideId && r.driverId === me.id))
      : bookings.filter((b) => b.passengerId === me.id);
    const withRide = list
      .map((b) => ({ b, ride: rides.find((r) => r.id === b.rideId)! }))
      .filter((x) => x.ride);
    const upcoming = withRide
      .filter((x) => (x.b.status === 'pending' || x.b.status === 'confirmed') && x.ride.status !== 'cancelled' && x.ride.status !== 'completed')
      .sort((a, b) => a.ride.departureAt.localeCompare(b.ride.departureAt));
    const history = withRide
      .filter((x) => !upcoming.includes(x))
      .sort((a, b) => b.ride.departureAt.localeCompare(a.ride.departureAt));
    return { upcoming, history };
  }, [bookings, rides, me.id, asDriver]);

  const list = tab === 'upcoming' ? mine.upcoming : mine.history;

  return (
    <Screen>
      <ScreenHeader title={t('res.title')} back={false} />
      <div className="screen-body">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: `${t('res.upcoming')} (${mine.upcoming.length})` },
            { value: 'history', label: t('res.history') },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState
            icon={<Ticket size={30} />}
            title={t('res.empty')}
            text={t('res.emptyHint')}
            action={!asDriver ? <Button onClick={() => navigate('/search')}>{t('res.findRide')}</Button> : undefined}
          />
        ) : (
          <div className="col gap-12 stagger">
            {list.map(({ b }) => <BookingCard key={b.id} booking={b} asDriver={asDriver} />)}
          </div>
        )}
      </div>
    </Screen>
  );
}