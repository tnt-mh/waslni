import { type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Car, Home, MessageCircle, Search, Ticket, User as UserIcon, LayoutDashboard, Route, ChevronLeft, Settings, ShieldCheck } from 'lucide-react';
import { useStore, currentUser, getUnreadMessages, getUnreadNotifications } from '../lib/store';
import { useI18n } from '../i18n';
import { Avatar, Badge, IconButton } from './ui';
import { Logo } from './Logo';

export function ScreenHeader({ title, right, back = true, bordered }: { title?: ReactNode; right?: ReactNode; back?: boolean; bordered?: boolean }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <header className={`screen-header ${bordered ? 'bordered' : ''}`}>
      <div className="side">
        {back && (
          <IconButton label={t('common.back')} onClick={() => navigate(-1)}>
            <ChevronLeft size={22} className="back-chevron" />
          </IconButton>
        )}
      </div>
      <span className="title ellipsis">{title}</span>
      <div className="side end">{right}</div>
    </header>
  );
}

export function AppShell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useStore(currentUser);
  const unreadMsgs = useStore((s) => (user ? getUnreadMessages(s, user.id) : 0));
  const unreadNotifications = useStore((s) => (user ? getUnreadNotifications(s, user.id) : 0));
  if (!user) return null;

  const isDriver = user.mode === 'driver';
  const tabs = isDriver
    ? [
        { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
        { to: '/driver/rides', icon: Route, label: t('nav.myRides') },
        { to: '/reservations', icon: Ticket, label: t('nav.reservations') },
        { to: '/messages', icon: MessageCircle, label: t('nav.messages'), badge: unreadMsgs },
        { to: '/profile', icon: UserIcon, label: t('nav.profile') },
      ]
    : [
        { to: '/', icon: Home, label: t('nav.home') },
        { to: '/search', icon: Search, label: t('nav.search') },
        { to: '/reservations', icon: Ticket, label: t('nav.reservations') },
        { to: '/messages', icon: MessageCircle, label: t('nav.messages'), badge: unreadMsgs },
        { to: '/profile', icon: UserIcon, label: t('nav.profile') },
      ];

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/' || (isDriver && location.pathname === '/driver');
    if (to === '/driver/rides') return location.pathname.startsWith('/driver/ride');
    if (to === '/search') return location.pathname === '/search' || location.pathname.startsWith('/ride/') || location.pathname.startsWith('/book/');
    if (to === '/reservations') return location.pathname.startsWith('/reservation');
    if (to === '/messages') return location.pathname === '/messages' || location.pathname.startsWith('/chat');
    return location.pathname.startsWith(to);
  };

  if (location.pathname.startsWith('/admin')) return <Outlet />;

  const isStaff = user.role === 'admin' || Boolean(user.staffRole);

  return (
    <>
      <aside className="desktop-sidebar">
        <NavLink to="/" className="brand-link" onClick={() => window.scrollTo(0, 0)}><Logo size={34} /></NavLink>
        <nav className="desktop-nav" aria-label={t('nav.home')}>
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className={isActive(tab.to) ? 'active' : ''} onClick={() => window.scrollTo(0, 0)}>
              <tab.icon size={20} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && <span className="nav-badge">{tab.badge > 9 ? '9+' : tab.badge}</span>}
            </NavLink>
          ))}
          {isStaff && <NavLink to="/admin"><ShieldCheck size={20} /><span>{t('nav.admin')}</span></NavLink>}
          <NavLink to="/settings"><Settings size={20} /><span>{t('profile.settings')}</span></NavLink>
        </nav>
        <div className="desktop-user">
          <Avatar user={user} size="sm" />
          <span className="grow col" style={{ gap: 1, minWidth: 0 }}>
            <span className="small bold ellipsis">{user.fullName}</span>
            <span className="tiny muted ellipsis">{user.email ?? user.phone}</span>
          </span>
          {user.isDemo && <Badge variant="demo">{t('app.demoTag')}</Badge>}
        </div>
      </aside>

      <div className="desktop-main">
        <header className="desktop-topbar">
          <div className="row gap-8">
            <span className="mobile-logo"><Logo size={28} /></span>
            <span className="small bold">{isDriver ? t('nav.dashboard') : t('nav.home')}</span>
            {user.isDemo && <Badge variant="demo">{t('app.demoTag')}</Badge>}
          </div>
          <div className="row gap-4">
            {isStaff && <IconButton label={t('nav.admin')} onClick={() => navigate('/admin')}><ShieldCheck size={19} /></IconButton>}
            <NotifBell />
            <Avatar user={user} size="sm" />
          </div>
        </header>
        <main className="app-content"><Outlet /></main>
      </div>

      <nav className="bottom-nav" aria-label="Navigation principale">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={isActive(tab.to) ? 'active' : ''} onClick={() => window.scrollTo(0, 0)}>
            <tab.icon size={21} strokeWidth={isActive(tab.to) ? 2.4 : 2} />
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && <span className="nav-badge">{tab.badge > 9 ? '9+' : tab.badge}</span>}
          </NavLink>
        ))}
      </nav>
      {isDriver && location.pathname === '/' && (
        <button className="fab" aria-label={t('driver.publishRide')} onClick={() => navigate('/driver/publish')}>
          <Car size={24} />
        </button>
      )}
    </>
  );
}

export function NotifBell() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const user = useStore(currentUser);
  const unread = useStore((s) => (user ? getUnreadNotifications(s, user.id) : 0));
  return (
    <IconButton label={t('notif.title')} badge={unread} onClick={() => navigate('/notifications')}>
      <Bell size={20} />
    </IconButton>
  );
}