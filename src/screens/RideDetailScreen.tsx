import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate, useParams } from 'react-router-dom';
import { Car, Flag, Heart, Leaf, MapPin, MessageCircle, PiggyBank, Repeat, ShieldCheck, Users } from 'lucide-react';
import { Screen, EmptyState, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Avatar, Badge, Banner, Button, Card, SectionTitle, Stars } from '../components/ui';
import { MapView } from '../components/MapView';
import { PreferenceIcons } from '../components/PreferenceIcons';
import { VerificationBadges } from '../components/VerificationBadges';
import { useStore, currentUser, getDriverRating, getSeatsAvailable, getActiveBooking, getVerification } from '../lib/store';
import { cityName } from '../lib/cities';
import { estimateCo2SavedKg, estimateSoloCost, formatDate, formatPrice, formatTime, haversineKm } from '../lib/utils';
import { useI18n } from '../i18n';

export function RideDetailScreen() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const ride = useStore((s) => s.rides.find((r) => r.id === id));
  const driver = useStore((s) => s.users.find((u) => u.id === ride?.driverId));
  const vehicle = useStore((s) => s.vehicles.find((v) => v.id === ride?.vehicleId));
  const rating = useStore(useShallow((s) => (ride ? getDriverRating(s, ride.driverId) : { avg: 0, count: 0 })));
  const reviews = useStore(useShallow((s) => s.reviews.filter((r) => r.rideId === id && r.targetId === ride?.driverId && r.status === 'visible').slice(0, 3)));
  const reviewAuthors = useStore((s) => s.users);
  const available = useStore((s) => (ride ? getSeatsAvailable(s, ride.id) : 0));
  const me = useStore(currentUser);
  const myBooking = useStore((s) => (ride && me ? getActiveBooking(s, ride.id, me.id) : undefined));
  const isSaved = useStore((s) => (me && ride ? s.savedDrivers.some((d) => d.userId === me.id && d.driverId === ride.driverId) : false));
  const toggleSaved = useStore((s) => s.toggleSavedDriver);
  const ensureConversation = useStore((s) => s.ensureConversation);
  const from = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.fromCityId), lang));
  const to = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.toCityId), lang));
  const verification = useStore((s) => (ride ? getVerification(s, ride.driverId) : null));

  const stats = useMemo(() => {
    if (!ride) return null;
    const f = useStore.getState().cities.find((c) => c.id === ride.fromCityId);
    const tt = useStore.getState().cities.find((c) => c.id === ride.toCityId);
    if (!f || !tt) return null;
    const km = Math.round(haversineKm(f.lat, f.lon, tt.lat, tt.lon) * 1.25);
    return { km, solo: estimateSoloCost(km), co2: estimateCo2SavedKg(km, Math.max(1, ride.seatsTotal - 1)) };
  }, [ride]);

  if (!ride || !driver) {
    return (
      <Screen>
        <ScreenHeader title={t('ride.details')} />
        <EmptyState icon={<MapPin size={30} />} title={t('ride.notFound')} action={<Button onClick={() => navigate('/search')}>{t('empty.backHome')}</Button>} />
      </Screen>
    );
  }

  const isMine = me?.id === ride.driverId;
  const departed = new Date(ride.departureAt).getTime() <= Date.now();
  const canBook = ride.status === 'published' && !departed && available > 0 && !isMine && !myBooking;

  const contact = async () => {
    try {
      const conv = await ensureConversation(driver.id, ride.id, myBooking?.id ?? null);
      if (!conv) return toast(t('common.error'), 'error');
      navigate(`/chat/${conv}`);
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  const changeSaved = async () => {
    try {
      const res = await toggleSaved(driver.id);
      if (!res.ok) toast(t(res.error), 'error');
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('ride.details')} />
      <div className="screen-body stagger">
        {ride.status === 'cancelled' && <Banner kind="error">{t('ride.cancelled')}</Banner>}
        {ride.status === 'completed' && <Banner kind="info">{t('ride.completed')}</Banner>}
        {ride.womenOnly && <Banner kind="info"><ShieldCheck size={14} /> {t('ride.womenOnlyNotice')}</Banner>}

        <MapView fromCityId={ride.fromCityId} toCityId={ride.toCityId} stopCityIds={ride.stops.map((s) => s.cityId)} />

        <Card className="col gap-12">
          <div className="ride-route">
            <div className="route-times">
              <span>{formatTime(ride.departureAt, lang)}</span>
              <span className="muted" style={{ fontWeight: 600 }}>{formatTime(ride.arrivalAt, lang)}</span>
            </div>
            <div className="route-line"><span className="dot" /><span className="line" /><span className="dot filled" /></div>
            <div className="route-cities">
              <div className="col" style={{ gap: 0 }}>
                <span className="city">{from}</span>
                <span className="point">{formatDate(ride.departureAt, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                <span className="point">{ride.pickupPoint}</span>
              </div>
              <div className="col" style={{ gap: 0 }}>
                <span className="city">{to}</span>
                <span className="point">{t('search.arrival')}</span>
                <span className="point">{ride.dropoffPoint}</span>
              </div>
            </div>
          </div>
          {ride.stops.length > 0 && (
            <div className="row wrap gap-8">
              <Flag size={13} color="var(--text-2)" />
              {ride.stops.map((s, i) => (
                <Badge key={i} variant="neutral">{cityName(useStore.getState().cities.find((c) => c.id === s.cityId), lang)} · {s.label}</Badge>
              ))}
            </div>
          )}
          <div className="row between wrap gap-8">
            <span className="row gap-8 tiny muted">
              <Users size={13} /> {t('search.seatsLeft', { count: available })}
              {ride.recurring && <Badge><Repeat size={10} /> {t('search.recurringBadge')}</Badge>}
            </span>
            {stats && <span className="tiny muted">{stats.km} {t('common.km')} · {t('ride.estimatedDuration')} ~{Math.round((new Date(ride.arrivalAt).getTime() - new Date(ride.departureAt).getTime()) / 60000)} {t('common.min')}</span>}
          </div>
        </Card>

        <Card className="col gap-12">
          <div className="row between">
            <button className="row gap-12 grow" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'start' }} onClick={() => navigate(`/user/${driver.id}`)}>
              <Avatar user={driver} size="lg" verified={verification?.status === 'verified'} />
              <span className="col grow" style={{ gap: 3 }}>
                <span className="bold">{driver.fullName}</span>
                <span className="row gap-8 tiny muted">
                  {rating.count > 0 ? <><Stars value={rating.avg} size={12} showValue /> · {rating.count} {t('profile.reviews').toLowerCase()}</> : t('profile.noRating')}
                </span>
                <VerificationBadges user={driver} compact />
              </span>
            </button>
            <button className="icon-btn" aria-label={isSaved ? t('ride.unsaveDriver') : t('ride.saveDriver')} onClick={async () => { await changeSaved(); }}>
              <Heart size={20} fill={isSaved ? 'var(--error)' : 'none'} color={isSaved ? 'var(--error)' : 'var(--text-2)'} />
            </button>
          </div>
          {driver.bio && <p className="small muted">{driver.bio}</p>}
          <div className="row gap-8">
            <Button variant="secondary" size="sm" block onClick={contact}><MessageCircle size={15} /> {t('ride.contactDriver')}</Button>
            <Button variant="outline" size="sm" block onClick={() => navigate(`/user/${driver.id}`)}>{t('ride.viewProfile')}</Button>
          </div>
        </Card>

        {vehicle && (
          <Card className="row gap-12">
            <span className="empty-icon" style={{ width: 44, height: 44, margin: 0 }}><Car size={20} /></span>
            <span className="col grow" style={{ gap: 2 }}>
              <span className="small bold">{vehicle.brand} {vehicle.model} · {vehicle.color}</span>
              <span className="tiny muted">{vehicle.year} · {t('ride.plate')} : {vehicle.plate}</span>
            </span>
          </Card>
        )}

        <Card className="col gap-8">
          <span className="h3">{t('ride.preferences')}</span>
          <PreferenceIcons prefs={ride.preferences} size={15} />
          {ride.notes && <p className="small muted mt-8">{ride.notes}</p>}
        </Card>

        <Card className="col gap-8">
          <div className="row between">
            <span className="h3">{t('ride.priceBreakdown')}</span>
            <span className="ride-price">{formatPrice(ride.pricePerSeat, lang)}</span>
          </div>
          <div className="row between small muted"><span>{t('ride.pricePerSeat')}</span><span>{formatPrice(ride.pricePerSeat, lang)}</span></div>
          <div className="divider" />
          <Banner kind="info">{t('ride.cashNotice')}</Banner>
          {stats && (
            <div className="col gap-4 mt-8">
              <span className="row gap-8 small success-text"><PiggyBank size={14} /> {t('ride.savings', { amount: formatPrice(Math.max(0, stats.solo - ride.pricePerSeat), lang) })}</span>
              <span className="row gap-8 small success-text"><Leaf size={14} /> {t('ride.co2', { kg: stats.co2 })}</span>
              <span className="tiny muted-2">{t('ride.estimatesNote')}</span>
            </div>
          )}
        </Card>

        <Card className="col gap-8">
          <span className="h3">{t('ride.cancellationPolicy')}</span>
          <p className="small muted">{t('ride.cancellationText')}</p>
        </Card>

        <SectionTitle title={t('ride.reviews')} />
        {reviews.length === 0 ? (
          <Card flat className="small muted center" style={{ background: 'transparent', border: '1.5px dashed var(--border)', boxShadow: 'none' }}>{t('ride.noReviews')}</Card>
        ) : (
          reviews.map((r) => {
            const author = reviewAuthors.find((u) => u.id === r.authorId);
            return (
              <Card key={r.id} className="col gap-8">
                <div className="row between">
                  <span className="row gap-8"><Avatar user={author} size="sm" /><span className="small bold">{author?.fullName}</span></span>
                  <Stars value={r.stars} size={12} />
                </div>
                {r.text && <p className="small muted">{r.text}</p>}
              </Card>
            );
          })
        )}

        <button className="btn ghost sm" style={{ alignSelf: 'center' }} onClick={() => navigate(`/report/ride/${ride.id}`)}>
          <Flag size={14} /> {t('ride.reportRide')}
        </button>
      </div>

      <div style={{ position: 'sticky', bottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom, 0px))', padding: '12px 16px', background: 'rgba(245,247,252,0.95)', backdropFilter: 'blur(10px)', zIndex: 30 }}>
        {isMine ? (
          <Button block size="lg" onClick={() => navigate(`/driver/ride/${ride.id}`)}>{t('driver.manage')}</Button>
        ) : myBooking ? (
          <Button block size="lg" variant="secondary" onClick={() => navigate(`/reservation/${myBooking.id}`)}>{t('res.details')}</Button>
        ) : (
          <Button block size="lg" disabled={!canBook} onClick={() => navigate(`/book/${ride.id}`)}>
            {available === 0 ? t('search.full') : departed || ride.status !== 'published' ? t('ride.unavailable') : t('ride.book')}
          </Button>
        )}
      </div>
    </Screen>
  );
}