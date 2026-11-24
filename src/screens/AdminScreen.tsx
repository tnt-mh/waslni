import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Ban, BarChart3, Building2, Car, CheckCircle2, ChevronRight,
  ClipboardList, Clock3, Eye, FileImage, Flag, Gavel, KeyRound, Megaphone,
  Plus, RotateCcw, ShieldCheck, Star, Ticket, UserCheck, Users, XCircle,
} from 'lucide-react';
import { AdminShell } from '../components/AdminShell';
import { AdminTable, type AdminColumn } from '../components/AdminTable';
import { EmptyState, Sheet, ConfirmDialog, useToast } from '../components/feedback';
import { Avatar, Badge, Banner, Button, Card, Field, Input, Select, Textarea, Toggle } from '../components/ui';
import { useStore, currentUser, type Result } from '../lib/store';
import { cityName } from '../lib/cities';
import { formatDate, formatDateTime, formatPrice, timeAgo } from '../lib/utils';
import { canStaff, staffRoleOf, type StaffPermission } from '../lib/staff';
import { useI18n } from '../i18n';
import type {
  AccountRestriction, Booking, BookingStatus, DocumentKind, ModerationAction,
  ModerationAppeal, Report, RestrictionStatus, Review, Ride, StaffRole, User,
  VerificationStatus,
} from '../lib/types';

type Tab =
  | 'dashboard'
  | 'users'
  | 'verifications'
  | 'reports'
  | 'moderation'
  | 'appeals'
  | 'staff'
  | 'rides'
  | 'reservations'
  | 'reviews'
  | 'cities'
  | 'announcements';

type ActionResult = Result | Promise<Result>;
type ModerationKind = AccountRestriction['kind'];
type AppealDecision = Exclude<ModerationAppeal['status'], 'open'>;

const TABS: Array<{ value: Tab; label: string; permission: StaffPermission }> = [
  { value: 'dashboard', label: 'admin.dashboard', permission: 'view_admin' },
  { value: 'users', label: 'admin.users', permission: 'view_admin' },
  { value: 'verifications', label: 'admin.verifications', permission: 'review_verification' },
  { value: 'reports', label: 'admin.reports', permission: 'manage_reports' },
  { value: 'moderation', label: 'admin.moderation', permission: 'moderate_content' },
  { value: 'appeals', label: 'admin.appeals', permission: 'decide_appeals' },
  { value: 'staff', label: 'admin.staff', permission: 'manage_staff' },
  { value: 'rides', label: 'admin.rides', permission: 'view_admin' },
  { value: 'reservations', label: 'admin.reservations', permission: 'view_admin' },
  { value: 'reviews', label: 'admin.reviews', permission: 'moderate_content' },
  { value: 'cities', label: 'admin.cities', permission: 'manage_cities' },
  { value: 'announcements', label: 'admin.announcements', permission: 'send_announcements' },
];

const DOC_LABELS: Record<DocumentKind, string> = {
  id_card: 'verify.idCard',
  license: 'verify.license',
  registration: 'verify.registration',
  selfie: 'verify.selfie',
};

const BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show'];

function restrictionIsActive(restriction: AccountRestriction): boolean {
  const now = Date.now();
  return restriction.active
    && !restriction.reversedAt
    && new Date(restriction.startsAt).getTime() <= now
    && (!restriction.expiresAt || new Date(restriction.expiresAt).getTime() > now);
}

function verificationBadge(status: VerificationStatus, t: (key: string) => string) {
  const variant = status === 'verified' ? 'success' : status === 'pending' ? 'warning' : status === 'rejected' || status === 'expired' ? 'error' : 'neutral';
  return <Badge variant={variant}>{t(`verify.status.${status}`)}</Badge>;
}

function reportBadge(status: Report['status'], t: (key: string) => string) {
  const variant = status === 'open' ? 'warning' : status === 'resolved' ? 'success' : status === 'in_review' ? 'navy' : 'neutral';
  return <Badge variant={variant}>{t(`admin.status.${status}`)}</Badge>;
}

function restrictionBadge(kind: ModerationKind, t: (key: string) => string) {
  return <Badge variant={kind === 'warning' ? 'warning' : kind === 'ban' ? 'error' : 'navy'}>{t(`admin.moderation.kind.${kind}`)}</Badge>;
}

function userAccountBadge(user: User, restrictions: AccountRestriction[], t: (key: string) => string) {
  const active = restrictions.find((r) => r.userId === user.id && restrictionIsActive(r) && r.kind !== 'warning');
  const state: RestrictionStatus = active
    ? (active.kind === 'ban' ? 'banned' : 'timeout')
    : (user.status === 'suspended' ? 'banned' : user.restrictionStatus ?? 'active');
  if (state === 'active') return <Badge variant="success">{t('admin.accountActive')}</Badge>;
  return <Badge variant="error">{t(state === 'banned' ? 'admin.accountBanned' : 'admin.accountTimeout')}</Badge>;
}

function UserCell({ user, t }: { user: User | undefined; t: (key: string) => string }) {
  if (!user) return <span className="tiny muted">—</span>;
  return (
    <span className="admin-user-cell">
      <Avatar user={user} size="sm" />
      <span className="col" style={{ gap: 1, minWidth: 0 }}>
        <span className="small bold ellipsis">{user.fullName || '—'}</span>
        <span className="tiny muted ellipsis">{user.email ?? user.phone ?? user.id}</span>
      </span>
      {user.isDemo && <Badge variant="demo">{t('app.demoTag')}</Badge>}
    </span>
  );
}

function PanelHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="admin-panel-header">
      <span className="admin-panel-icon">{icon}</span>
      <span className="col grow" style={{ gap: 2 }}>
        <span className="small bold">{title}</span>
        {hint && <span className="tiny muted">{hint}</span>}
      </span>
    </div>
  );
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function AdminScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useStore(currentUser);

  const users = useStore((s) => s.users);
  const verifications = useStore((s) => s.verifications);
  const documents = useStore((s) => s.documents);
  const rides = useStore((s) => s.rides);
  const bookings = useStore((s) => s.bookings);
  const reviews = useStore((s) => s.reviews);
  const reports = useStore((s) => s.reports);
  const cities = useStore((s) => s.cities);
  const announcements = useStore((s) => s.announcements);
  const restrictions = useStore((s) => s.restrictions);
  const moderationActions = useStore((s) => s.moderationActions);
  const appeals = useStore((s) => s.appeals);
  const staffMembers = useStore((s) => s.staffMembers);

  const reviewVerification = useStore((s) => s.reviewVerification);
  const resolveReport = useStore((s) => s.resolveReport);
  const dismissReport = useStore((s) => s.dismissReport);
  const assignReport = useStore((s) => s.assignReport);
  const moderateReview = useStore((s) => s.moderateReview);
  const setStaffRole = useStore((s) => s.setStaffRole);
  const applyModeration = useStore((s) => s.applyModeration);
  const reverseRestriction = useStore((s) => s.reverseRestriction);
  const reviewAppeal = useStore((s) => s.reviewAppeal);
  const getDocumentUrl = useStore((s) => s.getDocumentUrl);
  const addCity = useStore((s) => s.addCity);
  const sendAnnouncement = useStore((s) => s.sendAnnouncement);

  const [tab, setTab] = useState<Tab>('dashboard');
  const [busy, setBusy] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userStatus, setUserStatus] = useState('all');
  const [docsUserId, setDocsUserId] = useState<string | null>(null);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [docLoading, setDocLoading] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('pending');
  const [reportQuery, setReportQuery] = useState('');
  const [reportStatus, setReportStatus] = useState('open');
  const [resolveTarget, setResolveTarget] = useState<Report | null>(null);
  const [reportAction, setReportAction] = useState('');
  const [reportInternalNote, setReportInternalNote] = useState('');
  const [dismissTarget, setDismissTarget] = useState<Report | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [moderationView, setModerationView] = useState<'queue' | 'history'>('queue');
  const [activeOnly, setActiveOnly] = useState(true);
  const [restrictionKind, setRestrictionKind] = useState('all');
  const [moderationTarget, setModerationTarget] = useState<User | null>(null);
  const [moderationKind, setModerationKind] = useState<ModerationKind>('warning');
  const [moderationReason, setModerationReason] = useState('');
  const [moderationPublicMessage, setModerationPublicMessage] = useState('');
  const [moderationInternalNote, setModerationInternalNote] = useState('');
  const [moderationDuration, setModerationDuration] = useState('1440');
  const [confirmModeration, setConfirmModeration] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<AccountRestriction | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversePublicMessage, setReversePublicMessage] = useState('');
  const [reverseInternalNote, setReverseInternalNote] = useState('');
  const [appealStatus, setAppealStatus] = useState('open');
  const [appealTarget, setAppealTarget] = useState<ModerationAppeal | null>(null);
  const [appealDecision, setAppealDecision] = useState<AppealDecision>('under_review');
  const [appealNote, setAppealNote] = useState('');
  const [appealPublicMessage, setAppealPublicMessage] = useState('');
  const [appealInternalNote, setAppealInternalNote] = useState('');
  const [staffQuery, setStaffQuery] = useState('');
  const [staffTarget, setStaffTarget] = useState<User | null>(null);
  const [staffRole, setStaffRoleValue] = useState<StaffRole>('moderator');
  const [staffActive, setStaffActive] = useState(true);
  const [rideQuery, setRideQuery] = useState('');
  const [rideStatus, setRideStatus] = useState('all');
  const [bookingQuery, setBookingQuery] = useState('');
  const [bookingStatus, setBookingStatus] = useState('all');
  const [reviewQuery, setReviewQuery] = useState('');
  const [reviewStatus, setReviewStatus] = useState('all');
  const [reviewTarget, setReviewTarget] = useState<Review | null>(null);
  const [reviewRemove, setReviewRemove] = useState(true);
  const [reviewReason, setReviewReason] = useState('');
  const [cityFr, setCityFr] = useState('');
  const [cityAr, setCityAr] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');

  const perform = async (key: string, action: () => ActionResult, successKey: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(key);
    try {
      const result = await action();
      if (!result.ok) {
        toast(t(result.error), 'error');
        return false;
      }
      toast(t(successKey), 'success');
      return true;
    } catch {
      toast(t('common.error'), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (!me) return null;

  const availableTabs = TABS.filter((item) => canStaff(me, item.permission));
  const activeTab = availableTabs.some((item) => item.value === tab) ? tab : 'dashboard';
  const role = staffRoleOf(me) ?? 'read_only';
  const readOnly = !(['moderate_content', 'manage_reports', 'review_verification', 'manage_staff', 'reverse_restriction', 'decide_appeals', 'manage_cities', 'send_announcements'] as StaffPermission[])
    .some((permission) => canStaff(me, permission));

  const userOf = (id: string | null | undefined) => users.find((u) => u.id === id);
  const cityOf = (id: string) => cities.find((c) => c.id === id);
  const rideLabelOf = (rideId: string) => {
    const ride = rides.find((r) => r.id === rideId);
    if (!ride) return '—';
    return `${cityName(cityOf(ride.fromCityId), lang)} → ${cityName(cityOf(ride.toCityId), lang)}`;
  };
  const reportTarget = (report: Report) => {
    if (report.targetType === 'user') return userOf(report.targetId)?.fullName ?? report.targetId;
    if (report.targetType === 'ride') return rideLabelOf(report.targetId);
    const review = reviews.find((r) => r.id === report.targetId);
    return review ? `« ${review.text || `${review.stars}/5`} »` : report.targetId;
  };
  const closeDocuments = () => {
    setDocsUserId(null);
    setDocUrls({});
    setDocLoading(null);
  };
  const openDocument = async (documentId: string) => {
    if (docUrls[documentId] || docLoading) return;
    setDocLoading(documentId);
    try {
      const result = await getDocumentUrl(documentId, t('admin.docsAccessReason'));
      if (!result.ok || !result.url) {
        toast(t(result.ok ? 'common.error' : result.error), 'error');
        return;
      }
      setDocUrls((urls) => ({ ...urls, [documentId]: result.url! }));
      toast(t('admin.documentAccessLogged'), 'success');
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setDocLoading(null);
    }
  };
  const openModeration = (user: User) => {
    if (!canStaff(me, 'moderate_content') || user.id === me.id) return;
    setModerationTarget(user);
    setModerationKind('warning');
    setModerationReason('');
    setModerationPublicMessage('');
    setModerationInternalNote('');
    setModerationDuration('1440');
  };
  const submitModeration = async () => {
    if (!moderationTarget || !moderationReason.trim()) {
      toast(t('common.required'), 'error');
      return;
    }
    const permission = moderationKind === 'warning' ? 'moderate_content' : 'reverse_restriction';
    if (!canStaff(me, permission)) {
      toast(t('admin.permissionDenied'), 'error');
      return;
    }
    const duration = Number(moderationDuration);
    if (moderationKind === 'timeout' && (!Number.isInteger(duration) || duration < 1 || duration > 525600)) {
      toast(t('common.error'), 'error');
      return;
    }
    const success = await perform('moderation', () => applyModeration({
      userId: moderationTarget.id,
      kind: moderationKind,
      reason: moderationReason.trim(),
      publicMessage: moderationPublicMessage.trim(),
      internalNote: moderationInternalNote.trim(),
      durationMinutes: moderationKind === 'timeout' ? duration : 0,
    }), `admin.${moderationKind}Issued`);
    if (success) {
      setConfirmModeration(false);
      setModerationTarget(null);
      setModerationReason('');
      setModerationPublicMessage('');
      setModerationInternalNote('');
    }
  };

  const stats = useMemo(() => {
    const visible = reviews.filter((r) => r.status === 'visible');
    const cancelled = bookings.filter((b) => b.status === 'cancelled').length;
    const shared = bookings
      .filter((b) => b.status === 'completed')
      .reduce((sum, b) => sum + (rides.find((r) => r.id === b.rideId)?.pricePerSeat ?? 0) * b.seats, 0);
    const weekAgo = Date.now() - 7 * 86400000;
    return {
      users: users.length,
      verifiedDrivers: verifications.filter((v) => v.status === 'verified').length,
      activeRides: rides.filter((r) => r.status === 'published' && new Date(r.departureAt).getTime() > Date.now()).length,
      completedRides: rides.filter((r) => r.status === 'completed').length,
      reservations: bookings.length,
      cancellationRate: bookings.length ? Math.round((cancelled / bookings.length) * 100) : 0,
      avgRating: visible.length ? visible.reduce((sum, r) => sum + r.stars, 0) / visible.length : 0,
      openReports: reports.filter((r) => r.status === 'open' || r.status === 'in_review').length,
      sharedCosts: shared,
      activeRestrictions: restrictions.filter((r) => restrictionIsActive(r) && r.kind !== 'warning').length,
      openAppeals: appeals.filter((a) => a.status === 'open' || a.status === 'under_review').length,
      weeklyActions: moderationActions.filter((a) => new Date(a.createdAt).getTime() >= weekAgo).length,
    };
  }, [users, verifications, rides, bookings, reviews, reports, restrictions, moderationActions, appeals]);

  const activity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return date;
    });
    return days.map((date) => {
      const key = dayKey(date);
      const inDay = (iso: string) => dayKey(new Date(iso)) === key;
      return {
        key,
        label: formatDate(date.toISOString(), lang, { weekday: 'short' }),
        rides: rides.filter((r) => inDay(r.createdAt)).length,
        bookings: bookings.filter((b) => inDay(b.createdAt)).length,
        actions: moderationActions.filter((a) => inDay(a.createdAt)).length,
      };
    });
  }, [rides, bookings, moderationActions, lang]);

  const filteredUsers = users.filter((user) => {
    const query = userQuery.trim().toLowerCase();
    const matchesQuery = !query || user.fullName.toLowerCase().includes(query) || (user.email ?? '').toLowerCase().includes(query) || (user.phone ?? '').includes(query);
    const matchesStatus = userStatus === 'all' || user.status === userStatus || (userStatus === 'active' && user.restrictionStatus === 'timeout' && !restrictions.some((r) => r.userId === user.id && restrictionIsActive(r)));
    return matchesQuery && matchesStatus;
  });
  const filteredVerifications = verifications
    .filter((v) => verificationStatus === 'all' || v.status === verificationStatus)
    .sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
  const filteredReports = reports.filter((report) => {
    const query = reportQuery.trim().toLowerCase();
    const matchesQuery = !query || reportTarget(report).toLowerCase().includes(query) || report.details.toLowerCase().includes(query) || t(`report.reason.${report.reason}`).toLowerCase().includes(query);
    return matchesQuery && (reportStatus === 'all' || report.status === reportStatus);
  });
  const filteredRestrictions = restrictions
    .filter((r) => (restrictionKind === 'all' || r.kind === restrictionKind) && (!activeOnly || restrictionIsActive(r)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sortedActions = [...moderationActions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filteredAppeals = appeals.filter((appeal) => appealStatus === 'all' || appeal.status === appealStatus);
  const staffRows = users;
  const filteredStaff = staffRows.filter((user) => {
    const query = staffQuery.trim().toLowerCase();
    return !query || user.fullName.toLowerCase().includes(query) || (user.email ?? '').toLowerCase().includes(query);
  });
  const filteredRides = rides.filter((ride) => {
    const query = rideQuery.trim().toLowerCase();
    const matchesQuery = !query || rideLabelOf(ride.id).toLowerCase().includes(query) || (userOf(ride.driverId)?.fullName ?? '').toLowerCase().includes(query);
    return matchesQuery && (rideStatus === 'all' || ride.status === rideStatus);
  });
  const filteredBookings = bookings.filter((booking) => {
    const query = bookingQuery.trim().toLowerCase();
    const matchesQuery = !query || rideLabelOf(booking.rideId).toLowerCase().includes(query) || (userOf(booking.passengerId)?.fullName ?? '').toLowerCase().includes(query);
    return matchesQuery && (bookingStatus === 'all' || booking.status === bookingStatus);
  });
  const filteredReviews = reviews.filter((review) => {
    const query = reviewQuery.trim().toLowerCase();
    const matchesQuery = !query || review.text.toLowerCase().includes(query) || (userOf(review.authorId)?.fullName ?? '').toLowerCase().includes(query);
    return matchesQuery && (reviewStatus === 'all' || review.status === reviewStatus);
  });
  const docsUser = userOf(docsUserId);
  const docsVerification = docsUserId ? verifications.find((v) => v.userId === docsUserId) : null;
  const docs = docsUserId ? documents.filter((document) => document.userId === docsUserId) : [];

  const userColumns: AdminColumn<User>[] = [
    { key: 'user', label: t('admin.user'), render: (user) => <UserCell user={user} t={t} /> },
    { key: 'role', label: t('admin.staffRole'), render: (user) => user.staffRole ? <Badge variant="navy">{t(`admin.role.${user.staffRole}`)}</Badge> : <span className="tiny muted">{t('admin.user')}</span> },
    { key: 'status', label: t('common.status'), render: (user) => userAccountBadge(user, restrictions, t) },
    { key: 'joined', label: t('admin.joined'), render: (user) => <span className="tiny muted">{formatDate(user.createdAt, lang)}</span> },
    {
      key: 'actions', label: t('admin.actions'), align: 'end', render: (user) => (
        <div className="admin-row-actions">
          <Button size="sm" variant="outline" onClick={() => navigate(`/user/${user.id}`)}><Eye size={14} /> {t('ride.viewProfile')}</Button>
          {canStaff(me, 'moderate_content') && user.id !== me.id && <Button size="sm" variant="danger-ghost" onClick={() => openModeration(user)}><Gavel size={14} /> {t('admin.moderationAction')}</Button>}
        </div>
      ),
    },
  ];

  const verificationColumns: AdminColumn<(typeof verifications)[number]>[] = [
    { key: 'user', label: t('admin.user'), render: (v) => <UserCell user={userOf(v.userId)} t={t} /> },
    { key: 'status', label: t('common.status'), render: (v) => verificationBadge(v.status, t) },
    { key: 'submitted', label: t('admin.updated'), render: (v) => <span className="tiny muted">{v.submittedAt ? timeAgo(v.submittedAt, lang) : '—'}</span> },
    { key: 'reason', label: t('admin.details'), render: (v) => <span className="tiny muted admin-wrap-cell">{v.reason ?? '—'}</span> },
    {
      key: 'actions', label: t('admin.actions'), align: 'end', render: (v) => (
        <div className="admin-row-actions">
          <Button size="sm" variant="outline" onClick={() => { setDocsUserId(v.userId); setDocUrls({}); }}><FileImage size={14} /> {t('admin.viewDocs')}</Button>
          {v.status === 'pending' && canStaff(me, 'review_verification') && (
            <>
              <Button size="sm" variant="success" loading={busy === `verify-${v.userId}`} onClick={() => void perform(`verify-${v.userId}`, () => reviewVerification(v.userId, true), 'admin.approved')}><CheckCircle2 size={14} /> {t('admin.approve')}</Button>
              <Button size="sm" variant="danger-ghost" onClick={() => { setRejectTarget(v.userId); setRejectReason(''); }}><XCircle size={14} /> {t('admin.reject')}</Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const reportColumns: AdminColumn<Report>[] = [
    { key: 'reason', label: t('admin.details'), render: (r) => <span className="col" style={{ gap: 2, minWidth: 0 }}><span className="small bold">{t(`report.reason.${r.reason}`)}</span><span className="tiny muted admin-wrap-cell">{r.details || reportTarget(r)}</span></span> },
    { key: 'target', label: t('admin.target'), render: (r) => <span className="tiny admin-wrap-cell">{reportTarget(r)}</span> },
    { key: 'status', label: t('common.status'), render: (r) => reportBadge(r.status, t) },
    { key: 'assignee', label: t('admin.assignedTo'), render: (r) => <span className="tiny muted">{r.assignedTo ? userOf(r.assignedTo)?.fullName ?? r.assignedTo : t('admin.unassigned')}</span> },
    { key: 'created', label: t('admin.created'), render: (r) => <span className="tiny muted">{timeAgo(r.createdAt, lang)}</span> },
    {
      key: 'actions', label: t('admin.actions'), align: 'end', render: (r) => (
        <div className="admin-row-actions">
          {canStaff(me, 'manage_reports') && r.status !== 'resolved' && r.status !== 'dismissed' && (
            <>
              {r.assignedTo !== me.id && <Button size="sm" variant="outline" onClick={() => void perform(`assign-${r.id}`, () => assignReport(r.id, me.id), 'admin.reportAssigned')}>{t('admin.assignToMe')}</Button>}
              <Button size="sm" variant="success" onClick={() => { setResolveTarget(r); setReportAction(''); setReportInternalNote(''); }}>{t('admin.resolve')}</Button>
              <Button size="sm" variant="outline" onClick={() => { setDismissTarget(r); setDismissReason(''); }}>{t('admin.dismiss')}</Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const restrictionColumns: AdminColumn<AccountRestriction>[] = [
    { key: 'user', label: t('admin.user'), render: (r) => <UserCell user={userOf(r.userId)} t={t} /> },
    { key: 'kind', label: t('admin.moderationAction'), render: (r) => restrictionBadge(r.kind, t) },
    { key: 'reason', label: t('admin.moderationReason'), render: (r) => <span className="tiny admin-wrap-cell">{r.reason}</span> },
    { key: 'expires', label: t('admin.expires'), render: (r) => <span className="tiny muted">{r.expiresAt ? formatDateTime(r.expiresAt, lang) : t('admin.permanent')}</span> },
    { key: 'created', label: t('admin.created'), render: (r) => <span className="tiny muted">{formatDateTime(r.createdAt, lang)}</span> },
    {
      key: 'actions', label: t('admin.actions'), align: 'end', render: (r) => restrictionIsActive(r) && canStaff(me, 'reverse_restriction') ? (
        <Button size="sm" variant="outline" onClick={() => { setReverseTarget(r); setReverseReason(''); setReversePublicMessage(''); setReverseInternalNote(''); }}><RotateCcw size={14} /> {t('admin.reverse')}</Button>
      ) : r.reversedAt ? <Badge variant="neutral">{t('admin.restrictionReversed')}</Badge> : null,
    },
  ];

  const actionColumns: AdminColumn<ModerationAction>[] = [
    { key: 'action', label: t('admin.moderationAction'), render: (a) => <span className="small bold">{t(`admin.moderation.action.${a.actionType}`)}</span> },
    { key: 'actor', label: t('admin.user'), render: (a) => <span className="tiny muted">{userOf(a.actorId)?.fullName ?? a.actorId}</span> },
    { key: 'subject', label: t('admin.target'), render: (a) => <span className="tiny muted">{a.subjectId ? userOf(a.subjectId)?.fullName ?? a.subjectId : '—'}</span> },
    { key: 'reason', label: t('admin.moderationReason'), render: (a) => <span className="tiny admin-wrap-cell">{a.reason || '—'}</span> },
    { key: 'created', label: t('admin.created'), render: (a) => <span className="tiny muted">{formatDateTime(a.createdAt, lang)}</span> },
    {
      key: 'details', label: t('admin.auditDetails'), align: 'end', render: (a) => (
        <details className="admin-audit-details">
          <summary>{t('common.details')}</summary>
          <div className="admin-audit-popover col gap-6">
            <span><strong>{t('admin.publicMessage')}:</strong> {a.publicMessage || '—'}</span>
            <span><strong>{t('admin.internalNote')}:</strong> {a.internalNote || '—'}</span>
            <span><strong>{t('admin.evidence')}:</strong> {Object.keys(a.metadata ?? {}).length ? JSON.stringify(a.metadata) : '—'}</span>
          </div>
        </details>
      ),
    },
  ];

  const appealColumns: AdminColumn<ModerationAppeal>[] = [
    { key: 'user', label: t('admin.user'), render: (a) => <UserCell user={userOf(a.appellantId)} t={t} /> },
    { key: 'action', label: t('admin.originalAction'), render: (a) => <span className="tiny">{moderationActions.find((action) => action.id === a.actionId) ? t(`admin.moderation.action.${moderationActions.find((action) => action.id === a.actionId)!.actionType}`) : '—'}</span> },
    { key: 'statement', label: t('admin.appealStatement'), render: (a) => <span className="tiny admin-wrap-cell">{a.statement}</span> },
    { key: 'status', label: t('common.status'), render: (a) => <Badge variant={a.status === 'granted' ? 'success' : a.status === 'denied' ? 'error' : a.status === 'under_review' ? 'navy' : 'warning'}>{t(`admin.status.${a.status}`)}</Badge> },
    { key: 'created', label: t('admin.created'), render: (a) => <span className="tiny muted">{timeAgo(a.createdAt, lang)}</span> },
    {
      key: 'actions', label: t('admin.actions'), align: 'end', render: (a) => canStaff(me, 'decide_appeals') ? (
        <Button size="sm" variant="outline" onClick={() => { setAppealTarget(a); setAppealDecision(a.status === 'open' ? 'under_review' : a.status); setAppealNote(''); setAppealPublicMessage(''); setAppealInternalNote(''); }}>{t('admin.reviewAppeal')}</Button>
      ) : null,
    },
  ];

  const staffColumns: AdminColumn<User>[] = [
    { key: 'user', label: t('admin.user'), render: (user) => <UserCell user={user} t={t} /> },
    { key: 'role', label: t('admin.staffRole'), render: (user) => user.staffRole ? <Badge variant="navy">{t(`admin.role.${user.staffRole}`)}</Badge> : <span className="tiny muted">{t('admin.user')}</span> },
    { key: 'active', label: t('admin.staffActive'), render: (user) => <Badge variant={user.status === 'active' && staffMembers.some((m) => m.userId === user.id && m.active) ? 'success' : 'neutral'}>{user.status === 'active' && staffMembers.some((m) => m.userId === user.id && m.active) ? t('admin.activeStaff') : t('admin.inactive')}</Badge> },
    { key: 'updated', label: t('admin.updated'), render: (user) => <span className="tiny muted">{formatDate(staffMembers.find((m) => m.userId === user.id)?.updatedAt ?? user.createdAt, lang)}</span> },
    {
      key: 'actions', label: t('admin.actions'), align: 'end', render: (user) => canStaff(me, 'manage_staff') && user.id !== me.id ? (
        <Button size="sm" variant="outline" onClick={() => { setStaffTarget(user); setStaffRoleValue(user.staffRole ?? 'read_only'); setStaffActive(staffMembers.find((m) => m.userId === user.id)?.active ?? true); }}>{t('admin.changeRole')}</Button>
      ) : null,
    },
  ];

  const rideColumns: AdminColumn<Ride>[] = [
    { key: 'route', label: t('admin.details'), render: (ride) => <button type="button" className="admin-link" onClick={() => navigate(`/ride/${ride.id}`)}>{rideLabelOf(ride.id)} <ChevronRight size={13} /></button> },
    { key: 'driver', label: t('admin.user'), render: (ride) => <span className="tiny muted">{userOf(ride.driverId)?.fullName ?? '—'}</span> },
    { key: 'departure', label: t('ride.departure'), render: (ride) => <span className="tiny muted">{formatDateTime(ride.departureAt, lang)}</span> },
    { key: 'seats', label: t('common.seats'), render: (ride) => <span className="tiny">{ride.seatsTotal}</span> },
    { key: 'price', label: t('ride.price'), render: (ride) => <span className="tiny bold">{formatPrice(ride.pricePerSeat, lang)}</span> },
    { key: 'status', label: t('common.status'), render: (ride) => <Badge variant={ride.status === 'published' ? 'navy' : ride.status === 'completed' ? 'success' : ride.status === 'cancelled' ? 'error' : 'warning'}>{t(`ride.${ride.status === 'in_progress' ? 'inProgress' : ride.status}`)}</Badge> },
  ];

  const bookingColumns: AdminColumn<Booking>[] = [
    { key: 'route', label: t('admin.details'), render: (booking) => <span className="small bold admin-wrap-cell">{rideLabelOf(booking.rideId)}</span> },
    { key: 'passenger', label: t('admin.user'), render: (booking) => <span className="tiny muted">{userOf(booking.passengerId)?.fullName ?? '—'}</span> },
    { key: 'seats', label: t('common.seats'), render: (booking) => <span className="tiny">{booking.seats}</span> },
    { key: 'created', label: t('admin.created'), render: (booking) => <span className="tiny muted">{formatDateTime(booking.createdAt, lang)}</span> },
    { key: 'status', label: t('common.status'), render: (booking) => <Badge variant={booking.status === 'confirmed' || booking.status === 'completed' ? 'success' : booking.status === 'pending' ? 'warning' : booking.status === 'cancelled' ? 'neutral' : 'error'}>{t(`res.status.${booking.status}`)}</Badge> },
  ];

  const reviewColumns: AdminColumn<Review>[] = [
    { key: 'author', label: t('admin.user'), render: (review) => <span className="tiny muted">{userOf(review.authorId)?.fullName ?? '—'} → {userOf(review.targetId)?.fullName ?? '—'}</span> },
    { key: 'rating', label: t('review.rating'), render: (review) => <span className="row gap-4 small bold"><Star size={14} fill="var(--warning)" color="var(--warning)" /> {review.stars}/5</span> },
    { key: 'text', label: t('admin.details'), render: (review) => <span className="tiny admin-wrap-cell">{review.text || '—'}</span> },
    { key: 'status', label: t('common.status'), render: (review) => <Badge variant={review.status === 'visible' ? 'success' : 'error'}>{t(`admin.status.${review.status}`)}</Badge> },
    { key: 'created', label: t('admin.created'), render: (review) => <span className="tiny muted">{formatDate(review.createdAt, lang)}</span> },
    {
      key: 'actions', label: t('admin.actions'), align: 'end', render: (review) => canStaff(me, 'moderate_content') ? (
        <Button size="sm" variant={review.status === 'visible' ? 'danger-ghost' : 'outline'} onClick={() => { setReviewTarget(review); setReviewRemove(review.status === 'visible'); setReviewReason(''); }}>{t(review.status === 'visible' ? 'admin.hideReview' : 'admin.restoreReview')}</Button>
      ) : null,
    },
  ];

  const statCards = [
    { label: 'admin.stats.users', value: stats.users, icon: Users },
    { label: 'admin.stats.verifiedDrivers', value: stats.verifiedDrivers, icon: UserCheck },
    { label: 'admin.stats.activeRides', value: stats.activeRides, icon: Car },
    { label: 'admin.stats.completedRides', value: stats.completedRides, icon: CheckCircle2 },
    { label: 'admin.stats.reservations', value: stats.reservations, icon: Ticket },
    { label: 'admin.stats.cancellationRate', value: `${stats.cancellationRate}%`, icon: XCircle },
    { label: 'admin.stats.avgRating', value: stats.avgRating ? stats.avgRating.toFixed(1) : '—', icon: Star },
    { label: 'admin.stats.openReports', value: stats.openReports, icon: Flag },
    { label: 'admin.stats.sharedCosts', value: formatPrice(stats.sharedCosts, lang), icon: ClipboardList },
    { label: 'admin.stats.activeRestrictions', value: stats.activeRestrictions, icon: Ban },
    { label: 'admin.stats.openAppeals', value: stats.openAppeals, icon: Gavel },
    { label: 'admin.stats.weeklyActions', value: stats.weeklyActions, icon: ShieldCheck },
  ];
  const activityMax = Math.max(1, ...activity.flatMap((day) => [day.rides, day.bookings, day.actions]));

  return (
    <>
      <AdminShell
        items={availableTabs.map((item) => ({ value: item.value, label: t(item.label) }))}
        active={activeTab}
        onChange={(value) => setTab(value as Tab)}
      >
        <div className="admin-content-stack">
          <div className="admin-notice-stack">
            {me.isDemo && <Banner kind="info">{t('admin.demoModerationNote')}</Banner>}
            {readOnly && <Banner kind="info">{t('admin.readOnlyNotice')}</Banner>}
            <Banner kind="warning">{t('admin.backendEnforcedNote')}</Banner>
          </div>

          {activeTab === 'dashboard' && (
            <>
              <div className="admin-stat-grid">
                {statCards.map((stat) => {
                  const Icon = stat.icon;
                  return <div className="admin-stat-card" key={stat.label}><span className="admin-stat-icon"><Icon size={18} /></span><span className="admin-stat-value">{stat.value}</span><span className="admin-stat-label">{t(stat.label)}</span></div>;
                })}
              </div>
              <div className="admin-dashboard-grid">
                <Card className="admin-panel col gap-16">
                  <PanelHeader icon={<BarChart3 size={18} />} title={t('admin.activityLast7Days')} />
                  <div className="admin-chart" role="img" aria-label={t('admin.activityLast7Days')}>
                    {activity.map((day) => (
                      <div className="admin-chart-day" key={day.key}>
                        <div className="admin-chart-bars">
                          <span className="rides" style={{ height: `${Math.max(day.rides ? 4 : 0, day.rides / activityMax * 100)}%` }} title={`${t('admin.rides')}: ${day.rides}`} />
                          <span className="bookings" style={{ height: `${Math.max(day.bookings ? 4 : 0, day.bookings / activityMax * 100)}%` }} title={`${t('admin.reservations')}: ${day.bookings}`} />
                          <span className="actions" style={{ height: `${Math.max(day.actions ? 4 : 0, day.actions / activityMax * 100)}%` }} title={`${t('admin.actionsThisPeriod')}: ${day.actions}`} />
                        </div>
                        <span className="tiny muted-2">{day.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="admin-chart-legend">
                    <span><i className="rides" />{t('admin.rides')}</span>
                    <span><i className="bookings" />{t('admin.reservations')}</span>
                    <span><i className="actions" />{t('admin.actionsThisPeriod')}</span>
                  </div>
                </Card>
                <Card className="admin-panel col gap-12">
                  <PanelHeader icon={<Ticket size={18} />} title={t('admin.bookingBreakdown')} />
                  {BOOKING_STATUSES.map((status) => {
                    const count = bookings.filter((booking) => booking.status === status).length;
                    const percentage = bookings.length ? count / bookings.length * 100 : 0;
                    return (
                      <div className="admin-breakdown-row" key={status}>
                        <div className="row between"><span className="tiny muted">{t(`res.status.${status}`)}</span><span className="tiny bold">{count}</span></div>
                        <div className="admin-progress"><span style={{ width: `${percentage}%` }} /></div>
                      </div>
                    );
                  })}
                </Card>
              </div>
              <Card className="admin-panel col gap-12">
                <PanelHeader icon={<Gavel size={18} />} title={t('admin.recentModeration')} hint={t('admin.historyImmutable')} />
                {sortedActions.length === 0 ? <p className="subtitle">{t('admin.noActivity')}</p> : (
                  <AdminTable rows={sortedActions.slice(0, 5)} columns={actionColumns} rowKey={(action) => action.id} emptyText={t('admin.noActivity')} />
                )}
              </Card>
            </>
          )}

          {activeTab === 'users' && (
            <Card className="admin-panel col gap-16">
              <PanelHeader icon={<Users size={18} />} title={t('admin.users')} />
              <div className="admin-filters">
                <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder={t('admin.searchUsers')} />
                <Select value={userStatus} onChange={(e) => setUserStatus(e.target.value)} aria-label={t('common.status')}>
                  <option value="all">{t('admin.allStatuses')}</option>
                  <option value="active">{t('admin.active')}</option>
                  <option value="suspended">{t('admin.suspended')}</option>
                </Select>
              </div>
              <AdminTable rows={filteredUsers} columns={userColumns} rowKey={(user) => user.id} emptyText={t('admin.noUsers')} resetKey={`${userQuery}-${userStatus}`} />
            </Card>
          )}

          {activeTab === 'verifications' && (
            <Card className="admin-panel col gap-16">
              <PanelHeader icon={<ShieldCheck size={18} />} title={t('admin.verifications')} hint={t('admin.docsPrivate')} />
              <div className="admin-filters">
                <Select value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)} aria-label={t('common.status')}>
                  <option value="all">{t('admin.allStatuses')}</option>
                  <option value="pending">{t('verify.status.pending')}</option>
                  <option value="verified">{t('verify.status.verified')}</option>
                  <option value="rejected">{t('verify.status.rejected')}</option>
                </Select>
              </div>
              <AdminTable rows={filteredVerifications} columns={verificationColumns} rowKey={(v) => v.userId} emptyText={t('admin.noPending')} resetKey={verificationStatus} />
            </Card>
          )}

          {activeTab === 'reports' && (
            <Card className="admin-panel col gap-16">
              <PanelHeader icon={<Flag size={18} />} title={t('admin.reports')} />
              <div className="admin-filters">
                <Input value={reportQuery} onChange={(e) => setReportQuery(e.target.value)} placeholder={t('admin.searchReports')} />
                <Select value={reportStatus} onChange={(e) => setReportStatus(e.target.value)} aria-label={t('common.status')}>
                  <option value="open">{t('admin.status.open')}</option>
                  <option value="in_review">{t('admin.status.in_review')}</option>
                  <option value="resolved">{t('admin.status.resolved')}</option>
                  <option value="dismissed">{t('admin.status.dismissed')}</option>
                  <option value="all">{t('admin.allStatuses')}</option>
                </Select>
              </div>
              <AdminTable rows={filteredReports} columns={reportColumns} rowKey={(report) => report.id} emptyText={t('admin.noReports')} resetKey={`${reportQuery}-${reportStatus}`} />
            </Card>
          )}

          {activeTab === 'moderation' && (
            <>
              <Card className="admin-panel col gap-16">
                <PanelHeader icon={<Gavel size={18} />} title={t('admin.moderationAction')} hint={t('admin.warningHint')} />
                {canStaff(me, 'moderate_content') ? (
                  <div className="admin-inline-form">
                    <Field label={t('admin.user')} required>
                      <Select value={moderationTarget?.id ?? ''} onChange={(e) => { const user = userOf(e.target.value); if (user) openModeration(user); }}>
                        <option value="">{t('admin.selectUser')}</option>
                        {users.filter((user) => user.id !== me.id).map((user) => <option value={user.id} key={user.id}>{user.fullName || user.email || user.phone || user.id}</option>)}
                      </Select>
                    </Field>
                    <Button variant="danger-ghost" disabled={!moderationTarget} onClick={() => moderationTarget && setConfirmModeration(true)}>{t('admin.confirmModeration')}</Button>
                  </div>
                ) : <Banner kind="info">{t('admin.readOnlyNotice')}</Banner>}
                {moderationTarget && (
                  <div className="admin-moderation-form">
                    <div className="admin-filters">
                      <Field label={t('admin.moderationAction')}>
                        <Select value={moderationKind} onChange={(e) => setModerationKind(e.target.value as ModerationKind)}>
                          <option value="warning">{t('admin.moderation.kind.warning')}</option>
                          {canStaff(me, 'reverse_restriction') && <option value="timeout">{t('admin.moderation.kind.timeout')}</option>}
                          {canStaff(me, 'reverse_restriction') && <option value="ban">{t('admin.moderation.kind.ban')}</option>}
                        </Select>
                      </Field>
                      {moderationKind === 'timeout' && <Field label={t('admin.durationMinutes')} required><Input type="number" min={1} max={525600} value={moderationDuration} onChange={(e) => setModerationDuration(e.target.value)} /></Field>}
                    </div>
                    <p className="tiny muted">{t(moderationKind === 'warning' ? 'admin.warningHint' : moderationKind === 'timeout' ? 'admin.timeoutHint' : 'admin.banHint')}</p>
                    <Field label={t('admin.moderationReason')} required><Textarea value={moderationReason} onChange={(e) => setModerationReason(e.target.value)} rows={2} /></Field>
                    <Field label={t('admin.publicMessage')} hint={t('admin.publicMessageHint')}><Input value={moderationPublicMessage} onChange={(e) => setModerationPublicMessage(e.target.value)} /></Field>
                    <Field label={t('admin.internalNote')} hint={t('admin.internalNoteHint')}><Textarea value={moderationInternalNote} onChange={(e) => setModerationInternalNote(e.target.value)} rows={2} /></Field>
                    <div><Button variant="danger" disabled={!moderationReason.trim()} onClick={() => setConfirmModeration(true)}>{t(moderationKind === 'warning' ? 'admin.issueWarning' : moderationKind === 'timeout' ? 'admin.issueTimeout' : 'admin.issueBan')}</Button></div>
                  </div>
                )}
              </Card>
              <Card className="admin-panel col gap-16">
                <div className="row between gap-12 admin-panel-header">
                  <span className="row gap-10"><span className="admin-panel-icon"><Clock3 size={18} /></span><span className="small bold">{t('admin.moderation')}</span></span>
                  <div className="row gap-8">
                    <Button size="sm" variant={moderationView === 'queue' ? 'primary' : 'outline'} onClick={() => setModerationView('queue')}>{t('admin.moderation.queue')}</Button>
                    <Button size="sm" variant={moderationView === 'history' ? 'primary' : 'outline'} onClick={() => setModerationView('history')}>{t('admin.moderation.history')}</Button>
                  </div>
                </div>
                {moderationView === 'queue' ? (
                  <>
                    <div className="admin-filters">
                      <Select value={restrictionKind} onChange={(e) => setRestrictionKind(e.target.value)} aria-label={t('admin.moderationAction')}>
                        <option value="all">{t('admin.allKinds')}</option>
                        <option value="warning">{t('admin.moderation.kind.warning')}</option>
                        <option value="timeout">{t('admin.moderation.kind.timeout')}</option>
                        <option value="ban">{t('admin.moderation.kind.ban')}</option>
                      </Select>
                      <Toggle on={activeOnly} onChange={setActiveOnly} label={t('admin.activeOnly')} />
                    </div>
                    <AdminTable rows={filteredRestrictions} columns={restrictionColumns} rowKey={(r) => r.id} emptyText={t('admin.noRestrictions')} resetKey={`${activeOnly}-${restrictionKind}`} />
                  </>
                ) : (
                  <>
                    <Banner kind="info">{t('admin.historyImmutable')}</Banner>
                    <AdminTable rows={sortedActions} columns={actionColumns} rowKey={(action) => action.id} emptyText={t('admin.noHistory')} />
                  </>
                )}
              </Card>
            </>
          )}

          {activeTab === 'appeals' && (
            <Card className="admin-panel col gap-16">
              <PanelHeader icon={<Gavel size={18} />} title={t('admin.appeals')} />
              <div className="admin-filters">
                <Select value={appealStatus} onChange={(e) => setAppealStatus(e.target.value)} aria-label={t('common.status')}>
                  <option value="open">{t('admin.status.open')}</option>
                  <option value="under_review">{t('admin.status.under_review')}</option>
                  <option value="granted">{t('admin.status.granted')}</option>
                  <option value="denied">{t('admin.status.denied')}</option>
                  <option value="all">{t('admin.allStatuses')}</option>
                </Select>
              </div>
              <AdminTable rows={filteredAppeals} columns={appealColumns} rowKey={(appeal) => appeal.id} emptyText={t('admin.noAppeals')} resetKey={appealStatus} />
            </Card>
          )}

          {activeTab === 'staff' && (
            <Card className="admin-panel col gap-16">
              <PanelHeader icon={<KeyRound size={18} />} title={t('admin.staff')} hint={t('admin.onlySuperAdmin')} />
              <Input value={staffQuery} onChange={(e) => setStaffQuery(e.target.value)} placeholder={t('admin.searchStaff')} />
              <AdminTable rows={filteredStaff} columns={staffColumns} rowKey={(user) => user.id} emptyText={t('admin.noStaff')} resetKey={staffQuery} />
            </Card>
          )}

          {activeTab === 'rides' && (
            <Card className="admin-panel col gap-16">
              <PanelHeader icon={<Car size={18} />} title={t('admin.rides')} />
              <div className="admin-filters">
                <Input value={rideQuery} onChange={(e) => setRideQuery(e.target.value)} placeholder={t('admin.searchRides')} />
                <Select value={rideStatus} onChange={(e) => setRideStatus(e.target.value)} aria-label={t('common.status')}>
                  <option value="all">{t('admin.allStatuses')}</option>
                  <option value="published">{t('ride.published')}</option>
                  <option value="in_progress">{t('ride.inProgress')}</option>
                  <option value="completed">{t('ride.completed')}</option>
                  <option value="cancelled">{t('ride.cancelled')}</option>
                </Select>
              </div>
              <AdminTable rows={filteredRides} columns={rideColumns} rowKey={(ride) => ride.id} emptyText={t('admin.noRides')} resetKey={`${rideQuery}-${rideStatus}`} />
            </Card>
          )}

          {activeTab === 'reservations' && (
            <Card className="admin-panel col gap-16">
              <PanelHeader icon={<Ticket size={18} />} title={t('admin.reservations')} />
              <div className="admin-filters">
                <Input value={bookingQuery} onChange={(e) => setBookingQuery(e.target.value)} placeholder={t('admin.searchReservations')} />
                <Select value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value)} aria-label={t('common.status')}>
                  <option value="all">{t('admin.allStatuses')}</option>
                  {BOOKING_STATUSES.map((status) => <option value={status} key={status}>{t(`res.status.${status}`)}</option>)}
                </Select>
              </div>
              <AdminTable rows={filteredBookings} columns={bookingColumns} rowKey={(booking) => booking.id} emptyText={t('admin.noReservations')} resetKey={`${bookingQuery}-${bookingStatus}`} />
            </Card>
          )}

          {activeTab === 'reviews' && (
            <Card className="admin-panel col gap-16">
              <PanelHeader icon={<Star size={18} />} title={t('admin.reviewModeration')} />
              <div className="admin-filters">
                <Input value={reviewQuery} onChange={(e) => setReviewQuery(e.target.value)} placeholder={t('admin.searchReviews')} />
                <Select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)} aria-label={t('common.status')}>
                  <option value="all">{t('admin.allStatuses')}</option>
                  <option value="visible">{t('admin.status.visible')}</option>
                  <option value="removed">{t('admin.status.removed')}</option>
                </Select>
              </div>
              <AdminTable rows={filteredReviews} columns={reviewColumns} rowKey={(review) => review.id} emptyText={t('admin.noReviews')} resetKey={`${reviewQuery}-${reviewStatus}`} />
            </Card>
          )}

          {activeTab === 'cities' && (
            <>
              <Card className="admin-panel col gap-12">
                <PanelHeader icon={<Building2 size={18} />} title={t('admin.addCity')} />
                <div className="admin-form-grid">
                  <Field label={t('admin.cityNameFr')} required><Input value={cityFr} onChange={(e) => setCityFr(e.target.value)} /></Field>
                  <Field label={t('admin.cityNameAr')} required><Input value={cityAr} onChange={(e) => setCityAr(e.target.value)} dir="rtl" /></Field>
                  <Field label={t('admin.cityCode')} required><Input type="number" min={1} max={99} value={cityCode} onChange={(e) => setCityCode(e.target.value)} /></Field>
                </div>
                <div><Button loading={busy === 'city'} disabled={!cityFr.trim() || !cityAr.trim() || !cityCode} onClick={() => void perform('city', () => addCity({ code: Number(cityCode), nameFr: cityFr.trim(), nameAr: cityAr.trim(), lat: 0, lon: 0, popular: false }), 'admin.cityAdded').then((success) => { if (success) { setCityFr(''); setCityAr(''); setCityCode(''); } })}>{t('common.save')}</Button></div>
              </Card>
              <Card className="admin-panel col gap-12">
                <PanelHeader icon={<Building2 size={18} />} title={`${t('admin.cities')} · ${cities.length}`} />
                <div className="admin-city-grid">
                  {[...cities].sort((a, b) => a.code - b.code).map((city) => (
                    <div className="admin-city-row" key={city.id}><span className="tiny muted-2">{String(city.code).padStart(2, '0')}</span><span className="small bold grow">{city.nameFr}</span><span className="tiny muted" dir="rtl">{city.nameAr}</span></div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {activeTab === 'announcements' && (
            <>
              <Card className="admin-panel col gap-12">
                <PanelHeader icon={<Megaphone size={18} />} title={t('admin.sendAnnouncement')} />
                <Field label={t('admin.announcementTitle')} required><Input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} /></Field>
                <Field label={t('admin.announcementBody')} required><Textarea value={annBody} onChange={(e) => setAnnBody(e.target.value)} rows={4} /></Field>
                <div><Button loading={busy === 'announcement'} disabled={!annTitle.trim() || !annBody.trim()} onClick={() => void perform('announcement', () => sendAnnouncement(annTitle.trim(), annBody.trim()), 'admin.announcementSent').then((success) => { if (success) { setAnnTitle(''); setAnnBody(''); } })}><Megaphone size={16} /> {t('admin.sendAnnouncement')}</Button></div>
              </Card>
              <Card className="admin-panel col gap-12">
                <PanelHeader icon={<ClipboardList size={18} />} title={t('admin.announcements')} />
                {announcements.length === 0 ? <p className="subtitle">{t('admin.noAnnouncements')}</p> : announcements.map((announcement) => (
                  <div className="admin-announcement" key={announcement.id}><span className="small bold">{announcement.title}</span><p className="small muted admin-wrap-cell">{announcement.body}</p><span className="tiny muted-2">{timeAgo(announcement.createdAt, lang)}</span></div>
                ))}
              </Card>
            </>
          )}
        </div>
      </AdminShell>

      <Sheet open={!!docsUserId} onClose={closeDocuments} title={docsUser ? `${t('admin.viewDocs')} — ${docsUser.fullName}` : t('admin.viewDocs')}>
        <div className="col gap-12">
          <Banner kind="warning">{t('admin.docsPrivate')}</Banner>
          <p className="tiny muted">{t('admin.signedUrlHint')}</p>
          {docsVerification && verificationBadge(docsVerification.status, t)}
          {(['id_card', 'license', 'registration', 'selfie'] as DocumentKind[]).map((kind) => {
            const document = docs.find((d) => d.kind === kind);
            return (
              <div key={kind} className="col gap-6">
                <span className="label">{t(DOC_LABELS[kind])}</span>
                {!document ? <p className="tiny muted">{t('admin.noDocument')}</p> : docUrls[document.id] ? (
                  <img className="doc-thumb" src={docUrls[document.id]} alt={t(DOC_LABELS[kind])} />
                ) : (
                  <Button variant="outline" loading={docLoading === document.id} onClick={() => void openDocument(document.id)}><FileImage size={15} /> {t('admin.loadDocument')}</Button>
                )}
              </div>
            );
          })}
          {docsVerification?.status === 'pending' && docsUserId && canStaff(me, 'review_verification') && (
            <div className="row gap-8">
              <Button block variant="success" onClick={() => void perform(`verify-${docsUserId}`, () => reviewVerification(docsUserId, true), 'admin.approved')}>{t('admin.approve')}</Button>
              <Button block variant="danger-ghost" onClick={() => { setRejectTarget(docsUserId); setRejectReason(''); closeDocuments(); }}>{t('admin.reject')}</Button>
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={!!rejectTarget} onClose={() => setRejectTarget(null)} title={t('admin.rejectReason')}>
        <div className="col gap-12">
          <Field label={t('admin.rejectReason')} required><Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={t('admin.rejectReasonPlaceholder')} rows={3} /></Field>
          <Button block variant="danger" loading={!!rejectTarget && busy === `reject-${rejectTarget}`} disabled={!rejectReason.trim()} onClick={() => { const userId = rejectTarget; if (!userId) return; void perform(`reject-${userId}`, () => reviewVerification(userId, false, rejectReason.trim()), 'admin.rejected').then((success) => { if (success) { setRejectTarget(null); setRejectReason(''); } }); }}>{t('admin.reject')}</Button>
        </div>
      </Sheet>

      <Sheet open={!!resolveTarget} onClose={() => setResolveTarget(null)} title={t('admin.resolve')}>
        <div className="col gap-12">
          {resolveTarget && <Banner kind="info">{reportTarget(resolveTarget)}</Banner>}
          <Field label={t('admin.actionTaken')} required><Textarea value={reportAction} onChange={(e) => setReportAction(e.target.value)} rows={3} /></Field>
          <Field label={t('admin.internalNote')} hint={t('admin.internalNoteHint')}><Textarea value={reportInternalNote} onChange={(e) => setReportInternalNote(e.target.value)} rows={2} /></Field>
          <Button block variant="success" disabled={!reportAction.trim()} onClick={() => { const report = resolveTarget; if (!report) return; void perform(`resolve-${report.id}`, () => resolveReport(report.id, reportAction.trim(), reportInternalNote.trim()), 'admin.resolved').then((success) => { if (success) setResolveTarget(null); }); }}>{t('admin.resolve')}</Button>
        </div>
      </Sheet>

      <Sheet open={!!dismissTarget} onClose={() => setDismissTarget(null)} title={t('admin.dismiss')}>
        <div className="col gap-12">
          <Field label={t('admin.dismissReason')} required><Textarea value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} rows={3} /></Field>
          <Button block variant="outline" disabled={!dismissReason.trim()} onClick={() => { const report = dismissTarget; if (!report) return; void perform(`dismiss-${report.id}`, () => dismissReport(report.id, dismissReason.trim()), 'admin.dismissed').then((success) => { if (success) setDismissTarget(null); }); }}>{t('admin.dismiss')}</Button>
        </div>
      </Sheet>

      <Sheet open={!!moderationTarget} onClose={() => setModerationTarget(null)} title={moderationTarget ? `${t('admin.moderationAction')} — ${moderationTarget.fullName}` : t('admin.moderationAction')}>
        {moderationTarget && (
          <div className="admin-moderation-form col gap-12">
            <Field label={t('admin.moderationAction')}>
              <Select value={moderationKind} onChange={(e) => setModerationKind(e.target.value as ModerationKind)}>
                <option value="warning">{t('admin.moderation.kind.warning')}</option>
                {canStaff(me, 'reverse_restriction') && <option value="timeout">{t('admin.moderation.kind.timeout')}</option>}
                {canStaff(me, 'reverse_restriction') && <option value="ban">{t('admin.moderation.kind.ban')}</option>}
              </Select>
            </Field>
            {moderationKind === 'timeout' && <Field label={t('admin.durationMinutes')} required><Input type="number" min={1} max={525600} value={moderationDuration} onChange={(e) => setModerationDuration(e.target.value)} /></Field>}
            <Banner kind={moderationKind === 'warning' ? 'info' : 'warning'}>{t(moderationKind === 'warning' ? 'admin.warningHint' : moderationKind === 'timeout' ? 'admin.timeoutHint' : 'admin.banHint')}</Banner>
            <Field label={t('admin.moderationReason')} required><Textarea value={moderationReason} onChange={(e) => setModerationReason(e.target.value)} rows={3} /></Field>
            <Field label={t('admin.publicMessage')} hint={t('admin.publicMessageHint')}><Textarea value={moderationPublicMessage} onChange={(e) => setModerationPublicMessage(e.target.value)} rows={2} /></Field>
            <Field label={t('admin.internalNote')} hint={t('admin.internalNoteHint')}><Textarea value={moderationInternalNote} onChange={(e) => setModerationInternalNote(e.target.value)} rows={2} /></Field>
            <Button block variant="danger" disabled={!moderationReason.trim()} onClick={() => setConfirmModeration(true)}>{t('admin.confirmModeration')}</Button>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmModeration}
        onClose={() => setConfirmModeration(false)}
        onConfirm={() => void submitModeration()}
        title={t('admin.confirmModeration')}
        message={moderationTarget ? t('admin.moderationConfirm', { kind: t(`admin.moderation.kind.${moderationKind}`), name: moderationTarget.fullName }) : undefined}
        confirmLabel={t('admin.confirmModeration')}
        danger={moderationKind !== 'warning'}
      />

      <Sheet open={!!reverseTarget} onClose={() => setReverseTarget(null)} title={t('admin.reverse')}>
        {reverseTarget && (
          <div className="col gap-12">
            <Banner kind="warning">{t('admin.moderationConfirm', { kind: t(`admin.moderation.kind.${reverseTarget.kind}`), name: userOf(reverseTarget.userId)?.fullName ?? '—' })}</Banner>
            <Field label={t('admin.moderationReason')} required><Textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} rows={3} /></Field>
            <Field label={t('admin.publicMessage')}><Textarea value={reversePublicMessage} onChange={(e) => setReversePublicMessage(e.target.value)} rows={2} /></Field>
            <Field label={t('admin.internalNote')} hint={t('admin.internalNoteHint')}><Textarea value={reverseInternalNote} onChange={(e) => setReverseInternalNote(e.target.value)} rows={2} /></Field>
            <Button block disabled={!reverseReason.trim()} onClick={() => { const restriction = reverseTarget; void perform(`reverse-${restriction.id}`, () => reverseRestriction(restriction.id, reverseReason.trim(), reversePublicMessage.trim(), reverseInternalNote.trim()), 'admin.restrictionReversed').then((success) => { if (success) setReverseTarget(null); }); }}><RotateCcw size={16} /> {t('admin.reverse')}</Button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!appealTarget} onClose={() => setAppealTarget(null)} title={t('admin.reviewAppeal')}>
        {appealTarget && (
          <div className="col gap-12">
            <UserCell user={userOf(appealTarget.appellantId)} t={t} />
            <p className="small admin-wrap-cell">{appealTarget.statement}</p>
            <Field label={t('admin.decision')} required>
              <Select value={appealDecision} onChange={(e) => setAppealDecision(e.target.value as AppealDecision)}>
                <option value="under_review">{t('admin.status.under_review')}</option>
                <option value="granted">{t('admin.status.granted')}</option>
                <option value="denied">{t('admin.status.denied')}</option>
              </Select>
            </Field>
            <Field label={t('admin.decisionNote')} required={appealDecision !== 'under_review'}><Textarea value={appealNote} onChange={(e) => setAppealNote(e.target.value)} rows={3} /></Field>
            <Field label={t('admin.publicResponse')}><Textarea value={appealPublicMessage} onChange={(e) => setAppealPublicMessage(e.target.value)} rows={2} /></Field>
            <Field label={t('admin.internalDecisionNote')} hint={t('admin.internalNoteHint')}><Textarea value={appealInternalNote} onChange={(e) => setAppealInternalNote(e.target.value)} rows={2} /></Field>
            <Button block variant={appealDecision === 'denied' ? 'danger' : 'success'} disabled={appealDecision !== 'under_review' && !appealNote.trim()} onClick={() => { const appeal = appealTarget; void perform(`appeal-${appeal.id}`, () => reviewAppeal(appeal.id, appealDecision, appealNote.trim(), appealPublicMessage.trim(), appealInternalNote.trim()), 'admin.appealUpdated').then((success) => { if (success) setAppealTarget(null); }); }}>{t(appealDecision === 'granted' ? 'admin.grantAppeal' : appealDecision === 'denied' ? 'admin.denyAppeal' : 'admin.underReview')}</Button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!staffTarget} onClose={() => setStaffTarget(null)} title={t('admin.changeRole')}>
        {staffTarget && (
          <div className="col gap-12">
            <UserCell user={staffTarget} t={t} />
            <Field label={t('admin.staffRole')} required>
              <Select value={staffRole} onChange={(e) => setStaffRoleValue(e.target.value as StaffRole)}>
                <option value="super_admin">{t('admin.role.super_admin')}</option>
                <option value="admin">{t('admin.role.admin')}</option>
                <option value="moderator">{t('admin.role.moderator')}</option>
                <option value="read_only">{t('admin.role.read_only')}</option>
              </Select>
            </Field>
            <Toggle on={staffActive} onChange={setStaffActive} label={t('admin.staffActive')} />
            <Button block loading={busy === `staff-${staffTarget.id}`} onClick={() => { const user = staffTarget; void perform(`staff-${user.id}`, () => setStaffRole(user.id, staffRole, staffActive), 'admin.staffUpdated').then((success) => { if (success) setStaffTarget(null); }); }}>{t('common.save')}</Button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!reviewTarget} onClose={() => setReviewTarget(null)} title={t(reviewRemove ? 'admin.hideReview' : 'admin.restoreReview')}>
        {reviewTarget && (
          <div className="col gap-12">
            <p className="small">{reviewTarget.text || `${reviewTarget.stars}/5`}</p>
            <Field label={t('admin.reviewReason')} required={reviewRemove}><Textarea value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} rows={3} /></Field>
            <Button block variant={reviewRemove ? 'danger' : 'success'} disabled={reviewRemove && !reviewReason.trim()} onClick={() => { const review = reviewTarget; void perform(`review-${review.id}`, () => moderateReview(review.id, reviewRemove, reviewReason.trim()), 'admin.reviewUpdated').then((success) => { if (success) setReviewTarget(null); }); }}>{t(reviewRemove ? 'admin.hideReview' : 'admin.restoreReview')}</Button>
          </div>
        )}
      </Sheet>

      {!availableTabs.length && (
        <EmptyState icon={<ShieldCheck size={28} />} title={t('admin.roleGuard')} />
      )}
    </>
  );
}
