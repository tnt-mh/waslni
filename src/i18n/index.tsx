import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { fr, type TranslationKey } from './fr';
import { en } from './en';
import { ar } from './ar';
import type { Language } from '../lib/types';

const DICTS: Record<Language, Record<string, string>> = { fr, en, ar };

export function translate(lang: Language, key: string, params?: Record<string, string | number>): string {
  const raw = DICTS[lang][key] ?? fr[key as TranslationKey] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

interface I18nValue {
  lang: Language;
  dir: 'ltr' | 'rtl';
  t: (key: TranslationKey | string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue>({
  lang: 'fr',
  dir: 'ltr',
  t: (key, params) => translate('fr', key, params),
});

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t: (key, params) => translate(lang, key, params),
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}