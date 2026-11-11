import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Mail, Phone, Sparkles } from 'lucide-react';
import { Screen } from '../../components/feedback';
import { ScreenHeader } from '../../components/AppShell';
import { Banner, Button, Field, Input } from '../../components/ui';
import { Logo } from '../../components/Logo';
import { LanguagePicker } from '../../components/LanguagePicker';
import { DemoAccountsSheet } from '../../components/DemoAccounts';
import { Modal } from '../../components/feedback';
import { useStore } from '../../lib/store';
import { useI18n } from '../../i18n';
import { isValidEmail } from '../../lib/utils';

export function LoginScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const login = useStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isValidEmail(email)) return setError(t('auth.invalidEmail'));
    if (!password) return setError(t('common.required'));
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (!res.ok) return setError(t(res.error));
    navigate('/');
    window.scrollTo(0, 0);
  };

  return (
    <Screen noNav>
      <ScreenHeader right={<LanguagePicker />} />
      <div className="screen-body stagger" style={{ paddingTop: 8 }}>
        <div className="center col gap-8 mb-8">
          <Logo size={44} />
          <h1 className="h1">{t('auth.loginTitle')}</h1>
          <p className="subtitle">{t('auth.loginSubtitle')}</p>
        </div>
        <form onSubmit={submit} className="col gap-16">
          <Field label={t('auth.email')}>
            <div className="input-icon-wrap">
              <span className="lead-icon"><Mail size={17} /></span>
              <Input type="email" autoComplete="email" placeholder="vous@exemple.dz" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error && !isValidEmail(email)} />
            </div>
          </Field>
          <Field label={t('auth.password')}>
            <div className="input-icon-wrap">
              <span className="lead-icon"><KeyRound size={17} /></span>
              <Input type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </Field>
          {error && <Banner kind="error">{error}</Banner>}
          <Button block size="lg" type="submit" loading={loading}>{t('welcome.login')}</Button>
        </form>
        <div className="row between">
          <button className="btn ghost sm" onClick={() => setForgotOpen(true)}>{t('auth.forgot')}</button>
          <Link to="/phone" className="btn ghost sm"><Phone size={15} /> {t('auth.phoneLogin')}</Link>
        </div>
        <div className="divider" />
        <Button variant="secondary" block onClick={() => setDemoOpen(true)}><Sparkles size={16} /> {t('welcome.demoAccounts')}</Button>
        <p className="center small muted">
          {t('auth.noAccount')} <Link to="/signup" className="bold">{t('auth.signup')}</Link>
        </p>
        <p className="tiny muted-2 center">{t('auth.localAuthNotice')}</p>
      </div>
      <DemoAccountsSheet open={demoOpen} onClose={() => setDemoOpen(false)} />
      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)}>
        <h3 className="h3 mb-8">{t('auth.forgot')}</h3>
        <p className="subtitle mb-16">{t('auth.forgotInfo')}</p>
        <Button block onClick={() => setForgotOpen(false)}>{t('common.close')}</Button>
      </Modal>
    </Screen>
  );
}