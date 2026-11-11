import { type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Car, Home, MessageCircle, Search, Ticket, User as UserIcon, LayoutDashboard, Route, ChevronLeft } from 'lucide-react';
import { useStore, currentUser, getUnreadMessages, getUnreadNotifications } from '../lib/store';
import { useI18n } from '../i18n';
import { IconButton } from './ui';

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
    if (to === '/messages') return location.pathname.startsWith('/chat');
    return location.pathname.startsWith(to);
  };

  return (
    <>
      <Outlet />
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