import type { Language } from './types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const LOCALES: Record<Language, string> = { fr: 'fr-DZ', ar: 'ar-DZ', en: 'en-GB' };

export function formatPrice(amount: number, lang: Language): string {
  const n = new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: 0 }).format(amount);
  return lang === 'ar' ? `${n} دج` : `${n} DA`;
}

export function formatNumber(n: number, lang: Language): string {
  return new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: 1 }).format(n);
}

export function formatDate(iso: string, lang: Language, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALES[lang], opts ?? { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

export function formatTime(iso: string, lang: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALES[lang], { hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatDateTime(iso: string, lang: Language): string {
  return `${formatDate(iso, lang)} · ${formatTime(iso, lang)}`;
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayInputValue(): string {
  return toDateInputValue(new Date());
}

export function addDaysInputValue(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-()]/g, '');
  let m = digits.match(/^(?:\+213|00213|0)([5-7]\d{8})$/);
  if (m) return `+213${m[1]}`;
  m = digits.match(/^213([5-7]\d{8})$/);
  if (m) return `+213${m[1]}`;
  return null;
}

export function formatPhone(phone: string | null, lang: Language): string {
  if (!phone) return '—';
  const m = phone.match(/^\+213(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return phone;
  const local = `0${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}`;
  return lang === 'en' ? phone.replace('+213', '+213 ') : local;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generatePin(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(1000 + (arr[0] % 9000));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateDurationMin(km: number): number {
  return Math.max(20, Math.round((km / 72) * 60 + 10));
}

export function estimateSoloCost(km: number): number {
  return Math.round((km * 9 + 150) / 10) * 10;
}

export function estimateCo2SavedKg(km: number, seatsShared: number): number {
  const soloKg = km * 0.17;
  const sharedKg = soloKg / Math.max(1, seatsShared + 1);
  return Math.round((soloKg - sharedKg) * 10) / 10;
}

export function compressImage(file: File, maxDim = 900, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image-failed'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas-failed'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function haptic(pattern: number | number[] = 12): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* not supported */
  }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function timeAgo(iso: string, lang: Language): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  const rtf = new Intl.RelativeTimeFormat(LOCALES[lang], { numeric: 'auto' });
  if (min < 1) return rtf.format(0, 'minute');
  if (min < 60) return rtf.format(-min, 'minute');
  const hours = Math.round(min / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, 'day');
  return formatDate(iso, lang);
}