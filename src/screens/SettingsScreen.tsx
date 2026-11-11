import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Info, Plug, RotateCcw, WifiOff } from 'lucide-react';
import { Screen, ConfirmDialog, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Banner, ListRow } from '../components/ui';
import { LanguagePicker } from '../components/LanguagePicker';
import { Logo } from '../components/Logo';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';

export function SettingsScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const resetAll = useStore((s) => s.resetAll);
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <Screen>
      <ScreenHeader title={t('settings.title')} />
      <div className="screen-body col gap-16">
        <div className="card flat col" style={{ padding: 4 }}>
          <div className="list-row static">
            <span className="grow small bold">{t('settings.language')}</span>
            <LanguagePicker />
          </div>
        </div>
        <p className="hint">{t('settings.languageHint')}</p>

        <span className="label">{t('settings.notifications')}</span>
        <Banner kind="info">{t('settings.pushNotice')}</Banner>

        <div className="card flat col" style={{ padding: 4 }}>
          <ListRow icon={<Plug size={17} />} title={t('settings.integrations')} onClick={() => navigate('/integrations')} />
        </div>

        <span className="label">{t('settings.offline')}</span>
        <div className="card col gap-8">
          <span className="row gap-8 small bold"><WifiOff size={16} color="var(--navy)" /> {t('settings.offline')}</span>
          <p className="small muted">{t('settings.offlineText')}</p>
        </div>

        <span className="label">{t('settings.demoDataSection')}</span>
        <div className="card col gap-12">
          <span className="row gap-8 small bold"><Database size={16} color="var(--navy)" /> {t('settings.demoDataSection')}</span>
          <p className="small muted">{t('settings.demoDataText')}</p>
          <Banner kind="warning">{t('settings.resetConfirm')}</Banner>
          <button type="button" className="btn danger-ghost block" onClick={() => setResetOpen(true)}>
            <RotateCcw size={16} /> {t('settings.resetDemo')}
          </button>
        </div>

        <span className="label">{t('settings.about')}</span>
        <div className="card col center gap-8">
          <Logo />
          <p className="small muted">{t('app.slogan')}</p>
          <span className="row gap-4 tiny muted"><Info size={13} /> {t('settings.version')} 1.0.0 · PWA</span>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => { resetAll(); toast(t('settings.resetDone'), 'success'); navigate('/welcome'); }}
        title={t('settings.resetDemo')}
        message={t('settings.resetConfirm')}
        confirmLabel={t('settings.resetDemo')}
        danger
      />
    </Screen>
  );
}