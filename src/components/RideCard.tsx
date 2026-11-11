import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Repeat, Users } from 'lucide-react';
import type { Ride } from '../lib/types';
import { useStore, getDriverRating, getSeatsAvailable, getActiveBooking, currentUser } from '../lib/store';
import { cityName } from '../lib/cities';
import { formatPrice, formatTime } from '../lib/utils';
import { useI18n } from '../i18n';
import { Avatar, Badge, Card, Stars } from './ui';
import { PreferenceIcons } from './PreferenceIcons';
import { VerificationBadges } from './VerificationBadges';

export function RideCard({ ride, showDriver = true, to }: { ride: Ride; showDriver?: boolean; to?: string }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const driver = useStore((s) => s.users.find((u) => u.id === ride.driverId));
  const vehicle = useStore((s) => s.vehicles.find((v) => v.id === ride.vehicleId));
  const rating = useStore(useShallow((s) => getDriverRating(s, ride.driverId)));
  const available = useStore((s) => getSeatsAvailable(s, ride.id));
  const fromName = useStore((s) => cityName(s.cities.find((c) => c.id === ride.fromCityId), lang));
  const toName = useStore((s) => cityName(s.cities.find((c) => c.id === ride.toCityId), lang));
  const me = useStore(currentUser);
  const myBooking = useStore((s) => (me ? getActiveBooking(s, ride.id, me.id) : undefined));

  return (
    <Card clickable className="ride-card" onClick={() => navigate(to ?? `/ride/${ride.id}`)}>
      {showDriver && driver && (
        <div className="row between">
          <div className="row gap-12 grow" style={{ minWidth: 0 }}>
            <Avatar user={driver} verified={driver.phoneVerified} />
            <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
              <span className="row gap-8">
                <span className="small bold ellipsis">{driver.fullName}</span>
                <VerificationBadges user={driver} compact />
              </span>
              <span className="row gap-8 tiny muted">
                {rating.count > 0 ? <Stars value={rating.avg} size={11} showValue /> : <span>{t('profile.noRating')}</span>}
                {vehicle && <span className="ellipsis">· {vehicle.brand} {vehicle.model}</span>}
              </span>
            </div>
          </div>
          {ride.isDemo && <Badge variant="demo">{t('app.demoTag')}</Badge>}
        </div>
      )}
      <div className="ride-route">
        <div className="route-times">
          <span>{formatTime(ride.departureAt, lang)}</span>
          <span className="muted" style={{ fontWeight: 600 }}>{formatTime(ride.arrivalAt, lang)}</span>
        </div>
        <div className="route-line">
          <span className="dot" />
          <span className="line" />
          <span className="dot filled" />
        </div>
        <div className="route-cities">
          <div className="col" style={{ gap: 0 }}>
            <span className="city ellipsis">{fromName}</span>
            <span className="point ellipsis">{ride.pickupPoint}</span>
          </div>
          <div className="col" style={{ gap: 0 }}>
            <span className="city ellipsis">{toName}</span>
            <span className="point ellipsis">{ride.dropoffPoint}</span>
          </div>
        </div>
        <div className="price-tag">
          <span className="ride-price">{formatPrice(ride.pricePerSeat, lang)}</span>
          <span className="tiny muted">{t('common.perSeat')}</span>
        </div>
      </div>
      <div className="row between wrap gap-8">
        <div className="row gap-8 wrap">
          <PreferenceIcons prefs={ride.preferences} />
          {ride.womenOnly && <Badge variant="navy">{t('search.womenOnlyBadge')}</Badge>}
          {ride.recurring && <Badge><Repeat size={10} /> {t('search.recurringBadge')}</Badge>}
          {ride.stops.length > 0 && <Badge variant="neutral">{t('search.stops', { count: ride.stops.length })}</Badge>}
        </div>
        <span className={`row gap-4 tiny bold ${available === 0 ? 'error-text' : 'muted'}`} style={{ margin: 0 }}>
          <Users size={13} />
          {myBooking ? t(myBooking.status === 'pending' ? 'search.requestSent' : 'search.alreadyBooked') : available === 0 ? t('search.full') : t('search.seatsLeft', { count: available })}
        </span>
      </div>
    </Card>
  );
}