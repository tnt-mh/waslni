import { useState } from 'react';
import { Globe } from 'lucide-react';
import { Sheet, useToast } from './feedback';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';
import type { Language } from '../lib/types';

const LANGS: Array<{ value: Language; label: string }> = [
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
];

export function LanguagePicker({ light }: { light?: boolean }) {
  const { lang, t } = useI18n();
  const toast = useToast();
  const setLanguage = useStore((s) => s.setLanguage);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = LANGS.find((l) => l.value === lang)!;
  const choose = async (value: Language) => {
    setSaving(true);
    try {
      const result = await setLanguage(value);
      if (!result.ok) return toast(t(result.error), 'error');
      setOpen(false);
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <button className={light ? 'lang-pill' : 'chip'} onClick={() => setOpen(true)} aria-label={t('settings.language')}>
        <Globe size={15} /> {current.label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('settings.language')}>
        <div className="col gap-8">
          {LANGS.map((l) => (
            <button
              key={l.value}
              className={`list-row ${lang === l.value ? '' : ''}`}
              style={lang === l.value ? { borderColor: 'var(--navy)', background: 'var(--blue-light)' } : undefined}
              disabled={saving}
              onClick={() => { void choose(l.value); }}
            >
              <span className="grow bold">{l.label}</span>
              {lang === l.value && <span className="badge navy">✓</span>}
            </button>
          ))}
        </div>
        <p className="hint mt-16">{t('settings.languageHint')}</p>
      </Sheet>
    </>
  );
}