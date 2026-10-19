/** Variables publicas del frontend (prefijo VITE_). Ver .env.example. */
const TURNSTILE_TEST_KEY = '1x00000000000000000000AA'

export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  publicBaseUrl: import.meta.env.VITE_PUBLIC_BASE_URL ?? '',
  // En desarrollo, sin clave configurada, se usa la clave de prueba de Cloudflare.
  turnstileSiteKey:
    import.meta.env.VITE_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? TURNSTILE_TEST_KEY : ''),
  appleWalletEnabled: import.meta.env.VITE_APPLE_WALLET_ENABLED === 'true',
  googleWalletEnabled: import.meta.env.VITE_GOOGLE_WALLET_ENABLED === 'true',
  appEnv: import.meta.env.VITE_APP_ENV ?? 'local',
}

/** URL publica base (para QR y enlaces). Cae al origen actual si no hay variable. */
export const publicBase = () => (env.publicBaseUrl || window.location.origin).replace(/\/$/, '')
