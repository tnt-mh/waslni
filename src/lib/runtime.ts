export type RuntimeMode = 'production' | 'demo';

const configuredMode = import.meta.env.VITE_APP_MODE?.trim().toLowerCase();
export const runtimeMode: RuntimeMode = configuredMode === 'demo' ? 'demo' : 'production';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const mapsConfigured = Boolean(import.meta.env.VITE_MAPBOX_TOKEN?.trim());
export const pushConfigured = Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim());

export const runtimeConfigError = runtimeMode === 'production' && !supabaseConfigured
  ? 'runtime.supabaseRequired'
  : null;

export function isDemoRuntime() {
  return runtimeMode === 'demo';
}
