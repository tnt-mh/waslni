import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CheckCircle2, Eye, FileImage, Flag, Megaphone, Plus, ShieldCheck, Star, XCircle } from 'lucide-react';
import { Screen, EmptyState, Sheet, ConfirmDialog, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Avatar, Badge, Banner, Button, Card, Field, Input, Textarea } from '../components/ui';
import { useStore, currentUser } from '../lib/store';
import { cityName } from '../lib/cities';
import { formatDate, formatPrice, timeAgo } from '../lib/utils';
import { useI18n } from '../i18n';
import type { DocumentKind, Report, VerificationStatus } from '../lib/types';

type Tab = 'dashboard' | 'users' | 'verifications' | 'reports' | 'rides' | 'reservations' | 'reviews' | 'cities' | 'announcements';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'dashboard', label: 'admin.dashboard' },
  { value: 'users', label: 'admin.users' },
  { value: 'verifications', label: 'admin.verifications' },
  { value: 'reports', label: 'admin.reports' },
  { value: 'rides', label: 'admin.rides' },
  { value: 'reservations', label: 'admin.reservations' },
  { value: 'reviews', label: 'admin.reviews' },
  { value: 'cities', label: 'admin.cities' },
  { value: 'announcements', label: 'admin.announcements' },
];

const DOC_LABELS: Record<DocumentKind, string> = {
  id_card: 'verify.idCard',
  license: 'verify.license',
  registration: 'verify.registration',
  selfie: 'verify.selfie',
};

function statusBadge(status: VerificationStatus, t: (k: string) => string) {
  const variant = status === 'verified' ? 'success' : status === 'pending' ? 'warning' : status === 'rejected' ? 'error' : 'neutral';
  return <Badge variant={variant}>{t(`verify.status.${status}`)}</Badge>;
}

export function AdminScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useStore(currentUser)!;

  const users = useStore((s) => s.users);
  const verifications = useStore((s) => s.verifications);
  const documents = useStore((s) => s.documents);
  const rides = useStore((s) => s.rides);
  const bookings = useStore((s) => s.bookings);
  const reviews = useStore((s) => s.reviews);
  const reports = useStore((s) => s.reports);
  const cities = useStore((s) => s.cities);
  const announcements = useStore((s) => s.announcements);

  const reviewVerification = useStore((s) => s.reviewVerification);
  const suspendUser = useStore((s) => s.suspendUser);
  const resolveReport = useStore((s) => s.resolveReport);
  const dismissReport = useStore((s) => s.dismissReport);
  const moderateReview = useStore((s) => s.moderateReview);
  const addCity = useStore((s) => s.addCity);
  const sendAnnouncement = useStore((s) => s.sendAnnouncement);

  const [tab, setTab] = useState<Tab>('dashboard');
  const [userQuery, setUserQuery] = useState('');
  const [docsUserId, setDocsUserId] = useState<string | null>(null);
  const [rejectUserId, setRejectUserId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [suspendTarget, setSuspendTarget] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Report | null>(null);
  const [actionText, setActionText] = useState('');
  const [cityFr, setCityFr] = useState('');
  const [cityAr, setCityAr] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');

  const stats = useMemo(() => {
    const visible = reviews.filter((r) => r.status === 'visible');
    const cancelled = bookings.filter((b) => b.status === 'cancelled').length;
    const shared = bookings
      .filter((b) => b.status === 'completed')
      .reduce((sum, b) => sum + (rides.find((r) => r.id === b.rideId)?.pricePerSeat ?? 0) * b.seats, 0);
    return {
      users: users.length,
      verifiedDrivers: verifications.filter((v) => v.status === 'verified').length,
      activeRides: rides.filter((r) => r.status === 'published' && new Date(r.departureAt).getTime() > Date.now()).length,
      completedRides: rides.filter((r) => r.status === 'completed').length,
      reservations: bookings.length,
      cancellationRate: bookings.length ? Math.round((cancelled / bookings.length) * 100) : 0,
      avgRating: visible.length ? visible.reduce((s, r) => s + r.stars, 0) / visible.length : 0,
      openReports: reports.filter((r) => r.status === 'open').length,
      sharedCosts: shared,
    };
  }, [users, verifications, rides, bookings, reviews, reports]);

  if (me.role !== 'admin') {
    return (
      <Screen>
        <ScreenHeader title={t('admin.title')} />
        <div className="screen-body"><EmptyState icon={<ShieldCheck size={28} />} title={t('admin.roleGuard')} /></div>
      </Screen>
    );
  }

  const userOf = (id: string) => users.find((u) => u.id === id);
  const rideLabelOf = (rideId: string) => {
    const r = rides.find((x) => x.id === rideId);
    if (!r) return '—';
    return `${cityName(cities.find((c) => c.id === r.fromCityId), lang)} → ${cityName(cities.find((c) => c.id === r.toCityId), lang)}`;
  };
  const reportTarget = (r: Report) => {
    if (r.targetType === 'user') return userOf(r.targetId)?.fullName ?? r.targetId;
    if (r.targetType === 'ride') return rideLabelOf(r.targetId);
    const rv = reviews.find((x) => x.id === r.targetId);
    return rv ? `« ${rv.text || `${rv.stars}/5`} »` : r.targetId;
  };

  const filteredUsers = users.filter((u) => u.fullName.toLowerCase().includes(userQuery.trim().toLowerCase()) || (u.email ?? '').includes(userQuery.trim()));
  const sortedVerifs = [...verifications].sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1));
  const docsUser = docsUserId ? userOf(docsUserId) : null;
  const docsVerification = docsUserId ? verifications.find((v) => v.userId === docsUserId) : null;

  const approve = (userId: string) => {
    reviewVerification(userId, true);
    toast(t('admin.approved'), 'success');
  };
  const reject = () => {
    if (!rejectUserId || !rejectReason.trim()) return;
    reviewVerification(rejectUserId, false, rejectReason.trim());
    toast(t('admin.rejected'), 'success');
    setRejectUserId(null);
    setRejectReason('');
  };

  const saveCity = () => {
    const code = Number(cityCode);
    if (!cityFr.trim() || !cityAr.trim() || !Number.isFinite(code)) return toast(t('common.required'), 'error');
    const res = addCity({ code, nameFr: cityFr.trim(), nameAr: cityAr.trim(), lat: 0, lon: 0, popular: false });
    if (!res.ok) return toast(t(res.error), 'error');
    toast(t('admin.cityAdded'), 'success');
    setCityFr(''); setCityAr(''); setCityCode('');
  };

  const sendAnn = () => {
    const res = sendAnnouncement(annTitle, annBody);
    if (!res.ok) return toast(t(res.error), 'error');
    toast(t('admin.announcementSent'), 'success');
    setAnnTitle(''); setAnnBody('');
  };

  return (
    <Screen>
      <ScreenHeader title={t('admin.title')} />
      <div className="screen-body col gap-16">
        {me.isDemo && <Banner kind="info">{t('admin.demoAdminNote')}</Banner>}

        <div className="admin-tabs">
          {TABS.map((x) => (
            <button key={x.value} type="button" className={`chip ${tab === x.value ? 'active' : 'soft'}`} onClick={() => setTab(x.value)}>
              {t(x.label)}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && (
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-value">{stats.users}</div><div className="stat-label">{t('admin.stats.users')}</div></div>
            <div className="stat-card"><div className="stat-value">{stats.verifiedDrivers}</div><div className="stat-label">{t('admin.stats.verifiedDrivers')}</div></div>
            <div className="stat-card"><div className="stat-value">{stats.activeRides}</div><div className="stat-label">{t('admin.stats.activeRides')}</div></div>
            <div className="stat-card"><div className="stat-value">{stats.completedRides}</div><div className="stat-label">{t('admin.stats.completedRides')}</div></div>
            <div className="stat-card"><div className="stat-value">{stats.reservations}</div><div className="stat-label">{t('admin.stats.reservations')}</div></div>
            <div className="stat-card"><div className="stat-value">{stats.cancellationRate}%</div><div className="stat-label">{t('admin.stats.cancellationRate')}</div></div>
            <div className="stat-card"><div className="stat-value">{stats.avgRating ? stats.avgRating.toFixed(1) : '—'}</div><div className="stat-label">{t('admin.stats.avgRating')}</div></div>
            <div className="stat-card"><div className="stat-value">{stats.openReports}</div><div className="stat-label">{t('admin.stats.openReports')}</div></div>
            <div className="stat-card" style={{ gridColumn: '1 / -1' }}><div className="stat-value">{formatPrice(stats.sharedCosts, lang)}</div><div className="stat-label">{t('admin.stats.sharedCosts')}</div></div>
          </div>
        )}

        {tab === 'users' && (
          <>
            <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder={t('admin.searchUsers')} />
            <div className="col gap-8">
              {filteredUsers.map((u) => (
                <Card key={u.id} className="col gap-8">
                  <div className="row gap-12">
                    <Avatar user={u} size="sm" />
                    <span className="grow col" style={{ gap: 2, minWidth: 0 }}>
                      <span className="small bold">{u.fullName}</span>
                      <span className="tiny muted ellipsis">{u.email ?? u.phone ?? '—'}</span>
                    </span>
                    {u.isDemo && <Badge variant="demo">{t('app.demoTag')}</Badge>}
                    {u.role === 'admin' && <Badge variant="navy">admin</Badge>}
                    <Badge variant={u.status === 'active' ? 'success' : 'error'}>{t(u.status === 'active' ? 'admin.active' : 'admin.suspended')}</Badge>
                  </div>
                  <div className="row gap-8">
                    <Button size="sm" variant="outline" block onClick={() => navigate(`/user/${u.id}`)}><Eye size={14} /> {t('ride.viewProfile')}</Button>
                    {u.role !== 'admin' && u.id !== me.id && (
                      u.status === 'active' ? (
                        <Button size="sm" variant="danger-ghost" block onClick={() => setSuspendTarget(u.id)}><Ban size={14} /> {t('admin.suspend')}</Button>
                      ) : (
                        <Button size="sm" variant="success" block onClick={() => { suspendUser(u.id, false); toast(t('admin.userReactivated'), 'success'); }}>{t('admin.reactivate')}</Button>
                      )
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {tab === 'verifications' && (
          <>
            <Banner kind="info">{t('admin.docsPrivate')}</Banner>
            {sortedVerifs.length === 0 && <p className="subtitle">{t('admin.noPending')}</p>}
            <div className="col gap-8">
              {sortedVerifs.map((v) => {
                const u = userOf(v.userId);
                return (
                  <Card key={v.userId} className="col gap-8">
                    <div className="row gap-12">
                      <Avatar user={u} size="sm" />
                      <span className="grow col" style={{ gap: 2 }}>
                        <span className="small bold">{u?.fullName ?? v.userId}</span>
                        {v.submittedAt && <span className="tiny muted">{timeAgo(v.submittedAt, lang)}</span>}
                      </span>
                      {statusBadge(v.status, t)}
                    </div>
                    {v.status === 'rejected' && v.reason && <p className="tiny" style={{ color: 'var(--error)' }}>{v.reason}</p>}
                    <div className="row gap-8">
                      <Button size="sm" variant="outline" block onClick={() => setDocsUserId(v.userId)}><FileImage size={14} /> {t('admin.viewDocs')}</Button>
                      {v.status === 'pending' && (
                        <>
                          <Button size="sm" variant="success" block onClick={() => approve(v.userId)}><CheckCircle2 size={14} /> {t('admin.approve')}</Button>
                          <Button size="sm" variant="danger-ghost" block onClick={() => { setRejectUserId(v.userId); setRejectReason(''); }}><XCircle size={14} /> {t('admin.reject')}</Button>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {tab === 'reports' && (
          <div className="col gap-8">
            {reports.length === 0 && <p className="subtitle">{t('admin.noReports')}</p>}
            {[...reports].sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1)).map((r) => (
              <Card key={r.id} className="col gap-8">
                <div className="row between gap-8">
                  <span className="row gap-8 small bold"><Flag size={15} color="var(--error)" /> {t(`report.reason.${r.reason}`)}</span>
                  <Badge variant={r.status === 'open' ? 'warning' : r.status === 'resolved' ? 'success' : 'neutral'}>{r.status}</Badge>
                </div>
                <span className="tiny muted">{t('admin.target')} : {reportTarget(r)}</span>
                <span className="tiny muted">{t('admin.reporter')} : {userOf(r.reporterId)?.fullName ?? '—'} · {timeAgo(r.createdAt, lang)}</span>
                {r.details && <p className="small">{r.details}</p>}
                {r.action && <p className="tiny" style={{ color: 'var(--success)' }}>{r.action}</p>}
                {r.status === 'open' && (
                  <div className="row gap-8">
                    <Button size="sm" variant="success" block onClick={() => { setResolveTarget(r); setActionText(''); }}>{t('admin.resolve')}</Button>
                    <Button size="sm" variant="outline" block onClick={() => { dismissReport(r.id); toast(t('admin.dismissed'), 'success'); }}>{t('admin.dismiss')}</Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {tab === 'rides' && (
          <div className="col gap-8">
            {rides.map((r) => (
              <Card key={r.id} clickable className="row between gap-8" onClick={() => navigate(`/ride/${r.id}`)}>
                <span className="col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="small bold ellipsis">{rideLabelOf(r.id)}</span>
                  <span className="tiny muted">{userOf(r.driverId)?.fullName ?? '—'} · {formatDate(r.departureAt, lang)} · {formatPrice(r.pricePerSeat, lang)}</span>
                </span>
                <Badge variant={r.status === 'published' ? 'navy' : r.status === 'completed' ? 'success' : r.status === 'cancelled' ? 'error' : 'warning'}>{t(`ride.${r.status === 'in_progress' ? 'inProgress' : r.status}`)}</Badge>
              </Card>
            ))}
          </div>
        )}

        {tab === 'reservations' && (
          <div className="col gap-8">
            {bookings.map((b) => (
              <Card key={b.id} className="row between gap-8">
                <span className="col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="small bold ellipsis">{rideLabelOf(b.rideId)}</span>
                  <span className="tiny muted">{userOf(b.passengerId)?.fullName ?? '—'} · {b.seats} {t('common.seats')}</span>
                </span>
                <Badge variant={b.status === 'confirmed' || b.status === 'completed' ? 'success' : b.status === 'pending' ? 'warning' : b.status === 'cancelled' ? 'neutral' : 'error'}>{t(`res.status.${b.status}`)}</Badge>
              </Card>
            ))}
          </div>
        )}

        {tab === 'reviews' && (
          <div className="col gap-8">
            {reviews.map((r) => (
              <Card key={r.id} className="col gap-8">
                <div className="row between gap-8">
                  <span className="small bold">{userOf(r.authorId)?.fullName ?? '—'} → {userOf(r.targetId)?.fullName ?? '—'}</span>
                  <span className="row gap-4"><Star size={14} fill="var(--warning)" color="var(--warning)" /> {r.stars}</span>
                </div>
                {r.text && <p className="small muted">{r.text}</p>}
                <div className="row between">
                  <Badge variant={r.status === 'visible' ? 'success' : 'error'}>{r.status}</Badge>
                  {r.status === 'visible' ? (
                    <Button size="sm" variant="danger-ghost" onClick={() => { moderateReview(r.id, true); toast(t('admin.reviewRemoved'), 'success'); }}>{t('admin.removeReview')}</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => moderateReview(r.id, false)}>{t('admin.restoreReview')}</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === 'cities' && (
          <>
            <Card className="col gap-12">
              <span className="row gap-8 small bold"><Plus size={16} color="var(--navy)" /> {t('admin.addCity')}</span>
              <Field label={t('admin.cityNameFr')} required><Input value={cityFr} onChange={(e) => setCityFr(e.target.value)} /></Field>
              <Field label={t('admin.cityNameAr')} required><Input value={cityAr} onChange={(e) => setCityAr(e.target.value)} dir="rtl" /></Field>
              <Field label="Code wilaya"><Input type="number" value={cityCode} onChange={(e) => setCityCode(e.target.value)} /></Field>
              <Button block onClick={saveCity}>{t('common.save')}</Button>
            </Card>
            <span className="tiny muted">{cities.length} {t('admin.cities')}</span>
            <div className="col gap-4" style={{ maxHeight: '40dvh', overflowY: 'auto' }}>
              {cities.map((c) => (
                <div key={c.id} className="list-row static">
                  <span className="grow small bold">{c.nameFr}</span>
                  <span className="tiny muted">{c.nameAr}</span>
                  <span className="tiny muted-2">{String(c.code).padStart(2, '0')}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'announcements' && (
          <>
            <Card className="col gap-12">
              <span className="row gap-8 small bold"><Megaphone size={16} color="var(--navy)" /> {t('admin.announcements')}</span>
              <Field label={t('admin.announcementTitle')} required><Input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} /></Field>
              <Field label={t('admin.announcementBody')} required><Textarea value={annBody} onChange={(e) => setAnnBody(e.target.value)} rows={3} /></Field>
              <Button block onClick={sendAnn}>{t('admin.sendAnnouncement')}</Button>
            </Card>
            {announcements.length === 0 ? (
              <p className="subtitle">{t('admin.noAnnouncements')}</p>
            ) : (
              <div className="col gap-8">
                {announcements.map((a) => (
                  <Card key={a.id} className="col gap-4">
                    <span className="small bold">{a.title}</span>
                    <p className="small muted">{a.body}</p>
                    <span className="tiny muted-2">{timeAgo(a.createdAt, lang)}</span>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={!!docsUserId} onClose={() => setDocsUserId(null)} title={docsUser ? `${t('admin.viewDocs')} — ${docsUser.fullName}` : t('admin.viewDocs')}>
        <div className="col gap-12">
          <Banner kind="warning">{t('admin.docsPrivate')}</Banner>
          {docsVerification && statusBadge(docsVerification.status, t)}
          {(['id_card', 'license', 'registration', 'selfie'] as DocumentKind[]).map((kind) => {
            const doc = documents.find((d) => d.userId === docsUserId && d.kind === kind);
            return (
              <div key={kind} className="col gap-4">
                <span className="label">{t(DOC_LABELS[kind])}</span>
                {doc ? <img className="doc-thumb" src={doc.imageDataUrl} alt={t(DOC_LABELS[kind])} /> : <p className="tiny muted">{t('common.none')}</p>}
              </div>
            );
          })}
          {docsVerification?.status === 'pending' && docsUserId && (
            <div className="row gap-8">
              <Button block variant="success" onClick={() => { approve(docsUserId); setDocsUserId(null); }}>{t('admin.approve')}</Button>
              <Button block variant="danger-ghost" onClick={() => { setRejectUserId(docsUserId); setRejectReason(''); setDocsUserId(null); }}>{t('admin.reject')}</Button>
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={!!rejectUserId} onClose={() => setRejectUserId(null)} title={t('admin.rejectReason')}>
        <div className="col gap-12">
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={t('admin.rejectReasonPlaceholder')} rows={3} />
          <Button block variant="danger" disabled={!rejectReason.trim()} onClick={reject}>{t('admin.reject')}</Button>
        </div>
      </Sheet>

      <Sheet open={!!resolveTarget} onClose={() => setResolveTarget(null)} title={t('admin.resolve')}>
        <div className="col gap-12">
          <Field label={t('admin.actionTaken')} required>
            <Textarea value={actionText} onChange={(e) => setActionText(e.target.value)} rows={3} />
          </Field>
          <Button block variant="success" disabled={!actionText.trim()} onClick={() => { if (resolveTarget) { resolveReport(resolveTarget.id, actionText.trim()); toast(t('admin.resolved'), 'success'); setResolveTarget(null); } }}>
            {t('admin.resolve')}
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        onConfirm={() => { if (suspendTarget) { suspendUser(suspendTarget, true); toast(t('admin.userSuspended'), 'success'); } }}
        title={t('admin.suspend')}
        message={t('admin.suspendConfirm')}
        confirmLabel={t('admin.suspend')}
        danger
      />
    </Screen>
  );
}