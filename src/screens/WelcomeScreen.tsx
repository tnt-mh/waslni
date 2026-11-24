import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui';
import { LanguagePicker } from '../components/LanguagePicker';
import { DemoAccountsSheet } from '../components/DemoAccounts';
import { useStore, currentUser } from '../lib/store';
import { useI18n } from '../i18n';
import { runtimeMode } from '../lib/runtime';

export function WelcomeScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const session = useStore(currentUser);
  const [demoOpen, setDemoOpen] = useState(false);
  if (session) return <Navigate to="/" replace />;

  return (
    <div className="welcome">
      <div className="glow" />
      <div className="glow g2" />
      <div className="row between" style={{ position: 'relative' }}>
        <Logo size={40} tone="white" />
        <LanguagePicker light />
      </div>
      <div className="grow col" style={{ justifyContent: 'center', alignItems: 'center', gap: 18, position: 'relative', textAlign: 'center' }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 16, delay: 0.1 }}>
          <Logo size={104} tone="white" wordmark={false} />
        </motion.div>
        <motion.h1 className="h1" style={{ fontSize: 34, color: '#fff' }} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
          Waslni
        </motion.h1>
        <motion.p style={{ color: 'rgba(255,255,255,0.82)', fontSize: 16, maxWidth: 260 }} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
          {t('app.slogan')}
        </motion.p>
      </div>
      <motion.div className="col gap-12" style={{ position: 'relative' }} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}>
        <Button block size="lg" onClick={() => navigate('/onboarding')}>{t('welcome.getStarted')}</Button>
        <Button block variant="ghost" onClick={() => navigate('/login')}>{t('welcome.login')}</Button>
        {runtimeMode === 'demo' && (
          <button className="btn ghost sm" style={{ color: 'rgba(255,255,255,0.75)' }} onClick={() => setDemoOpen(true)}>
            <Sparkles size={15} /> {t('welcome.demoAccounts')}
          </button>
        )}
        <p className="tiny center" style={{ color: 'rgba(255,255,255,0.5)' }}>{t('welcome.legal')}</p>
      </motion.div>
      <DemoAccountsSheet open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}