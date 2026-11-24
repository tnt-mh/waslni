import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Flag, KeyRound, MapPin, Phone, Plus, ShieldCheck, Siren, Trash2, Users } from 'lucide-react';
import { Screen, Sheet, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Badge, Button, Card, Field, Input, ListRow, SectionTitle } from '../components/ui';
import { useStore, currentUser } from '../lib/store';
import { formatPhone, normalizePhone } from '../lib/utils';
import { useI18n } from '../i18n';

export function SafetyScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useStore(currentUser)!;
  const contacts = useStore(useShallow((s) => s.trustedContacts.filter((c) => c.userId === me.id)));
  const addTrustedContact = useStore((s) => s.addTrustedContact);
  const removeTrustedContact = useStore((s) => s.removeTrustedContact);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    if (!name.trim()) return setError(t('common.required'));
    const normalized = normalizePhone(phone);
    if (!normalized) return setError(t('auth.invalidPhone'));
    try {
      const res = await addTrustedContact(name, normalized);
      if (!res.ok) return setError(t(res.error));
      toast(t('safety.contactAdded'), 'success');
      setAddOpen(false);
      setName('');
      setPhone('');
    } catch {
      setError(t('common.error'));
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await removeTrustedContact(id);
      if (!res.ok) toast(t(res.error), 'error');
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('safety.title')} />
      <div className="screen-body col gap-16">
        <p className="subtitle">{t('safety.subtitle')}</p>

        <Card clickable navy className="row between" onClick={() => navigate('/sos')}>
          <span className="row gap-12">
            <Siren size={24} />
            <span className="col" style={{ gap: 2 }}>
              <span className="bold">{t('safety.sos')}</span>
              <span className="tiny" style={{ opacity: 0.8 }}>{t('safety.sosSubtitle')}</span>
            </span>
          </span>
          <span className="chevron"><Phone size={18} /></span>
        </Card>

        <SectionTitle title={t('safety.trustedContacts')} action={t('safety.addContact')} onAction={() => setAddOpen(true)} />
        {contacts.length === 0 ? (
          <p className="subtitle">{t('safety.noContacts')}</p>
        ) : (
          <div className="card flat col" style={{ padding: 4 }}>
            {contacts.map((c) => (
              <ListRow
                key={c.id}
                static
                icon={<Users size={17} />}
                title={c.name}
                subtitle={formatPhone(c.phone, lang)}
                end={
                  <span className="row gap-4">
                    <a className="icon-btn" href={`tel:${c.phone}`} aria-label={t('common.call')}><Phone size={17} /></a>
                    <button className="icon-btn" aria-label={t('common.delete')} onClick={async () => { await remove(c.id); }}><Trash2 size={17} color="var(--error)" /></button>
                  </span>
                }
              />
            ))}
          </div>
        )}
        <Button variant="outline" block onClick={() => setAddOpen(true)}><Plus size={16} /> {t('safety.addContact')}</Button>

        <Card className="col gap-8">
          <span className="row gap-8 bold small"><MapPin size={16} color="var(--navy)" /> {t('safety.liveLocation')}</span>
          <Badge variant="neutral">{t('safety.liveLocationOff')}</Badge>
        </Card>

        <Card className="col gap-8">
          <span className="row gap-8 bold small"><KeyRound size={16} color="var(--navy)" /> {t('safety.pinTitle')}</span>
          <p className="small muted">{t('safety.pinText')}</p>
        </Card>
        <Card className="col gap-8">
          <span className="row gap-8 bold small"><ShieldCheck size={16} color="var(--navy)" /> {t('safety.verificationTitle')}</span>
          <p className="small muted">{t('safety.verificationText')}</p>
        </Card>
        <Card className="col gap-8">
          <span className="row gap-8 bold small"><Users size={16} color="var(--navy)" /> {t('safety.womenOnlyTitle')}</span>
          <p className="small muted">{t('safety.womenOnlyText')}</p>
        </Card>

        <Button variant="ghost" block onClick={() => navigate('/reservations')}><Flag size={16} /> {t('safety.reportIncident')}</Button>
      </div>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title={t('safety.addContact')}>
        <div className="col gap-12">
          <Field label={t('safety.contactName')} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('safety.contactPhone')} required error={error}>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('auth.phonePlaceholder')} />
          </Field>
          <Button block size="lg" onClick={save}>{t('common.save')}</Button>
        </div>
      </Sheet>
    </Screen>
  );
}