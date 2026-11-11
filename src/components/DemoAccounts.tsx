import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Car, ShieldCheck, UserRound } from 'lucide-react';
import { Sheet } from './feedback';
import { Avatar, Badge } from './ui';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';
import { DEMO_PASSWORD } from '../lib/seed';

export function DemoAccountsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const users = useStore(useShallow((s) => s.users.filter((u) => u.isDemo)));
  const loginDemo = useStore((s) => s.loginDemo);

  const pick = (id: string) => {
    loginDemo(id);
    onClose();
    navigate('/');
    window.scrollTo(0, 0);
  };

  const entries = [
    { id: 'u-amina', label: t('welcome.demoPassenger'), icon: UserRound },
    { id: 'u-karim', label: t('welcome.demoDriver'), icon: Car },
    { id: 'u-admin', label: t('welcome.demoAdmin'), icon: ShieldCheck },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t('welcome.demoAccounts')}>
      <p className="subtitle mb-16">{t('welcome.demoIntro')}</p>
      <div className="col gap-8">
        {entries.map((e) => {
          const user = users.find((u) => u.id === e.id);
          if (!user) return null;
          return (
            <button key={e.id} className="list-row" onClick={() => pick(e.id)}>
              <Avatar user={user} size="sm" />
              <span className="grow col" style={{ gap: 1 }}>
                <span className="small bold">{e.label}</span>
                <span className="tiny muted">{user.email}</span>
              </span>
              <Badge variant="demo">{DEMO_PASSWORD}</Badge>
            </button>
          );
        })}
      </div>
      <div className="divider mt-16 mb-8" />
      <span className="label mb-8">{t('common.all')}</span>
      <div className="col gap-4" style={{ maxHeight: '30dvh', overflowY: 'auto' }}>
        {users.filter((u) => !entries.some((e) => e.id === u.id)).map((u) => (
          <button key={u.id} className="list-row" onClick={() => pick(u.id)}>
            <Avatar user={u} size="sm" />
            <span className="grow small bold">{u.fullName}</span>
            <span className="tiny muted">{u.mode === 'driver' ? t('mode.driver') : t('mode.passenger')}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}