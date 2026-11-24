import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Banknote, MapPin } from 'lucide-react';
import { Screen, EmptyState, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Avatar, Banner, Button, Card, Stepper, SuccessCheck } from '../components/ui';
import { useStore, currentUser, getSeatsAvailable } from '../lib/store';
import { cityName } from '../lib/cities';
import { formatDate, formatPrice, formatTime, haptic } from '../lib/utils';
import { useI18n } from '../i18n';

export function BookScreen() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const ride = useStore((s) => s.rides.find((r) => r.id === id));
  const driver = useStore((s) => s.users.find((u) => u.id === ride?.driverId));
  const available = useStore((s) => (ride ? getSeatsAvailable(s, ride.id) : 0));
  const requestBooking = useStore((s) => s.requestBooking);
  const me = useStore(currentUser);
  const from = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.fromCityId), lang));
  const to = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.toCityId), lang));
  const [seats, setSeats] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (!ride || !me) {
    return (
      <Screen><ScreenHeader title={t('book.title')} />
        <EmptyState icon={<MapPin size={30} />} title={t('ride.notFound')} action={<Button onClick={() => navigate('/search')}>{t('common.back')}</Button>} />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen noNav>
        <div className="screen-body center" style={{ justifyContent: 'center', minHeight: '80dvh', gap: 18 }}>
          <SuccessCheck />
          <h1 className="h1">{t('book.successTitle')}</h1>
          <p className="subtitle" style={{ maxWidth: 280 }}>{t('book.successText')}</p>
          <div className="col gap-8 mt-16" style={{ width: '100%' }}>
            <Button block size="lg" onClick={() => navigate(`/reservation/${done}`)}>{t('book.viewReservations')}</Button>
            <Button block variant="ghost" onClick={() => navigate('/')}>{t('nav.home')}</Button>
          </div>
        </div>
      </Screen>
    );
  }

  const total = ride.pricePerSeat * seats;
  const submit = async () => {
    setLoading(true);
    try {
      const res = await requestBooking(ride.id, seats);
      if (!res.ok) {
        toast(t(res.error, { count: available }), 'error');
        return;
      }
      if (!res.bookingId) return toast(t('common.error'), 'error');
      haptic([20, 40, 20]);
      setDone(res.bookingId);
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('book.title')} />
      <div className="screen-body stagger">
        <Card className="col gap-12">
          <div className="row gap-12">
            {driver && <Avatar user={driver} />}
            <span className="col grow" style={{ gap: 2 }}>
              <span className="bold small">{driver?.fullName}</span>
              <span className="tiny muted">{formatDate(ride.departureAt, lang, { weekday: 'long', day: 'numeric', month: 'long' })} · {formatTime(ride.departureAt, lang)}</span>
            </span>
          </div>
          <div className="divider" />
          <span className="bold">{from} → {to}</span>
          <span className="small muted">{ride.pickupPoint} → {ride.dropoffPoint}</span>
        </Card>

        <Card className="row between">
          <span className="col" style={{ gap: 2 }}>
            <span className="small bold">{t('book.seatsLabel')}</span>
            <span className="tiny muted">{t('search.seatsLeft', { count: available })}</span>
          </span>
          <Stepper value={seats} min={1} max={Math.max(1, available)} onChange={setSeats} />
        </Card>

        <Card className="col gap-8">
          <span className="h3">{t('book.summary')}</span>
          <div className="row between small muted">
            <span>{t('ride.yourSeats', { count: seats })}</span>
            <span>{formatPrice(ride.pricePerSeat, lang)} × {seats}</span>
          </div>
          <div className="divider" />
          <div className="row between">
            <span className="bold">{t('ride.total')}</span>
            <span className="ride-price">{formatPrice(total, lang)}</span>
          </div>
          <Banner kind="info"><Banknote size={14} /> {t('ride.cashNotice')}</Banner>
        </Card>

        <p className="small muted center">{t('book.requestInfo')}</p>
        <Button block size="lg" loading={loading} onClick={submit}>{t('book.submit')}</Button>
      </div>
    </Screen>
  );
}