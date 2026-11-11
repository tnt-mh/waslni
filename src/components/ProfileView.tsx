import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Flag, Star } from 'lucide-react';
import { Avatar, Badge, Card, SectionTitle, Stars } from './ui';
import { VerificationBadges } from './VerificationBadges';
import { useStore, getDriverRating, getVerification } from '../lib/store';
import { formatDate, timeAgo } from '../lib/utils';
import { useI18n } from '../i18n';
import type { User } from '../lib/types';

const ATMOSPHERE_KEYS = ['chatty', 'quiet', 'music', 'luggage', 'ac', 'pets'] as const;

export function ProfileView({ user }: { user: User }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const rating = useStore(useShallow((s) => getDriverRating(s, user.id)));
  const verification = useStore((s) => getVerification(s, user.id));
  const rideCount = useStore((s) =>
    s.bookings.filter((b) => b.passengerId === user.id && b.status === 'completed').length +
    s.rides.filter((r) => r.driverId === user.id && r.status === 'completed').length);
  const reviews = useStore(useShallow((s) => s.reviews.filter((r) => r.targetId === user.id && r.status === 'visible').slice(0, 5)));
  const users = useStore((s) => s.users);

  return (
    <>
      <Card className="col center gap-8" >
        <Avatar user={user} size="xl" verified={verification.status === 'verified'} />
        <h1 className="h1">{user.fullName}</h1>
        <span className="tiny muted">{t('profile.memberSince', { date: formatDate(user.createdAt, lang, { month: 'long', year: 'numeric' }) })}</span>
        {user.isDemo ? <Badge variant="demo">{t('profile.demoAccount')}</Badge> : <Badge variant="neutral">{t('profile.realAccount')}</Badge>}
        <div className="row gap-12 mt-8" style={{ width: '100%' }}>
          <Card soft className="grow col center" style={{ padding: 12 }}>
            <span className="h3">{rideCount}</span>
            <span className="tiny muted">{t('profile.rides', { count: rideCount })}</span>
          </Card>
          <Card soft className="grow col center" style={{ padding: 12 }}>
            {rating.count > 0 ? (
              <>
                <span className="row gap-4"><Star size={15} fill="var(--warning)" color="var(--warning)" /><span className="h3">{rating.avg.toFixed(1)}</span></span>
                <span className="tiny muted">{t('profile.rating', { rating: rating.avg.toFixed(1), count: rating.count })}</span>
              </>
            ) : (
              <span className="tiny muted">{t('profile.noRating')}</span>
            )}
          </Card>
        </div>
      </Card>

      <div className="col gap-8">
        <span className="label">{t('profile.verificationBadges')}</span>
        <VerificationBadges user={user} />
        {!user.phoneVerified && <span className="tiny muted">{t('profile.phoneNotVerified')}</span>}
      </div>

      <div className="col gap-8">
        <span className="label">{t('profile.bio')}</span>
        <p className="small" style={{ color: user.bio ? 'var(--text)' : 'var(--text-2)' }}>{user.bio || t('profile.noBio')}</p>
      </div>

      {user.atmosphere.length > 0 && (
        <div className="col gap-8">
          <span className="label">{t('profile.atmosphere')}</span>
          <div className="row wrap gap-8">
            {user.atmosphere.filter((a) => (ATMOSPHERE_KEYS as readonly string[]).includes(a)).map((a) => (
              <Badge key={a} variant="neutral">{t(`ride.pref.${a}`)}</Badge>
            ))}
          </div>
        </div>
      )}

      <SectionTitle title={t('profile.reviews')} />
      {reviews.length === 0 ? (
        <p className="subtitle">{t('ride.noReviews')}</p>
      ) : (
        <div className="col gap-8">
          {reviews.map((r) => {
            const author = users.find((u) => u.id === r.authorId);
            return (
              <Card key={r.id} className="col gap-8">
                <div className="row between">
                  <button type="button" className="row gap-8" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }} onClick={() => author && navigate(`/user/${author.id}`)}>
                    <Avatar user={author} size="sm" />
                    <span className="small bold">{author?.fullName ?? '—'}</span>
                  </button>
                  <span className="row gap-8">
                    <Stars value={r.stars} />
                    <button type="button" className="icon-btn" aria-label={t('review.reportReview')} onClick={() => navigate(`/report/review/${r.id}`)}><Flag size={14} /></button>
                  </span>
                </div>
                {r.text && <p className="small muted">{r.text}</p>}
                <span className="tiny muted-2">{timeAgo(r.createdAt, lang)}</span>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}