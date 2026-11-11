import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Flag, MapPin, Phone, Siren } from 'lucide-react';
import { Screen, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Banner, Button, SectionTitle } from '../components/ui';
import { useStore, currentUser } from '../lib/store';
import { formatPhone } from '../lib/utils';
import { useI18n } from '../i18n';

const EMERGENCY_NUMBERS = [
  { key: 'safety.police', number: '17' },
  { key: 'safety.gendarmerie', number: '1055' },
  { key: 'safety.civilProtection', number: '14' },
] as const;

export function SosScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useStore(currentUser)!;
  const contacts = useStore(useShallow((s) => s.trustedContacts.filter((c) => c.userId === me.id)));
  const bookings = useStore((s) => s.bookings);
  const [locating, setLocating] = useState(false);

  const activeRideId = bookings.find((b) => b.passengerId === me.id && b.status === 'confirmed')?.rideId;

  const shareText = async (text: string) => {
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(t('common.copied'), 'success');
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  const shareLocation = () => {
    if (!navigator.geolocation) return toast(t('safety.locationUnavailable'), 'error');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        const link = `https://www.openstreetmap.org/?mlat=${latitude.toFixed(5)}&mlon=${longitude.toFixed(5)}#map=16/${latitude.toFixed(5)}/${longitude.toFixed(5)}`;
        void shareText(`${t('safety.myLocation')}\n${link}`);
      },
      () => {
        setLocating(false);
        toast(t('safety.locationUnavailable'), 'error');
      },
      { timeout: 10000 },
    );
  };

  return (
    <Screen>
      <ScreenHeader title={t('safety.sos')} />
      <div className="screen-body col gap-16">
        <div className="col center gap-8" style={{ padding: '12px 0' }}>
          <span className="sos-btn" aria-hidden><Siren size={30} /></span>
          <h1 className="h2">{t('safety.sosSubtitle')}</h1>
        </div>

        <Banner kind="warning">{t('safety.sosWarning')}</Banner>

        <div className="col gap-8">
          {EMERGENCY_NUMBERS.map((e) => (
            <a key={e.number} className="card clickable row between" href={`tel:${e.number}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="row gap-12">
                <Phone size={20} color="var(--error)" />
                <span className="bold">{t(e.key)}</span>
              </span>
              <span className="row gap-8">
                <span className="h3" style={{ color: 'var(--error)' }}>{e.number}</span>
                <span className="badge error">{t('safety.callNow')}</span>
              </span>
            </a>
          ))}
        </div>

        <Button block variant="outline" loading={locating} onClick={shareLocation}><MapPin size={17} /> {t('safety.shareLocation')}</Button>

        {contacts.length > 0 && (
          <>
            <SectionTitle title={t('safety.trustedContacts')} />
            <div className="col gap-8">
              {contacts.map((c) => (
                <a key={c.id} className="card clickable row between" href={`tel:${c.phone}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span className="col" style={{ gap: 2 }}>
                    <span className="small bold">{c.name}</span>
                    <span className="tiny muted">{formatPhone(c.phone, lang)}</span>
                  </span>
                  <Phone size={18} color="var(--navy)" />
                </a>
              ))}
            </div>
          </>
        )}

        <Button block variant="ghost" onClick={() => (activeRideId ? navigate(`/report/ride/${activeRideId}`) : navigate('/reservations'))}>
          <Flag size={16} /> {t('safety.reportIncident')}
        </Button>
      </div>
    </Screen>
  );
}