import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, Flag } from 'lucide-react';
import { Screen, EmptyState, ConfirmDialog, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Avatar, Banner, Button, Card, Field, Textarea } from '../components/ui';
import { useStore, currentUser } from '../lib/store';
import { cityName } from '../lib/cities';
import { useI18n } from '../i18n';
import type { ReportReason } from '../lib/types';

const REASONS_BY_TYPE: Record<'user' | 'ride' | 'review', ReportReason[]> = {
  user: ['suspicious_profile', 'behavior', 'harassment', 'fraud', 'no_show'],
  ride: ['wrong_vehicle', 'wrong_driver', 'unsafe_driving', 'behavior', 'fraud', 'no_show'],
  review: ['abusive_review', 'harassment', 'fraud'],
};

export function ReportScreen() {
  const { t, lang } = useI18n();
  const { type, id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useStore(currentUser)!;
  const addReport = useStore((s) => s.addReport);
  const ensureConversation = useStore((s) => s.ensureConversation);
  const blockInConversation = useStore((s) => s.blockInConversation);

  const targetUser = useStore((s) => (type === 'user' ? s.users.find((u) => u.id === id) : undefined));
  const targetRide = useStore((s) => (type === 'ride' ? s.rides.find((r) => r.id === id) : undefined));
  const targetReview = useStore((s) => (type === 'review' ? s.reviews.find((r) => r.id === id) : undefined));
  const cities = useStore((s) => s.cities);

  const validType = type === 'user' || type === 'ride' || type === 'review';
  const reasons = validType ? REASONS_BY_TYPE[type] : [];
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [blockOpen, setBlockOpen] = useState(false);

  if (!validType || (type === 'user' && !targetUser) || (type === 'ride' && !targetRide) || (type === 'review' && !targetReview)) {
    return (
      <Screen>
        <ScreenHeader title={t('report.title')} />
        <div className="screen-body"><EmptyState icon={<Flag size={28} />} title={t('common.error')} /></div>
      </Screen>
    );
  }

  const submit = async () => {
    setError('');
    if (!reason) return setError(t('common.required'));
    try {
      const res = await addReport({ targetType: type, targetId: id!, reason, details: details.trim() });
      if (!res.ok) return setError(t(res.error));
      toast(t('report.submitted'), 'success');
      navigate(-1);
    } catch {
      setError(t('common.error'));
    }
  };

  const block = async () => {
    if (!targetUser) return;
    try {
      const convId = await ensureConversation(targetUser.id);
      if (!convId) return toast(t('common.error'), 'error');
      const res = await blockInConversation(convId, true);
      if (!res.ok) return toast(t(res.error), 'error');
      toast(t('report.blocked'), 'success');
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('report.title')} />
      <div className="screen-body col gap-16">
        <p className="subtitle">{t('report.subtitle')}</p>

        <Card flat className="row gap-12">
          {type === 'user' && targetUser && (
            <>
              <Avatar user={targetUser} size="md" />
              <span className="bold">{targetUser.fullName}</span>
            </>
          )}
          {type === 'ride' && targetRide && (
            <span className="bold">
              {cityName(cities.find((c) => c.id === targetRide.fromCityId), lang)} → {cityName(cities.find((c) => c.id === targetRide.toCityId), lang)}
            </span>
          )}
          {type === 'review' && targetReview && (
            <span className="small muted ellipsis">« {targetReview.text || `${targetReview.stars} / 5`} »</span>
          )}
        </Card>

        <Field label={t('report.reason')} required error={error}>
          <div className="col gap-4">
            {reasons.map((r) => (
              <button
                key={r}
                type="button"
                className={`list-row ${reason === r ? 'selected' : ''}`}
                onClick={() => { setReason(r); setError(''); }}
                aria-pressed={reason === r}
              >
                <span className={`radio-dot ${reason === r ? 'on' : ''}`} aria-hidden />
                <span className="grow small bold">{t(`report.reason.${r}`)}</span>
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('report.details')}>
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('report.detailsPlaceholder')} rows={4} />
        </Field>

        <Button block size="lg" onClick={submit}><Flag size={17} /> {t('report.submit')}</Button>

        {type === 'user' && targetUser && targetUser.id !== me.id && (
          <>
            <Banner kind="info">{t('report.blockConfirm')}</Banner>
            <Button block variant="danger-ghost" onClick={() => setBlockOpen(true)}><Ban size={16} /> {t('report.block')}</Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onConfirm={block}
        title={t('report.block')}
        message={t('report.blockConfirm')}
        confirmLabel={t('report.block')}
        danger
      />
    </Screen>
  );
}