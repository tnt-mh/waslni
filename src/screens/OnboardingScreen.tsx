import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../components/ui';
import { Logo } from '../components/Logo';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';

const SLIDES = [
  { img: '/illustrations/onboarding-1.png', title: 'onboarding.title1', text: 'onboarding.text1' },
  { img: '/illustrations/onboarding-2.png', title: 'onboarding.title2', text: 'onboarding.text2' },
  { img: '/illustrations/onboarding-3.png', title: 'onboarding.title3', text: 'onboarding.text3' },
];

export function OnboardingScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const setSeen = useStore((s) => s.setOnboardingSeen);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);

  const finish = () => {
    setSeen();
    navigate('/signup');
  };
  const go = (next: number) => {
    setDir(next > index ? 1 : -1);
    setIndex(next);
  };

  const slide = SLIDES[index];
  return (
    <div className="screen no-nav" style={{ background: '#fff', padding: '20px 24px', minHeight: '100dvh' }}>
      <div className="row between mb-16">
        <Logo size={30} />
        <button className="btn ghost sm" onClick={finish}>{t('onboarding.skip')}</button>
      </div>
      <div className="grow col" style={{ justifyContent: 'center', overflow: 'hidden' }}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={index}
            custom={dir}
            initial={{ opacity: 0, x: dir * 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -60 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="col center gap-16"
          >
            <motion.img
              src={slide.img}
              alt=""
              className="onboard-art"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <h1 className="h1">{t(slide.title)}</h1>
            <p className="subtitle" style={{ maxWidth: 300, margin: '0 auto' }}>{t(slide.text)}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="col gap-16 mt-24">
        <div className="steps-dots" style={{ justifyContent: 'center' }}>
          {SLIDES.map((_, i) => (
            <button key={i} aria-label={`${i + 1}`} onClick={() => go(i)} style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer' }}>
              <span className={`dot ${i < index ? 'done' : ''} ${i === index ? 'current' : ''}`} style={{ display: 'block' }} />
            </button>
          ))}
        </div>
        <div className="row gap-8">
          {index > 0 && <Button variant="outline" onClick={() => go(index - 1)}>{t('common.previous')}</Button>}
          <Button block onClick={() => (index < SLIDES.length - 1 ? go(index + 1) : finish())}>
            {index < SLIDES.length - 1 ? t('common.next') : t('onboarding.start')}
          </Button>
        </div>
      </div>
    </div>
  );
}