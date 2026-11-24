import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Banknote, Car, Flag, KeyRound, MessageCircle, Pencil, Play, Repeat, Star, XCircle } from 'lucide-react';
import { Screen, EmptyState, ConfirmDialog, Sheet, useToast } from '../../components/feedback';
import { ScreenHeader } from '../../components/AppShell';
import { Avatar, Badge, Button, Card, IconButton, PinInput, SectionTitle } from '../../components/ui';
import { useStore, currentUser, getSeatsAvailable, type Result } from '../../lib/store';
import { cityName } from '../../lib/cities';
import { formatDate, formatPrice, formatTime, haptic, timeAgo } from '../../lib/utils';
import { useI18n } from '../../i18n';
import type { Booking, Ride } from '../../lib/types';

function rideStatusBadge(status: Ride['status'], t: (k: string) => string) {
  const map: Record<Ride['status'], { variant: '' | 'success' | 'warning' | 'error' | 'neutral' | 'navy'; key: string }> = {
    published: { variant: 'navy', key: 'ride.published' },
    in_progress: { variant: 'warning', key: 'ride.inProgress' },
    completed: { variant: 'success', key: 'ride.completed' },
    cancelled: { variant: 'error', key: 'ride.cancelled' },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{t(m.key)}</Badge>;
}

export function ManageRideScreen() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useStore(currentUser)!;
  const ride = useStore((s) => s.rides.find((r) => r.id === id && r.driverId === me.id));
  const bookings = useStore(useShallow((s) => s.bookings.filter((b) => b.rideId === id)));
  const users = useStore((s) => s.users);
  const reviews = useStore((s) => s.reviews);
  const vehicle = useStore((s) => s.vehicles.find((v) => v.id === ride?.vehicleId));
  const available = useStore((s) => (ride ? getSeatsAvailable(s, ride.id) : 0));
  const from = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.fromCityId), lang));
  const to = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.toCityId), lang));

  const decideBooking = useStore((s) => s.decideBooking);
  const startRide = useStore((s) => s.startRide);
  const completeRide = useStore((s) => s.completeRide);
  const cancelRide = useStore((s) => s.cancelRide);
  const boardWithPin = useStore((s) => s.boardWithPin);
  const markNoShow = useStore((s) => s.markNoShow);
  const confirmPayment = useStore((s) => s.confirmPayment);
  const ensureConversation = useStore((s) => s.ensureConversation);

  const [pinBooking, setPinBooking] = useState<Booking | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [confirm, setConfirm] = useState<'complete' | 'cancel' | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);

  if (!ride) {
    return (
      <Screen>
        <ScreenHeader title={t('driver.manage')} />
        <div className="screen-body"><EmptyState icon={<Car size={28} />} title={t('ride.notFound')} /></div>
      </Screen>
    );
  }

  const pending = bookings.filter((b) => b.status === 'pending');
  const confirmed = bookings.filter((b) => b.status === 'confirmed');
  const completed = bookings.filter((b) => b.status === 'completed');
  const userOf = (uid: string) => users.find((u) => u.id === uid);

  const act = async (mutation: Result | Promise<Result>, successKey: string) => {
    try {
      const res = await mutation;
      if (!res.ok) return toast(t(res.error), 'error');
      haptic();
      toast(t(successKey), 'success');
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  const contact = async (b: Booking) => {
    try {
      const convId = await ensureConversation(b.passengerId, ride.id, b.id);
      if (!convId) return toast(t('common.error'), 'error');
      navigate(`/chat/${convId}`);
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  const submitPin = async () => {
    if (!pinBooking) return;
    try {
      const res = await boardWithPin(pinBooking.id, pin);
      if (!res.ok) return setPinError(t(res.error));
      haptic();
      toast(t('driver.boarded'), 'success');
      setPinBooking(null);
      setPin('');
      setPinError('');
    } catch {
      setPinError(t('common.error'));
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={t('driver.manage')}
        right={ride.status === 'published' ? (
          <IconButton label={t('driver.editRide')} onClick={() => navigate(`/driver/publish?edit=${ride.id}`)}><Pencil size={18} /></IconButton>
        ) : undefined}
      />
      <div className="screen-body col gap-16">
        <Card className="col gap-12">
          <div className="row between gap-8">
            <span className="bold">{from} → {to}</span>
            {rideStatusBadge(ride.status, t)}
          </div>
          <span className="small muted">{formatDate(ride.departureAt, lang, { weekday: 'long', day: 'numeric', month: 'long' })} · {formatTime(ride.departureAt, lang)} → {formatTime(ride.arrivalAt, lang)}</span>
          <div className="divider" />
          <div className="row between small"><span className="muted">{t('driver.availableSeats')}</span><span className="bold">{available} / {ride.seatsTotal}</span></div>
          <div className="row between small"><span className="muted">{t('ride.pricePerSeat')}</span><span className="navy-text bold">{formatPrice(ride.pricePerSeat, lang)}</span></div>
          {vehicle && <div className="row between small"><span className="muted">{t('ride.vehicle')}</span><span className="bold">{vehicle.brand} {vehicle.model} · {vehicle.plate}</span></div>}
          <div className="row wrap gap-8">
            {ride.recurring && <Badge variant="neutral"><Repeat size={11} /> {t('driver.recurring')}</Badge>}
            {ride.womenOnly && <Badge variant="navy">{t('publish.womenOnly')}</Badge>}
          </div>
        </Card>

        {ride.status === 'published' && (
          <div className="col gap-8">
            <Button block size="lg" onClick={async () => { await act(startRide(ride.id), 'driver.rideStarted'); }}><Play size={18} /> {t('driver.startRide')}</Button>
            <div className="row gap-8">
              <Button block variant="success" onClick={() => setConfirm('complete')}><Flag size={16} /> {t('driver.completeRide')}</Button>
              <Button block variant="danger-ghost" onClick={() => setConfirm('cancel')}>{t('driver.cancelRide')}</Button>
            </div>
          </div>
        )}
        {ride.status === 'in_progress' && (
          <Button block size="lg" variant="success" onClick={() => setConfirm('complete')}><Flag size={18} /> {t('driver.completeRide')}</Button>
        )}

        <SectionTitle title={`${t('driver.bookingRequests')} (${pending.length})`} />
        {pending.length === 0 ? (
          <p className="subtitle">{t('driver.noRequests')}</p>
        ) : (
          <div className="col gap-8">
            {pending.map((b) => {
              const p = userOf(b.passengerId);
              return (
                <Card key={b.id} className="col gap-12">
                  <div className="row gap-12">
                    <Avatar user={p} size="md" />
                    <span className="grow col" style={{ gap: 2 }}>
                      <span className="small bold">{p?.fullName ?? '—'}</span>
                      <span className="tiny muted">{t('res.seatsRequested', { count: b.seats })} · {timeAgo(b.createdAt, lang)}</span>
                    </span>
                    <IconButton label={t('ride.viewProfile')} onClick={() => navigate(`/user/${b.passengerId}`)}><Star size={17} /></IconButton>
                  </div>
                  <div className="row gap-8">
                    <Button block size="sm" variant="success" onClick={async () => { await act(decideBooking(b.id, true), 'driver.accepted'); }}>{t('driver.accept')}</Button>
                    <Button block size="sm" variant="outline" onClick={() => setRejectId(b.id)}>{t('driver.reject')}</Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <SectionTitle title={`${t('driver.passengers')} (${confirmed.length})`} />
        {confirmed.length === 0 ? (
          <p className="subtitle">{t('driver.noPassengers')}</p>
        ) : (
          <div className="col gap-8">
            {confirmed.map((b) => {
              const p = userOf(b.passengerId);
              return (
                <Card key={b.id} className="col gap-12">
                  <div className="row gap-12">
                    <Avatar user={p} size="md" />
                    <span className="grow col" style={{ gap: 2 }}>
                      <span className="small bold">{p?.fullName ?? '—'}</span>
                      <span className="tiny muted">{b.seats} {t('common.seats')} · {formatPrice(ride.pricePerSeat * b.seats, lang)}</span>
                    </span>
                    {b.boardedAt ? <Badge variant="success">{t('driver.onboard')}</Badge> : <Badge variant="warning">{t('res.status.confirmed')}</Badge>}
                  </div>
                  <div className="row gap-8">
                    {!b.boardedAt && (
                      <>
                        <Button block size="sm" onClick={() => { setPinBooking(b); setPin(''); setPinError(''); }}><KeyRound size={15} /> {t('driver.markOnboard')}</Button>
                        <Button size="sm" variant="danger-ghost" onClick={async () => { await act(markNoShow(b.id), 'common.saved'); }} aria-label={t('res.status.no_show')}><XCircle size={16} /></Button>
                      </>
                    )}
                    <Button block size="sm" variant="outline" onClick={async () => { await contact(b); }}><MessageCircle size={15} /> {t('common.send')}</Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {ride.status === 'completed' && completed.length > 0 && (
          <>
            <SectionTitle title={t('res.paymentTitle')} />
            <div className="col gap-8">
              {completed.map((b) => {
                const p = userOf(b.passengerId);
                const myReview = reviews.some((r) => r.bookingId === b.id && r.authorId === me.id);
                return (
                  <Card key={b.id} className="col gap-12">
                    <div className="row gap-12">
                      <Avatar user={p} size="sm" />
                      <span className="grow small bold">{p?.fullName ?? '—'}</span>
                      <span className="navy-text bold">{formatPrice(ride.pricePerSeat * b.seats, lang)}</span>
                    </div>
                    {b.passengerPaid && b.driverReceived ? (
                      <Badge variant="success">{t('res.paymentConfirmed')}</Badge>
                    ) : b.passengerPaid ? (
                      <>
                        <p className="tiny muted">{t('res.paymentPassengerDone')}</p>
                        <Button block size="sm" variant="success" onClick={async () => { await act(confirmPayment(b.id, 'driver'), 'res.paymentConfirmed'); }}><Banknote size={15} /> {t('res.driverReceived')}</Button>
                      </>
                    ) : (
                      <p className="tiny muted">{t('res.paymentPending')}</p>
                    )}
                    {!myReview && (
                      <Button block size="sm" variant="outline" onClick={() => navigate(`/review/${b.id}`)}><Star size={15} /> {t('res.leaveReview')}</Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Sheet open={!!pinBooking} onClose={() => setPinBooking(null)} title={t('driver.enterPin')}>
        <p className="subtitle mb-16">{t('driver.pinHint')}</p>
        <div className="row center mb-16"><PinInput value={pin} onChange={(v) => { setPin(v); setPinError(''); }} /></div>
        {pinError && <p className="error-text center mb-16">{pinError}</p>}
        <Button block size="lg" disabled={pin.length !== 4} onClick={submitPin}>{t('driver.markOnboard')}</Button>
      </Sheet>

      <ConfirmDialog
        open={confirm === 'complete'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { await act(completeRide(ride.id), 'driver.rideCompleted'); }}
        title={t('driver.completeRide')}
        message={t('driver.completeConfirm')}
        confirmLabel={t('driver.completeRide')}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { await act(cancelRide(ride.id), 'driver.rideCancelled'); }}
        title={t('driver.cancelRide')}
        message={t('driver.cancelRideConfirm')}
        confirmLabel={t('driver.cancelRide')}
        danger
      />
      <ConfirmDialog
        open={!!rejectId}
        onClose={() => setRejectId(null)}
        onConfirm={async () => { if (rejectId) await act(decideBooking(rejectId, false), 'driver.rejected'); }}
        title={t('driver.reject')}
        message={t('driver.rejectConfirm')}
        confirmLabel={t('driver.reject')}
        danger
      />
    </Screen>
  );
}