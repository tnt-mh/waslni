import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Camera, Heart, LogOut, Settings, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { Screen, Sheet, ConfirmDialog, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Avatar, Banner, Button, Field, IconButton, Input, ListRow, Segmented, Textarea } from '../components/ui';
import { ProfileView } from '../components/ProfileView';
import { useStore, currentUser } from '../lib/store';
import { compressImage } from '../lib/utils';
import { useI18n } from '../i18n';
import type { Mode } from '../lib/types';

const ATMOSPHERE_OPTIONS = ['chatty', 'quiet', 'music', 'luggage', 'ac', 'pets'] as const;

export function ProfileScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useStore(currentUser)!;
  const setMode = useStore((s) => s.setMode);
  const updateProfile = useStore((s) => s.updateProfile);
  const logout = useStore((s) => s.logout);
  const toggleSavedDriver = useStore((s) => s.toggleSavedDriver);
  const savedUsers = useStore(useShallow((s) => s.users.filter((u) => s.savedDrivers.some((d) => d.userId === me.id && d.driverId === u.id))));

  const [editOpen, setEditOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [name, setName] = useState(me.fullName);
  const [bio, setBio] = useState(me.bio);
  const [atmosphere, setAtmosphere] = useState<string[]>(me.atmosphere);
  const [nameError, setNameError] = useState('');
  const photoRef = useRef<HTMLInputElement | null>(null);

  const openEdit = () => {
    setName(me.fullName);
    setBio(me.bio);
    setAtmosphere(me.atmosphere);
    setNameError('');
    setEditOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return setNameError(t('auth.nameRequired'));
    try {
      const res = await updateProfile({ fullName: name.trim(), bio: bio.trim(), atmosphere });
      if (!res.ok) return setNameError(t(res.error));
      toast(t('common.saved'), 'success');
      setEditOpen(false);
    } catch {
      setNameError(t('common.error'));
    }
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    let dataUrl: string;
    try {
      dataUrl = await compressImage(file, 400, 0.8);
    } catch {
      toast(t('error.cameraUnavailable'), 'error');
      return;
    }
    try {
      const res = await updateProfile({ photoUrl: dataUrl });
      if (!res.ok) return toast(t(res.error), 'error');
      toast(t('common.saved'), 'success');
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  const switchMode = async (mode: Mode) => {
    try {
      const res = await setMode(mode);
      if (!res.ok) return toast(t(res.error), 'error');
      navigate('/');
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={t('profile.title')}
        back={false}
        right={<IconButton label={t('profile.settings')} onClick={() => navigate('/settings')}><Settings size={19} /></IconButton>}
      />
      <div className="screen-body col gap-16">
        <ProfileView user={me} />

        <div className="col gap-8">
          <span className="label">{t('mode.label')}</span>
          <Segmented
            value={me.mode}
            onChange={switchMode}
            options={[
              { value: 'passenger', label: t('mode.passenger') },
              { value: 'driver', label: t('mode.driver') },
            ]}
          />
        </div>

        <Button block variant="outline" onClick={openEdit}><UserRound size={16} /> {t('profile.editProfile')}</Button>

        <div className="card flat col" style={{ padding: 4 }}>
          <ListRow icon={<Heart size={17} />} title={t('profile.savedDrivers')} subtitle={String(savedUsers.length)} onClick={() => setSavedOpen(true)} />
          <ListRow icon={<ShieldCheck size={17} />} title={t('profile.safety')} onClick={() => navigate('/safety')} />
          <ListRow icon={<Settings size={17} />} title={t('profile.settings')} onClick={() => navigate('/settings')} />
          {me.role === 'admin' && <ListRow icon={<ShieldCheck size={17} />} title={t('profile.adminAccess')} onClick={() => navigate('/admin')} />}
          <ListRow icon={<LogOut size={17} />} title={t('auth.logout')} danger onClick={() => setLogoutOpen(true)} />
        </div>

        <Banner kind="info">{t('profile.privateNote')}</Banner>
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t('profile.editProfile')}>
        <div className="col gap-12">
          <div className="col center gap-8">
            <Avatar user={me} size="lg" />
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
            <div className="row gap-8">
              <Button size="sm" variant="outline" onClick={() => photoRef.current?.click()}><Camera size={15} /> {me.photoUrl ? t('auth.changePhoto') : t('auth.addPhoto')}</Button>
              {me.photoUrl && <Button size="sm" variant="ghost" onClick={async () => {
                try {
                  const res = await updateProfile({ photoUrl: null });
                  if (!res.ok) toast(t(res.error), 'error');
                } catch {
                  toast(t('common.error'), 'error');
                }
              }}>{t('auth.removePhoto')}</Button>}
            </div>
          </div>
          <Field label={t('auth.fullName')} required error={nameError}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('profile.bio')}>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={300} />
          </Field>
          <Field label={t('profile.atmosphere')}>
            <div className="row wrap gap-8">
              {ATMOSPHERE_OPTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`chip ${atmosphere.includes(a) ? 'active' : ''}`}
                  onClick={() => setAtmosphere((list) => list.includes(a) ? list.filter((x) => x !== a) : [...list, a])}
                >
                  {t(`ride.pref.${a}`)}
                </button>
              ))}
            </div>
          </Field>
          <Button block size="lg" onClick={save}>{t('common.save')}</Button>
        </div>
      </Sheet>

      <Sheet open={savedOpen} onClose={() => setSavedOpen(false)} title={t('profile.savedDrivers')}>
        {savedUsers.length === 0 ? (
          <p className="subtitle">{t('msg.empty')}</p>
        ) : (
          <div className="col gap-4">
            {savedUsers.map((u) => (
              <div key={u.id} className="list-row static">
                <Avatar user={u} size="sm" />
                <button type="button" className="grow small bold" style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'start', font: 'inherit' }} onClick={() => { setSavedOpen(false); navigate(`/user/${u.id}`); }}>
                  {u.fullName}
                </button>
                <button type="button" className="icon-btn" aria-label={t('ride.unsaveDriver')} onClick={async () => {
                  try {
                    const res = await toggleSavedDriver(u.id);
                    if (!res.ok) toast(t(res.error), 'error');
                  } catch {
                    toast(t('common.error'), 'error');
                  }
                }}><Trash2 size={16} color="var(--error)" /></button>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={async () => {
          try {
            const result = await logout();
            if (!result.ok) return toast(t(result.error), 'error');
            navigate('/welcome');
          } catch {
            toast(t('common.error'), 'error');
          }
        }}
        title={t('auth.logout')}
        message={t('auth.logoutConfirm')}
        confirmLabel={t('auth.logout')}
        danger
      />
    </Screen>
  );
}