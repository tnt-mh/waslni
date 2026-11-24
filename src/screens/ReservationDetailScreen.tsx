import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate, useParams } from 'react-router-dom';
import { Banknote, CheckCircle2, Flag, KeyRound, MessageCircle, Share2, ShieldCheck, Star, Ticket, XCircle } from 'lucide-react';
import { Screen, EmptyState, ConfirmDialog, useToast, Sheet } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Avatar, Badge, Banner, Button, Card, PinDisplay } from '../components/ui';
import { bookingStatusBadge } from '../components/BookingCard';
import { useStore, currentUser } from '../lib/store';
import { cityName } from '../lib/cities';
import { formatDate, formatPhone, formatPrice, formatTime, haptic } from '../lib/utils';
import { useI18n } from '../i18n';

export function ReservationDetailScreen() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useStore(currentUser);
  const booking = useStore((s) => s.bookings.find((b) => b.id === id));
  const ride = useStore((s) => s.rides.find((r) => r.id === booking?.rideId));
  const driver = useStore((s) => s.users.find((u) => u.id === ride?.driverId));
  const vehicle = useStore((s) => s.vehicles.find((v) => v.id === ride?.vehicleId));
  const myReview = useStore((s) => s.reviews.find((r) => r.bookingId === id && r.authorId === me?.id));
  const contacts = useStore(useShallow((s) => s.trustedContacts.filter((c) => c.userId === me?.id)));
  const confirmPayment = useStore((s) => s.confirmPayment);
  const cancelBooking = useStore((s) => s.cancelBooking);
  const ensureConversation = useStore((s) => s.ensureConversation);
  const from = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.fromCityId), lang));
  const to = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.toCityId), lang));
  const [cancelOpen, setCancelOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  if (!booking || !ride || !me || booking.passengerId !== me.id) {
    return (
      <Screen><ScreenHeader title={t('res.details')} />
        <EmptyState icon={<Ticket size={30} />} title={t('ride.notFound')} action={<Button onClick={() => navigate('/reservations')}>{t('common.back')}</Button>} />
      </Screen>
    );
  }

  const total = ride.pricePerSeat * booking.seats;
  const canCancel = (booking.status === 'pending' || booking.status === 'confirmed') && ride.status === 'published';
  const shareText = t('safety.shareText', {
    driver: driver?.fullName ?? '', vehicle: vehicle ? `${vehicle.brand} ${vehicle.model}` : '', plate: vehicle?.plate ?? '',
    from, to, time: `${formatDate(ride.departureAt, lang)} ${formatTime(ride.departureAt, lang)}`,
  });

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      toast(t('common.copied'), 'success');
    } catch {
      toast(t('common.error'), 'error');
    }
  };
  const nativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Waslni', text: shareText }); } catch { /* cancelled */ }
    } else copyShare();
  };

  const contact = async () => {
    if (!driver) return;
    try {
      const conv = await ensureConversation(driver.id, ride.id, booking.id);
      if (!conv) return toast(t('common.error'), 'error');
      navigate(`/chat/${conv}`);
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('res.details')} right={bookingStatusBadge(booking.status, t)} />
      <div className="screen-body stagger">
        <Card className="col gap-12">
          <div className="row between">
            <span className="bold">{from} → {to}</span>
            <span className="navy-text bold">{formatPrice(total, lang)}</span>
          </div>
          <span className="small muted">{formatDate(ride.departureAt, lang, { weekday: 'long', day: 'numeric', month: 'long' })} · {formatTime(ride.departureAt, lang)} → {formatTime(ride.arrivalAt, lang)}</span>
          <span className="small muted">{ride.pickupPoint} → {ride.dropoffPoint}</span>
          <div className="divider" />
          <button className="row gap-12" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'start' }} onClick={() => driver && navigate(`/user/${driver.id}`)}>
            {driver && <Avatar user={driver} />}
            <span className="col grow" style={{ gap: 2 }}>
              <span className="small bold">{driver?.fullName}</span>
              <span className="tiny muted">{vehicle ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}` : ''}</span>
            </span>
          </button>
        </Card>

        {booking.status === 'confirmed' && booking.pin && (
          <Card soft className="col gap-12 center">
            <span className="row gap-8 bold navy-text"><KeyRound size={16} /> {t('res.pinTitle')}</span>
            <PinDisplay pin={booking.pin} />
            <p className="tiny muted" style={{ maxWidth: 280 }}>{t('res.pinHint')}</p>
          </Card>
        )}
        {booking.status === 'pending' && <Banner kind="warning">{t('res.pinNotYet')}</Banner>}
        {booking.status === 'rejected' && <Banner kind="error">{t('res.status.rejected')}</Banner>}
        {booking.status === 'cancelled' && <Banner kind="info">{t('res.status.cancelled')}</Banner>}

        <div className="row gap-8">
          <Button variant="secondary" block onClick={contact}><MessageCircle size={16} /> {t('res.contactDriver')}</Button>
          <Button variant="outline" block onClick={() => setShareOpen(true)}><Share2 size={16} /> {t('res.shareRide')}</Button>
        </div>

        {booking.status === 'completed' && (
          <Card className="col gap-12">
            <span className="row gap-8 h3"><Banknote size={17} /> {t('res.paymentTitle')}</span>
            <div className="row between">
              <span className="small muted">{t('res.paymentAmount', { amount: formatPrice(total, lang) })}</span>
              {booking.passengerPaid && booking.driverReceived
                ? <Badge variant="success"><CheckCircle2 size={11} /> {t('res.paymentConfirmed')}</Badge>
                : <Badge variant="warning">{t('res.paymentPending')}</Badge>}
            </div>
            {!booking.passengerPaid ? (
              <Button block variant="success" onClick={async () => {
                try {
                  const res = await confirmPayment(booking.id, 'passenger');
                  if (!res.ok) return toast(t(res.error), 'error');
                  haptic();
                  toast(t('common.saved'), 'success');
                } catch {
                  toast(t('common.error'), 'error');
                }
              }}>
                <Banknote size={16} /> {t('res.iPaid')}
              </Button>
            ) : !booking.driverReceived ? (
              <Banner kind="info">{t('res.paymentWaitingDriver')}</Banner>
            ) : null}
            {booking.driverReceived && !booking.passengerPaid && <Banner kind="info">{t('res.paymentDriverDone')}</Banner>}
            <p className="tiny muted-2">{t('res.paymentNotice')}</p>
          </Card>
        )}

        {booking.status === 'completed' && (
          myReview ? (
            <Card className="row gap-8"><Star size={16} color="var(--warning)" fill="var(--warning)" /><span className="small bold">{t('res.reviewDone')}</span></Card>
          ) : (
            <Button block variant="secondary" onClick={() => navigate(`/review/${booking.id}`)}><Star size={16} /> {t('res.leaveReview')}</Button>
          )
        )}

        <Card clickable className="row gap-12" onClick={() => navigate('/safety')}>
          <ShieldCheck size={20} color="var(--navy)" />
          <span className="grow small bold">{t('res.safety')}</span>
        </Card>

        {canCancel && (
          <Button variant="danger-ghost" block onClick={() => setCancelOpen(true)}><XCircle size={16} /> {t('res.cancelBooking')}</Button>
        )}
        <button className="btn ghost sm" style={{ alignSelf: 'center' }} onClick={() => navigate(`/report/user/${ride.driverId}`)}>
          <Flag size={14} /> {t('report.title')}
        </button>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={async () => {
          try {
            const res = await cancelBooking(booking.id);
            if (!res.ok) return toast(t(res.error), 'error');
            toast(t('res.cancelled'), 'success');
          } catch {
            toast(t('common.error'), 'error');
          }
        }}
        title={t('res.cancelBooking')}
        message={t('res.cancelConfirm')}
        danger
      />

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title={t('res.shareRide')}>
        <div className="col gap-16">
          <Banner kind="info">{t('safety.shareNote')}</Banner>
          <Card flat style={{ background: 'var(--bg)', whiteSpace: 'pre-wrap', fontSize: 13 }}>{shareText}</Card>
          <div className="row gap-8">
            <Button block onClick={nativeShare}><Share2 size={16} /> {t('common.share')}</Button>
            <Button block variant="outline" onClick={copyShare}>{t('common.copy')}</Button>
          </div>
          {contacts.length > 0 && (
            <>
              <span className="label">{t('safety.trustedContacts')}</span>
              <div className="col gap-8">
                {contacts.map((c) => (
                  <a key={c.id} className="list-row" href={`tel:${c.phone}`}>
                    <span className="grow small bold">{c.name}</span>
                    <span className="tiny muted">{formatPhone(c.phone, lang)}</span>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </Sheet>
    </Screen>
  );
}