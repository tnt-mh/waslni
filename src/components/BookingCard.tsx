import { useNavigate } from 'react-router-dom';
import type { Booking } from '../lib/types';
import { useStore } from '../lib/store';
import { cityName } from '../lib/cities';
import { formatDate, formatPrice, formatTime } from '../lib/utils';
import { useI18n } from '../i18n';
import { Avatar, Badge, Card } from './ui';

export function bookingStatusBadge(status: Booking['status'], t: (k: string) => string) {
  const map: Record<Booking['status'], { variant: '' | 'success' | 'warning' | 'error' | 'neutral'; key: string }> = {
    pending: { variant: 'warning', key: 'res.status.pending' },
    confirmed: { variant: 'success', key: 'res.status.confirmed' },
    rejected: { variant: 'error', key: 'res.status.rejected' },
    cancelled: { variant: 'neutral', key: 'res.status.cancelled' },
    completed: { variant: '', key: 'res.status.completed' },
    no_show: { variant: 'error', key: 'res.status.no_show' },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{t(m.key)}</Badge>;
}

export function BookingCard({ booking, asDriver }: { booking: Booking; asDriver?: boolean }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const ride = useStore((s) => s.rides.find((r) => r.id === booking.rideId));
  const other = useStore((s) => {
    if (!ride) return undefined;
    const id = asDriver ? booking.passengerId : ride.driverId;
    return s.users.find((u) => u.id === id);
  });
  const from = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.fromCityId), lang));
  const to = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.toCityId), lang));
  if (!ride) return null;

  return (
    <Card clickable className="col gap-12" onClick={() => navigate(asDriver ? `/driver/ride/${ride.id}` : `/reservation/${booking.id}`)}>
      <div className="row between">
        <span className="small bold">{formatDate(ride.departureAt, lang, { weekday: 'short', day: 'numeric', month: 'short' })} · {formatTime(ride.departureAt, lang)}</span>
        {bookingStatusBadge(booking.status, t)}
      </div>
      <div className="row between gap-8">
        <span className="bold ellipsis">{from} → {to}</span>
        <span className="navy-text bold" style={{ whiteSpace: 'nowrap' }}>{formatPrice(ride.pricePerSeat * booking.seats, lang)}</span>
      </div>
      <div className="row between">
        <div className="row gap-8">
          {other && <Avatar user={other} size="sm" />}
          <span className="small muted ellipsis">{other?.fullName}</span>
        </div>
        <span className="tiny muted">{booking.seats} {t(booking.seats > 1 ? 'common.seats' : 'common.seat')}</span>
      </div>
    </Card>
  );
}