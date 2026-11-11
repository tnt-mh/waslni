import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, ShieldCheck } from 'lucide-react';
import { Screen } from '../../components/feedback';
import { ScreenHeader } from '../../components/AppShell';
import { Banner, Button, Field, Input, PinInput } from '../../components/ui';
import { Logo } from '../../components/Logo';
import { LanguagePicker } from '../../components/LanguagePicker';
import { useStore } from '../../lib/store';
import { useI18n } from '../../i18n';
import { formatPhone, generatePin, normalizePhone } from '../../lib/utils';

export function PhoneScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const phoneAuth = useStore((s) => s.phoneAuth);
  const [phone, setPhone] = useState('');
  const [normalized, setNormalized] = useState<string | null>(null);
  const [code, setCode] = useState(() => generatePin());
  const [entry, setEntry] = useState('');
  const [error, setError] = useState('');

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const n = normalizePhone(phone);
    if (!n) return setError(t('auth.invalidPhone'));
    setNormalized(n);
    setCode(generatePin());
    setEntry('');
  };

  const verify = () => {
    setError('');
    if (entry !== code) return setError(t('auth.otpWrong'));
    const res = phoneAuth(normalized!);
    if (!res.ok) return setError(t(res.error));
    navigate(res.isNew ? '/profile-setup' : '/');
    window.scrollTo(0, 0);
  };

  return (
    <Screen noNav>
      <ScreenHeader right={<LanguagePicker />} />
      <div className="screen-body stagger" style={{ paddingTop: 8 }}>
        <div className="center col gap-8 mb-8">
          <Logo size={44} />
          <h1 className="h1">{normalized ? t('auth.otpTitle') : t('auth.phoneLogin')}</h1>
          <p className="subtitle">
            {normalized ? t('auth.otpSubtitle', { phone: formatPhone(normalized, lang) }) : t('auth.signupSubtitle')}
          </p>
        </div>

        {!normalized ? (
          <form onSubmit={submitPhone} className="col gap-16">
            <Field label={t('auth.phone')} error={error} hint="+213">
              <div className="input-icon-wrap">
                <span className="lead-icon"><Phone size={17} /></span>
                <Input
                  type="tel" inputMode="tel" autoComplete="tel" placeholder={t('auth.phonePlaceholder')}
                  value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!error}
                />
              </div>
            </Field>
            <Button block size="lg" type="submit">{t('common.continue')}</Button>
            <Link to="/login" className="btn ghost block">{t('auth.emailLogin')}</Link>
          </form>
        ) : (
          <div className="col gap-16">
            <Banner kind="warning">{t('auth.otpDemoNotice')}</Banner>
            <div className="card soft center col gap-8">
              <span className="row gap-8" style={{ justifyContent: 'center', color: 'var(--navy)' }}>
                <ShieldCheck size={16} />
                <span className="small bold">{t('auth.otpDemoCode', { code })}</span>
              </span>
            </div>
            <PinInput value={entry} onChange={setEntry} />
            {error && <Banner kind="error">{error}</Banner>}
            <Button block size="lg" disabled={entry.length !== 4} onClick={verify}>{t('auth.verify')}</Button>
            <div className="row between">
              <button className="btn ghost sm" onClick={() => { setNormalized(null); setError(''); }}>{t('common.back')}</button>
              <button className="btn ghost sm" onClick={() => { setCode(generatePin()); setEntry(''); }}>{t('auth.otpResend')}</button>
            </div>
          </div>
        )}
      </div>
    </Screen>
  );
}