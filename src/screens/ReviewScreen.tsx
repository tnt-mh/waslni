import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import { Screen, EmptyState, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Avatar, Banner, Button, Card, Field, Stars, Textarea } from '../components/ui';
import { useStore, currentUser } from '../lib/store';
import { cityName } from '../lib/cities';
import { useI18n } from '../i18n';
import type { ReviewCategories } from '../lib/types';

const CATEGORY_KEYS: Array<{ key: keyof ReviewCategories; label: string }> = [
  { key: 'driving', label: 'review.driving' },
  { key: 'punctuality', label: 'review.punctuality' },
  { key: 'communication', label: 'review.communication' },
  { key: 'respect', label: 'review.respect' },
  { key: 'vehicle', label: 'review.vehicleCondition' },
];

export function ReviewScreen() {
  const { t, lang } = useI18n();
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useStore(currentUser)!;
  const booking = useStore((s) => s.bookings.find((b) => b.id === bookingId));
  const ride = useStore((s) => s.rides.find((r) => r.id === booking?.rideId));
  const cities = useStore((s) => s.cities);
  const submitReview = useStore((s) => s.submitReview);
  const alreadyReviewed = useStore((s) => s.reviews.some((r) => r.bookingId === bookingId && r.authorId === me.id));

  const isPassenger = booking?.passengerId === me.id;
  const isDriver = ride?.driverId === me.id;
  const targetId = isPassenger ? ride?.driverId : booking?.passengerId;
  const target = useStore((s) => s.users.find((u) => u.id === targetId));

  const [stars, setStars] = useState(0);
  const [categories, setCategories] = useState<ReviewCategories>({ driving: 0, punctuality: 0, communication: 0, respect: 0, vehicle: 0 });
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  if (!booking || !ride || (!isPassenger && !isDriver)) {
    return (
      <Screen>
        <ScreenHeader title={t('review.title')} />
        <div className="screen-body"><EmptyState icon={<Star size={28} />} title={t('common.error')} /></div>
      </Screen>
    );
  }

  if (booking.status !== 'completed') {
    return (
      <Screen>
        <ScreenHeader title={t('review.title')} />
        <div className="screen-body"><Banner kind="warning">{t('review.onlyCompleted')}</Banner></div>
      </Screen>
    );
  }

  if (alreadyReviewed) {
    return (
      <Screen>
        <ScreenHeader title={t('review.title')} />
        <div className="screen-body col gap-16">
          <Banner kind="info">{t('review.alreadyReviewed')}</Banner>
          <Button block variant="outline" onClick={() => navigate(-1)}>{t('common.back')}</Button>
        </div>
      </Screen>
    );
  }

  const submit = async () => {
    setError('');
    if (stars < 1) return setError(t('review.starsRequired'));
    const hasCategories = Object.values(categories).some((v) => v > 0);
    try {
      const res = await submitReview({ bookingId: booking.id, stars, categories: hasCategories ? categories : null, text });
      if (!res.ok) return setError(t(res.error));
      toast(t('review.submitted'), 'success');
      navigate(-1);
    } catch {
      setError(t('common.error'));
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('review.title')} />
      <div className="screen-body col gap-16">
        <p className="subtitle">{t('review.subtitle')}</p>

        <Card flat className="row gap-12">
          <Avatar user={target} size="md" />
          <span className="col" style={{ gap: 2 }}>
            <span className="bold">{target?.fullName ?? '—'}</span>
            <span className="tiny muted">
              {cityName(cities.find((c) => c.id === ride.fromCityId), lang)} → {cityName(cities.find((c) => c.id === ride.toCityId), lang)}
            </span>
          </span>
        </Card>

        <Card className="col center gap-8">
          <span className="label">{t('review.overall')}</span>
          <Stars value={stars} size={32} onChange={(v) => { setStars(v); setError(''); }} />
        </Card>

        <span className="label">{t('review.categories')}</span>
        <Card className="col gap-12">
          {CATEGORY_KEYS.map((c) => (
            <div key={c.key} className="row between">
              <span className="small">{t(c.label)}</span>
              <Stars value={categories[c.key]} onChange={(v) => setCategories((prev) => ({ ...prev, [c.key]: v }))} />
            </div>
          ))}
        </Card>

        <Field label={t('review.text')} error={error}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('review.textPlaceholder')} rows={4} />
        </Field>

        <Button block size="lg" onClick={submit}><Star size={17} /> {t('review.submit')}</Button>
      </div>
    </Screen>
  );
}