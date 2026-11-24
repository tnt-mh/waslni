import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavigate } from 'react-router-dom';
import { Clock3, FileText, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Screen, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Badge, Banner, Button, Card, Field, Select, Textarea } from '../components/ui';
import { useStore, currentUser } from '../lib/store';
import { useI18n } from '../i18n';
import type { AccountRestriction } from '../lib/types';

function isEffectiveSuspension(restriction: AccountRestriction) {
  const now = Date.now();
  return restriction.active && restriction.kind !== 'warning' && !restriction.reversedAt
    && new Date(restriction.startsAt).getTime() <= now
    && (!restriction.expiresAt || new Date(restriction.expiresAt).getTime() > now);
}

export function AccountAccessScreen({ view }: { view: 'restrictions' | 'appeals' }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const user = useStore(currentUser)!;
  const restrictions = useStore(useShallow((s) => s.restrictions.filter((item) => item.userId === user.id)));
  const actions = useStore(useShallow((s) => s.moderationActions.filter((item) => item.subjectId === user.id)));
  const appeals = useStore(useShallow((s) => s.appeals.filter((item) => item.appellantId === user.id)));
  const submitAppeal = useStore((s) => s.submitAppeal);
  const logout = useStore((s) => s.logout);
  const [actionId, setActionId] = useState('');
  const [statement, setStatement] = useState('');
  const [saving, setSaving] = useState(false);

  const activeRestrictions = restrictions.filter(isEffectiveSuspension);
  const appealable = actions.filter((action) => {
    if (action.actionType !== 'timeout' && action.actionType !== 'ban') return false;
    const restrictionId = action.metadata.restrictionId;
    const restriction = restrictions.find((item) => item.id === restrictionId);
    return !!restriction && isEffectiveSuspension(restriction)
      && !appeals.some((appeal) => appeal.actionId === action.id && appeal.status !== 'denied');
  });
  const date = (value: string | null) => value
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-DZ' : lang === 'en' ? 'en-GB' : 'fr-DZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : t('admin.permanent');

  const submit = async () => {
    if (!actionId || statement.trim().length < 1) return toast(t('common.required'), 'error');
    setSaving(true);
    try {
      const result = await submitAppeal(actionId, statement);
      if (!result.ok) return toast(t(result.error), 'error');
      setStatement('');
      setActionId('');
      toast(t('access.appealSubmitted'), 'success');
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    const result = await logout();
    if (!result.ok) toast(t(result.error), 'error');
  };

  return (
    <Screen noNav>
      <ScreenHeader title={t(view === 'restrictions' ? 'access.restrictionsTitle' : 'access.appealsTitle')} back={false} />
      <div className="screen-body col gap-16" style={{ maxWidth: 860, marginInline: 'auto', paddingTop: 32 }}>
        {activeRestrictions.length > 0 ? (
          <Banner kind="error">
            <ShieldAlert size={18} />
            {t(activeRestrictions.some((restriction) => restriction.kind === 'ban') ? 'access.banMessage' : 'access.timeoutMessage')}
          </Banner>
        ) : (
          <Banner kind="success">
            <ShieldCheck size={18} />
            {t('access.activeMessage')}
          </Banner>
        )}

        {view === 'restrictions' ? (
          <>
            <div className="row between gap-8">
              <h2 className="h3">{t('access.history')}</h2>
              <Button variant="outline" size="sm" onClick={() => navigate('/appeals')}>{t('access.goToAppeals')}</Button>
            </div>
            {restrictions.length ? restrictions.map((restriction) => (
              <Card key={restriction.id} className="col gap-8">
                <div className="row between gap-8">
                  <span className="small bold">{t(`admin.moderation.kind.${restriction.kind}`)}</span>
                  <Badge variant={isEffectiveSuspension(restriction) ? 'error' : restriction.reversedAt ? 'neutral' : 'warning'}>
                    {t(isEffectiveSuspension(restriction) ? 'admin.active' : restriction.reversedAt ? 'access.reversed' : 'admin.inactive')}
                  </Badge>
                </div>
                {restriction.publicMessage && <p className="small">{restriction.publicMessage}</p>}
                <div className="row wrap gap-16 tiny muted">
                  <span className="row gap-4"><Clock3 size={13} /> {t('admin.created')} : {date(restriction.startsAt)}</span>
                  <span>{t('admin.expires')} : {date(restriction.expiresAt)}</span>
                </div>
              </Card>
            )) : <Card><p className="small muted">{t('access.noRestrictions')}</p></Card>}
          </>
        ) : (
          <>
            {appealable.length > 0 && (
              <Card className="col gap-12">
                <h2 className="h3">{t('access.newAppeal')}</h2>
                <Field label={t('admin.originalAction')}>
                  <Select value={actionId} onChange={(event) => setActionId(event.target.value)}>
                    <option value="">{t('access.chooseAction')}</option>
                    {appealable.map((action) => (
                      <option key={action.id} value={action.id}>
                        {t(`admin.moderation.kind.${action.actionType}`)} — {date(action.createdAt)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('admin.appealStatement')}>
                  <Textarea rows={5} maxLength={3000} value={statement} onChange={(event) => setStatement(event.target.value)} />
                </Field>
                <Button block disabled={saving || !actionId || !statement.trim()} onClick={submit}>
                  <FileText size={16} /> {t('access.submitAppeal')}
                </Button>
              </Card>
            )}
            <h2 className="h3">{t('access.yourAppeals')}</h2>
            {appeals.length ? appeals.map((appeal) => {
              const action = actions.find((item) => item.id === appeal.actionId);
              return (
                <Card key={appeal.id} className="col gap-8">
                  <div className="row between gap-8">
                    <span className="small bold">{action ? t(`admin.moderation.kind.${action.actionType}`) : t('admin.appeals')}</span>
                    <Badge variant={appeal.status === 'granted' ? 'success' : appeal.status === 'denied' ? 'error' : 'warning'}>
                      {t(`admin.status.${appeal.status}`)}
                    </Badge>
                  </div>
                  <p className="small">{appeal.statement}</p>
                  {(appeal.publicMessage || appeal.reviewNote) && <Banner kind="info">{appeal.publicMessage || appeal.reviewNote}</Banner>}
                  <span className="tiny muted">{t('admin.created')} : {date(appeal.createdAt)}</span>
                </Card>
              );
            }) : <Card><p className="small muted">{t('access.noAppeals')}</p></Card>}
          </>
        )}
        <Button block variant="outline" onClick={signOut}><LogOut size={16} /> {t('auth.logout')}</Button>
        {activeRestrictions.length === 0 && (
          <Button block onClick={() => navigate('/')}>{t('nav.home')}</Button>
        )}
      </div>
    </Screen>
  );
}
