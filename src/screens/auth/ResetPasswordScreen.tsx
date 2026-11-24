import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Screen, useToast } from '../../components/feedback';
import { ScreenHeader } from '../../components/AppShell';
import { Banner, Button, Field, Input } from '../../components/ui';
import { Logo } from '../../components/Logo';
import { LanguagePicker } from '../../components/LanguagePicker';
import { useStore } from '../../lib/store';
import { useI18n } from '../../i18n';

export function ResetPasswordScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const updatePassword = useStore((s) => s.updatePassword);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError(t('auth.weakPassword'));
    if (password !== confirm) return setError(t('auth.passwordMismatch'));
    setLoading(true);
    const res = await updatePassword(password);
    setLoading(false);
    if (!res.ok) return setError(t(res.error));
    toast(t('auth.passwordUpdated'), 'success');
    navigate('/login');
  };

  return (
    <Screen noNav>
      <ScreenHeader right={<LanguagePicker />} />
      <div className="screen-body stagger" style={{ paddingTop: 24 }}>
        <div className="center col gap-8 mb-8">
          <Logo size={44} />
          <h1 className="h1">{t('auth.resetTitle')}</h1>
          <p className="subtitle">{t('auth.resetSubtitle')}</p>
        </div>
        <form onSubmit={submit} className="col gap-16">
          <Field label={t('auth.password')} error={error}>
            <div className="input-icon-wrap">
              <span className="lead-icon"><KeyRound size={17} /></span>
              <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!error} />
            </div>
          </Field>
          <Field label={t('auth.confirmPassword')}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <Banner kind="error">{error}</Banner>}
          <Button block size="lg" type="submit" loading={loading}>{t('auth.updatePassword')}</Button>
        </form>
      </div>
    </Screen>
  );
}
