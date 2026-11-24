import { useState, type ReactNode } from 'react';
import {
  BarChart3, Building2, Car, ClipboardList, Flag, Gavel, KeyRound, MessageSquareText,
  PanelLeftClose, PanelLeftOpen, RefreshCw, ShieldCheck, Star, Ticket, Users, type LucideIcon,
} from 'lucide-react';
import { useStore, currentUser } from '../lib/store';
import { staffRoleOf } from '../lib/staff';
import { useI18n } from '../i18n';
import { Avatar, Badge, IconButton } from './ui';
import { Logo } from './Logo';
import { NotifBell } from './AppShell';

const ICONS: Record<string, LucideIcon> = {
  dashboard: BarChart3,
  users: Users,
  verifications: ShieldCheck,
  reports: Flag,
  moderation: Gavel,
  appeals: MessageSquareText,
  staff: KeyRound,
  rides: Car,
  reservations: Ticket,
  reviews: Star,
  cities: Building2,
  announcements: ClipboardList,
};

export function AdminShell({ items, active, onChange, children }: {
  items: Array<{ value: string; label: string }>;
  active: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const user = useStore(currentUser)!;
  const refresh = useStore((s) => s.refresh);
  const [collapsed, setCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const role = staffRoleOf(user) ?? 'read_only';

  const reload = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className={`admin-workspace ${collapsed ? 'collapsed' : ''}`}>
      <aside className="admin-sidebar">
        <div className="row between admin-brand">
          <span className="admin-brand-logo"><Logo size={32} /></span>
          <IconButton label={t(collapsed ? 'admin.expand' : 'admin.collapse')} onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </IconButton>
        </div>
        <nav className="admin-nav" aria-label={t('admin.title')}>
          {items.map((item) => {
            const Icon = ICONS[item.value] ?? ClipboardList;
            return (
              <button key={item.value} type="button" className={active === item.value ? 'active' : ''} aria-current={active === item.value ? 'page' : undefined} onClick={() => onChange(item.value)} title={item.label}>
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="admin-sidebar-user">
          <Avatar user={user} size="sm" />
          <span className="grow col" style={{ gap: 1, minWidth: 0 }}>
            <span className="small bold ellipsis">{user.fullName}</span>
            <span className="tiny muted ellipsis">{t(`admin.role.${role}`)}</span>
          </span>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="row gap-12">
            <span className="admin-mobile-brand"><Logo size={28} /></span>
            <div className="col" style={{ gap: 1 }}>
              <h1 className="h2">{items.find((item) => item.value === active)?.label ?? t('admin.title')}</h1>
              <span className="tiny muted">{t('admin.workspaceSubtitle')}</span>
            </div>
          </div>
          <div className="row gap-8">
            <Badge variant="navy">{t(`admin.role.${role}`)}</Badge>
            <IconButton label={t('common.refresh')} onClick={() => void reload()}><RefreshCw size={18} className={refreshing ? 'spin' : ''} /></IconButton>
            <NotifBell />
            <Avatar user={user} size="sm" />
          </div>
        </header>
        <div className="admin-mobile-tabs scroll-x">
          {items.map((item) => (
            <button key={item.value} type="button" className={`chip ${active === item.value ? 'active' : ''}`} onClick={() => onChange(item.value)}>{item.label}</button>
          ))}
        </div>
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
