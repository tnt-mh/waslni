import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Mail, Phone, UserRound } from 'lucide-react';
import { Screen } from '../../components/feedback';
import { ScreenHeader } from '../../components/AppShell';
import { Banner, Button, Field, Input } from '../../components/ui';
import { Logo } from '../../components/Logo';
import { LanguagePicker } from '../../components/LanguagePicker';
import { useStore } from '../../lib/store';
import { useI18n } from '../../i18n';
import { isValidEmail } from '../../lib/utils';

export function SignupScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const signUp = useStore((s) => s.signUp);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (fullName.trim().length < 3) errs.fullName = t('auth.nameRequired');
    if (!isValidEmail(email)) errs.email = t('auth.invalidEmail');
    if (password.length < 8) errs.password = t('auth.weakPassword');
    setErrors(errs);
    setGlobalError('');
    if (Object.keys(errs).length) return;
    setLoading(true);
    const res = await signUp({ fullName, email, password });
    setLoading(false);
    if (!res.ok) return setGlobalError(t(res.error));
    navigate('/profile-setup');
    window.scrollTo(0, 0);
  };

  return (
    <Screen noNav>
      <ScreenHeader right={<LanguagePicker />} />
      <div className="screen-body stagger" style={{ paddingTop: 8 }}>
        <div className="center col gap-8 mb-8">
          <Logo size={44} />
          <h1 className="h1">{t('auth.signupTitle')}</h1>
          <p className="subtitle">{t('auth.signupSubtitle')}</p>
        </div>
        <form onSubmit={submit} className="col gap-16" noValidate>
          <Field label={t('auth.fullName')} error={errors.fullName} required>
            <div className="input-icon-wrap">
              <span className="lead-icon"><UserRound size={17} /></span>
              <Input autoComplete="name" placeholder="Ex. : Amina Tounsi" value={fullName} onChange={(e) => setFullName(e.target.value)} invalid={!!errors.fullName} />
            </div>
          </Field>
          <Field label={t('auth.email')} error={errors.email} required>
            <div className="input-icon-wrap">
              <span className="lead-icon"><Mail size={17} /></span>
              <Input type="email" autoComplete="email" placeholder="vous@exemple.dz" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} />
            </div>
          </Field>
          <Field label={t('auth.password')} hint={t('auth.passwordHint')} error={errors.password} required>
            <div className="input-icon-wrap">
              <span className="lead-icon"><KeyRound size={17} /></span>
              <Input type="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} />
            </div>
          </Field>
          {globalError && <Banner kind="error">{globalError}</Banner>}
          <Button block size="lg" type="submit" loading={loading}>{t('auth.signup')}</Button>
        </form>
        <Link to="/phone" className="btn outline block"><Phone size={16} /> {t('auth.phoneLogin')}</Link>
        <p className="center small muted">
          {t('auth.hasAccount')} <Link to="/login" className="bold">{t('welcome.login')}</Link>
        </p>
        <p className="tiny muted-2 center">{t('auth.localAuthNotice')}</p>
      </div>
    </Screen>
  );
}