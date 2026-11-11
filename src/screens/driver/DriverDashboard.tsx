import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Car, CheckCircle2, Clock, Inbox, Plus, Route, ShieldAlert, Wallet, XCircle } from 'lucide-react';
import { Screen, useToast } from '../../components/feedback';
import { NotifBell } from '../../components/AppShell';
import { Logo } from '../../components/Logo';
import { Avatar, Badge, Banner, Button, Card, SectionTitle } from '../../components/ui';
import { RideCard } from '../../components/RideCard';
import { useStore, currentUser, getVerification, getSeatsAvailable } from '../../lib/store';
import { cityName } from '../../lib/cities';
import { formatPrice } from '../../lib/utils';
import { useI18n } from '../../i18n';

export function DriverDashboard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useStore(currentUser)!;
  const verification = useStore((s) => getVerification(s, me.id));
  const rides = useStore(useShallow((s) => s.rides.filter((r) => r.driverId === me.id)));
  const bookings = useStore((s) => s.bookings);
  const users = useStore((s) => s.users);
  const decideBooking = useStore((s) => s.decideBooking);
  const requests = useStore(useShallow((s) => s.rideRequests.filter((r) => r.status === 'open')));

  const upcoming = rides.filter((r) => r.status === 'published' && new Date(r.departureAt).getTime() > Date.now()).sort((a, b) => a.departureAt.localeCompare(b.departureAt));
  const completed = rides.filter((r) => r.status === 'completed');
  const pending = useMemo(
    () => bookings.filter((b) => b.status === 'pending' && rides.some((r) => r.id === b.rideId && r.status === 'published')),
    [bookings, rides],
  );
  const seats = upcoming.reduce((sum, r) => sum + getSeatsAvailable(useStore.getState(), r.id), 0);
  const earnings = bookings
    .filter((b) => b.driverReceived && b.passengerPaid && rides.some((r) => r.id === b.rideId))
    .reduce((sum, b) => {
      const ride = rides.find((r) => r.id === b.rideId);
      return sum + (ride ? ride.pricePerSeat * b.seats : 0);
    }, 0);
  const matchingRequests = requests.filter((q) => rides.some((r) => r.status === 'published' && r.fromCityId === q.fromCityId && r.toCityId === q.toCityId));

  const verified = verification.status === 'verified';

  return (
    <Screen>
      <header className="screen-header">
        <Logo size={30} />
        <span className="grow" />
        <NotifBell />
        <button className="icon-btn" onClick={() => navigate('/profile')} aria-label={t('nav.profile')}><Avatar user={me} size="sm" /></button>
      </header>
      <div className="screen-body stagger">
        <div className="row between">
          <h1 className="h1">{t('driver.welcome', { name: me.fullName.split(' ')[0] })}</h1>
          <Badge variant={me.mode === 'driver' ? 'navy' : 'neutral'}><Car size={11} /> {t('mode.driver')}</Badge>
        </div>

        {!verified && (
          <Card className="col gap-12" style={verification.status === 'rejected' ? { borderColor: 'var(--error)' } : undefined}>
            <span className="row gap-8 h3">
              {verification.status === 'pending' ? <Clock size={18} color="var(--warning)" /> : verification.status === 'rejected' ? <ShieldAlert size={18} color="var(--error)" /> : <BadgeCheck size={18} color="var(--navy)" />}
              {t('driver.verificationStatus')} : {t(`verify.status.${verification.status}`)}
            </span>
            <p className="small muted">
              {verification.status === 'pending' ? t('driver.pendingReviewText') : verification.status === 'rejected' ? `${t('driver.rejected')} — ${verification.reason ?? ''}` : t('driver.verificationNeededText')}
            </p>
            {verification.status !== 'pending' && (
              <Button onClick={() => navigate('/driver/verification')}>
                {verification.status === 'rejected' ? t('driver.resubmit') : t('driver.startVerification')}
              </Button>
            )}
          </Card>
        )}
        {verified && (
          <Banner kind="success"><BadgeCheck size={15} /> {t('driver.verified')}</Banner>
        )}

        <div className="stat-grid">
          <div className="stat-card"><div className="stat-value">{upcoming.length}</div><div className="stat-label">{t('driver.activeRides')}</div></div>
          <div className="stat-card"><div className="stat-value">{seats}</div><div className="stat-label">{t('driver.availableSeats')}</div></div>
          <div className="stat-card"><div className="stat-value">{completed.length}</div><div className="stat-label">{t('driver.completedRides')}</div></div>
          <div className="stat-card"><div className="stat-value">{formatPrice(earnings, lang)}</div><div className="stat-label">{t('driver.earnings')}</div></div>
        </div>
        <p className="tiny muted-2" style={{ marginTop: -8 }}>{t('driver.earningsNote')}</p>

        <SectionTitle title={`${t('driver.bookingRequests')} (${pending.length})`} />
        {pending.length === 0 ? (
          <Card flat className="row gap-12" style={{ background: 'transparent', border: '1.5px dashed var(--border)', boxShadow: 'none' }}>
            <Inbox size={18} color="var(--text-3)" /><span className="small muted">{t('driver.noRequests')}</span>
          </Card>
        ) : (
          pending.map((b) => {
            const ride = rides.find((r) => r.id === b.rideId)!;
            const passenger = users.find((u) => u.id === b.passengerId);
            return (
              <Card key={b.id} className="col gap-12">
                <div className="row gap-12">
                  {passenger && <Avatar user={passenger} />}
                  <span className="col grow" style={{ gap: 2 }}>
                    <span className="small bold">{passenger?.fullName}</span>
                    <span className="tiny muted">
                      {cityName(useStore.getState().cities.find((c) => c.id === ride.fromCityId), lang)} → {cityName(useStore.getState().cities.find((c) => c.id === ride.toCityId), lang)} · {b.seats} {t(b.seats > 1 ? 'common.seats' : 'common.seat')}
                    </span>
                  </span>
                  <span className="navy-text bold small">{formatPrice(ride.pricePerSeat * b.seats, lang)}</span>
                </div>
                <div className="row gap-8">
                  <Button variant="outline" size="sm" block onClick={() => { decideBooking(b.id, false); toast(t('driver.rejected'), 'info'); }}>
                    <XCircle size={14} /> {t('driver.reject')}
                  </Button>
                  <Button size="sm" block onClick={() => { const res = decideBooking(b.id, true); toast(res.ok ? t('driver.accepted') : t(res.error), res.ok ? 'success' : 'error'); }}>
                    <CheckCircle2 size={14} /> {t('driver.accept')}
                  </Button>
                </div>
              </Card>
            );
          })
        )}

        <SectionTitle title={t('driver.upcomingRides')} action={t('common.seeAll')} onAction={() => navigate('/driver/rides')} />
        {upcoming.length === 0 ? (
          <Card className="col gap-12 center">
            <Route size={28} color="var(--text-3)" />
            <p className="small muted">{t('driver.noRides')}</p>
            <Button onClick={() => navigate('/driver/publish')} disabled={!verified}><Plus size={16} /> {t('driver.publishRide')}</Button>
            {!verified && <span className="tiny muted">{t('driver.verificationNeeded')}</span>}
          </Card>
        ) : (
          upcoming.slice(0, 3).map((r) => <RideCard key={r.id} ride={r} showDriver={false} />)
        )}

        {matchingRequests.length > 0 && (
          <>
            <SectionTitle title={t('req.allRequests')} action={t('common.seeAll')} onAction={() => navigate('/requests')} />
            {matchingRequests.slice(0, 2).map((q) => (
              <Card key={q.id} clickable className="row between" onClick={() => navigate('/requests')}>
                <span className="small bold">
                  {cityName(useStore.getState().cities.find((c) => c.id === q.fromCityId), lang)} → {cityName(useStore.getState().cities.find((c) => c.id === q.toCityId), lang)}
                </span>
                <Badge variant="warning">{t('req.budget', { amount: formatPrice(q.maxBudget, lang) })}</Badge>
              </Card>
            ))}
          </>
        )}

        <Card navy className="col gap-8">
          <span className="row gap-8 bold"><Wallet size={17} /> {t('driver.costSharingTitle')}</span>
          <p className="small" style={{ color: 'rgba(255,255,255,0.82)' }}>{t('driver.costSharingWarning')}</p>
        </Card>
      </div>
    </Screen>
  );
}