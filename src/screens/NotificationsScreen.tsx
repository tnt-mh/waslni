import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Banknote, Bell, Car, CheckCheck, CheckCircle2, Clock, Megaphone, MessageCircle, ShieldCheck, Star, Ticket, XCircle } from 'lucide-react';
import { Screen, EmptyState } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { IconButton } from '../components/ui';
import { useStore, currentUser } from '../lib/store';
import { timeAgo } from '../lib/utils';
import { useI18n } from '../i18n';
import type { NotificationType } from '../lib/types';

const ICONS: Record<NotificationType, typeof Bell> = {
  booking_request: Ticket,
  booking_accepted: CheckCircle2,
  booking_rejected: XCircle,
  ride_reminder: Clock,
  message: MessageCircle,
  ride_cancelled: XCircle,
  verification_update: ShieldCheck,
  ride_match: Car,
  announcement: Megaphone,
  payment: Banknote,
  review_request: Star,
};

export function NotificationsScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const me = useStore(currentUser)!;
  const notifications = useStore(useShallow((s) => s.notifications.filter((n) => n.userId === me.id)));
  const markNotificationRead = useStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useStore((s) => s.markAllNotificationsRead);

  const sorted = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Screen>
      <ScreenHeader
        title={t('notif.title')}
        right={<IconButton label={t('notif.markAllRead')} onClick={markAllNotificationsRead}><CheckCheck size={19} /></IconButton>}
      />
      <div className="screen-body col gap-8">
        {sorted.length === 0 ? (
          <EmptyState icon={<Bell size={28} />} title={t('notif.empty')} />
        ) : (
          sorted.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            return (
              <button
                key={n.id}
                className="list-row"
                style={!n.read ? { background: 'var(--blue-light)' } : undefined}
                onClick={() => { markNotificationRead(n.id); if (n.route) navigate(n.route); }}
              >
                <span className="row" style={{ color: 'var(--navy)' }}><Icon size={19} /></span>
                <span className="grow col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="row between gap-8">
                    <span className="small bold">{n.title}</span>
                    <span className="tiny muted-2" style={{ whiteSpace: 'nowrap' }}>{timeAgo(n.createdAt, lang)}</span>
                  </span>
                  <span className="tiny muted">{n.body}</span>
                </span>
                {!n.read && <span className="dot" style={{ position: 'static', width: 8, height: 8, borderRadius: '50%', background: 'var(--navy)', flexShrink: 0 }} />}
              </button>
            );
          })
        )}
      </div>
    </Screen>
  );
}