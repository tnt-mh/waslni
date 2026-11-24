import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Camera, UserRound } from 'lucide-react';
import { Screen, useToast } from '../../components/feedback';
import { ScreenHeader } from '../../components/AppShell';
import { Avatar, Banner, Button, Field, Input, Select } from '../../components/ui';
import { useStore, currentUser } from '../../lib/store';
import { useI18n } from '../../i18n';
import { compressImage } from '../../lib/utils';
import type { Gender, Language } from '../../lib/types';

export function ProfileSetupScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const user = useStore(currentUser);
  const updateProfile = useStore((s) => s.updateProfile);
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [photo, setPhoto] = useState<string | null>(user?.photoUrl ?? null);
  const [birth, setBirth] = useState(user?.dateOfBirth ?? '');
  const [gender, setGender] = useState<Gender>(user?.gender ?? 'unspecified');
  const [lang, setLang] = useState<Language>(user?.language ?? 'fr');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return <Navigate to="/welcome" replace />;

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast(t('verify.docTooBig'), 'error');
    try {
      setPhoto(await compressImage(file, 512, 0.8));
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (fullName.trim().length < 3) return setError(t('auth.nameRequired'));
    setSaving(true);
    try {
      const result = await updateProfile({
        fullName: fullName.trim(), photoUrl: photo, dateOfBirth: birth || null, gender, language: lang,
      });
      if (!result.ok) return toast(t(result.error), 'error');
      toast(t('common.saved'), 'success');
      navigate('/');
      window.scrollTo(0, 0);
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen noNav>
      <ScreenHeader back={false} title={t('auth.profileSetupTitle')} />
      <div className="screen-body">
        <p className="subtitle center">{t('auth.profileSetupSubtitle')}</p>
        <form onSubmit={submit} className="col gap-16">
          <div className="center col gap-8">
            <Avatar name={fullName || user.email || '?'} hue={user.avatarHue} photoUrl={photo} size="xl" />
            <div className="row gap-8">
              <Button variant="secondary" size="sm" type="button" onClick={() => fileRef.current?.click()}>
                <Camera size={15} /> {photo ? t('auth.changePhoto') : t('auth.addPhoto')}
              </Button>
              {photo && <Button variant="ghost" size="sm" type="button" onClick={() => setPhoto(null)}>{t('auth.removePhoto')}</Button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
            <span className="hint" style={{ maxWidth: 260 }}>{t('auth.photoHint')}</span>
          </div>

          {!user.fullName && (
            <Field label={t('auth.fullName')} required error={error}>
              <div className="input-icon-wrap">
                <span className="lead-icon"><UserRound size={17} /></span>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex. : Amina Tounsi" />
              </div>
            </Field>
          )}

          <Field label={t('auth.birthDate')}>
            <Input type="date" value={birth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirth(e.target.value)} />
          </Field>

          <Field label={t('auth.gender')} hint={t('auth.genderHint')}>
            <Select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
              <option value="unspecified">{t('auth.genderUnspecified')}</option>
              <option value="female">{t('auth.genderFemale')}</option>
              <option value="male">{t('auth.genderMale')}</option>
            </Select>
          </Field>

          <Field label={t('auth.preferredLanguage')}>
            <Select value={lang} onChange={(e) => setLang(e.target.value as Language)}>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>

          {!user.phoneVerified && user.phone && (
            <Banner kind="info">{t('profile.phoneNotVerified')} — {t('auth.otpDemoNotice')}</Banner>
          )}

          <Button block size="lg" type="submit" disabled={saving}>{t('auth.finish')}</Button>
        </form>
      </div>
    </Screen>
  );
}