import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Heart, Leaf, MapPin, PiggyBank, Plus, Ticket } from 'lucide-react';
import { Screen } from '../components/feedback';
import { NotifBell } from '../components/AppShell';
import { Logo } from '../components/Logo';
import { SearchForm } from '../components/SearchForm';
import { BookingCard } from '../components/BookingCard';
import { Avatar, Card, SectionTitle } from '../components/ui';
import { useStore, currentUser } from '../lib/store';
import { cityName, POPULAR_ROUTES } from '../lib/cities';
import { estimateSoloCost, formatPrice, haversineKm } from '../lib/utils';
import { useI18n } from '../i18n';
import type { SearchQuery } from '../lib/types';

export function HomeScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const user = useStore(currentUser)!;
  const cities = useStore((s) => s.cities);
  const rides = useStore((s) => s.rides);
  const bookings = useStore((s) => s.bookings);
  const recent = useStore(useShallow((s) => s.recentSearches.filter((r) => r.userId === user.id).slice(0, 4)));
  const saved = useStore(useShallow((s) => s.savedDrivers.filter((d) => d.userId === user.id)));
  const savedUsers = useStore(useShallow((s) => s.users.filter((u) => saved.some((d) => d.driverId === u.id))));
  const addRecentSearch = useStore((s) => s.addRecentSearch);

  const upcoming = useMemo(
    () => bookings
      .filter((b) => b.passengerId === user.id && (b.status === 'confirmed' || b.status === 'pending'))
      .map((b) => ({ b, ride: rides.find((r) => r.id === b.rideId) }))
      .filter((x) => x.ride && x.ride.status === 'published' && new Date(x.ride.departureAt).getTime() > Date.now())
      .sort((a, b) => a.ride!.departureAt.localeCompare(b.ride!.departureAt))
      .slice(0, 2),
    [bookings, rides, user.id],
  );

  const goSearch = (q: SearchQuery) => {
    addRecentSearch(q);
    navigate(`/search?from=${q.fromCityId}&to=${q.toCityId}&date=${q.date}&seats=${q.seats}`);
    window.scrollTo(0, 0);
  };

  const alger = cities.find((c) => c.id === 'w16')!;
  const blida = cities.find((c) => c.id === 'w9')!;
  const savings = estimateSoloCost(haversineKm(alger.lat, alger.lon, blida.lat, blida.lon)) - 200;

  return (
    <Screen>
      <header className="screen-header">
        <Logo size={30} />
        <span className="grow" />
        <NotifBell />
        <button className="icon-btn" onClick={() => navigate('/profile')} aria-label={t('nav.profile')}>
          <Avatar user={user} size="sm" />
        </button>
      </header>
      <div className="screen-body stagger">
        <h1 className="h1">{t('home.greeting', { name: user.fullName.split(' ')[0] })}</h1>
        <SearchForm onSubmit={goSearch} />

        {recent.length > 0 && (
          <>
            <SectionTitle title={t('home.recentSearches')} />
            <div className="scroll-x">
              {recent.map((r) => (
                <button key={r.id} className="chip" onClick={() => goSearch(r)}>
                  <MapPin size={13} />
                  {cityName(cities.find((c) => c.id === r.fromCityId), lang)} → {cityName(cities.find((c) => c.id === r.toCityId), lang)}
                </button>
              ))}
            </div>
          </>
        )}

        <SectionTitle title={t('home.popularDestinations')} />
        <div className="scroll-x">
          {POPULAR_ROUTES.filter(([, to]) => to !== 'w16').map(([fromId, toId]) => {
            const city = cities.find((c) => c.id === toId);
            if (!city) return null;
            const count = rides.filter((r) => r.status === 'published' && r.toCityId === toId && new Date(r.departureAt).getTime() > Date.now()).length;
            return (
              <Card key={toId} clickable className="col gap-4" style={{ minWidth: 132, padding: 14 }} onClick={() => goSearch({ fromCityId: fromId, toCityId: toId, date: new Date().toISOString().slice(0, 10), seats: 1 })}>
                <span className="bold small">{cityName(city, lang)}</span>
                <span className="tiny muted">{count} {t('nav.myRides').toLowerCase()}</span>
                <ArrowRight size={14} color="var(--navy)" />
              </Card>
            );
          })}
        </div>

        <SectionTitle title={t('home.upcomingReservations')} action={t('common.seeAll')} onAction={() => navigate('/reservations')} />
        {upcoming.length === 0 ? (
          <Card flat className="row gap-12" style={{ background: 'transparent', border: '1.5px dashed var(--border)', boxShadow: 'none' }}>
            <Ticket size={20} color="var(--text-3)" />
            <span className="small muted">{t('home.noUpcoming')}</span>
          </Card>
        ) : (
          upcoming.map(({ b }) => <BookingCard key={b.id} booking={b} />)
        )}

        <Card navy className="col gap-8">
          <span className="row gap-8 bold"><PiggyBank size={18} /> {t('home.savingsTitle')}</span>
          <p className="small" style={{ color: 'rgba(255,255,255,0.85)' }}>{t('home.savingsText', { amount: formatPrice(Math.max(0, savings), lang) })}</p>
          <span className="tiny" style={{ color: 'rgba(255,255,255,0.55)' }}>{t('home.savingsNote')}</span>
        </Card>

        {savedUsers.length > 0 && (
          <>
            <SectionTitle title={t('home.favoriteDrivers')} />
            <div className="scroll-x">
              {savedUsers.map((d) => (
                <button key={d.id} className="card col center gap-8" style={{ minWidth: 96, padding: 12, cursor: 'pointer' }} onClick={() => navigate(`/user/${d.id}`)}>
                  <Avatar user={d} />
                  <span className="tiny bold ellipsis" style={{ maxWidth: 80 }}>{d.fullName.split(' ')[0]}</span>
                  <Heart size={12} fill="var(--error)" color="var(--error)" />
                </button>
              ))}
            </div>
          </>
        )}

        <Card clickable className="row gap-12" onClick={() => navigate('/requests')}>
          <span className="empty-icon" style={{ width: 44, height: 44, margin: 0 }}><Plus size={20} /></span>
          <span className="grow col" style={{ gap: 2 }}>
            <span className="small bold">{t('home.publishRequest')}</span>
            <span className="tiny muted">{t('req.subtitle')}</span>
          </span>
          <ArrowRight size={17} color="var(--navy)" />
        </Card>

        <p className="tiny muted-2 center row gap-4" style={{ justifyContent: 'center' }}>
          <Leaf size={12} /> {t('common.demoNotice')}
        </p>
      </div>
    </Screen>
  );
}