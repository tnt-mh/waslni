import { BadgeCheck, Car, IdCard, Phone, ShieldCheck } from 'lucide-react';
import type { User } from '../lib/types';
import { useStore, getVerification } from '../lib/store';
import { useI18n } from '../i18n';
import { Badge } from './ui';

export function VerificationBadges({ user, compact }: { user: User; compact?: boolean }) {
  const { t } = useI18n();
  const verification = useStore((s) => getVerification(s, user.id));
  const verified = verification.status === 'verified';
  const badges: Array<{ on: boolean; icon: typeof Phone; label: string }> = [
    { on: user.phoneVerified, icon: Phone, label: t('verify.badge.phone') },
    { on: verified, icon: IdCard, label: t('verify.badge.identity') },
    { on: verified, icon: BadgeCheck, label: t('verify.badge.license') },
    { on: verified, icon: Car, label: t('verify.badge.vehicle') },
  ];
  const active = badges.filter((b) => b.on);
  if (compact) {
    return (
      <span className="row gap-4">
        {active.map((b, i) => (
          <span key={i} title={b.label} aria-label={b.label} style={{ color: 'var(--success)', display: 'flex' }}>
            <b.icon size={13} />
          </span>
        ))}
      </span>
    );
  }
  return (
    <div className="row wrap gap-8">
      {active.length === 0 && <Badge variant="neutral"><ShieldCheck size={11} /> {t('verify.badge.none')}</Badge>}
      {active.map((b, i) => (
        <Badge key={i} variant="success"><b.icon size={11} /> {b.label}</Badge>
      ))}
    </div>
  );
}