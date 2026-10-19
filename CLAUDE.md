# FidelityCard

Tarjeta de fidelidad digital para comercios. El comercio configura su tarjeta (VISITAS o PUNTOS, umbral, recompensa, nombre/color/logo) y obtiene URL, QR y enlace NFC. El cliente final entra por NFC o QR a `/c/:slug`, se da de alta (nombre, email, teléfono + consentimiento RGPD) y recibe un pase web `/p/:token` con QR y, después, Google Wallet. Los clientes NO tienen cuenta ni login.

Documentos que mandan (en `docs/`): `ARCHITECTURE.md` (estructura y contratos), `DATA-MODEL.md` (datos), `UX.md` (pantallas y sistema de diseño), `PRD.md`. Conflictos: DATA-MODEL para datos, ARCHITECTURE para estructura.

## Stack (JavaScript, NO TypeScript)
React 19 + Vite + JSX, Tailwind 3.4 (`tailwind.config.js` lee variables CSS de `src/styles/tokens.css`), `react-router` (modo librería, lazy por ruta), `@supabase/supabase-js`. Backend: Supabase (Postgres + RLS + RPC + Edge Functions Deno). Hosting: Vercel Hobby + Supabase free (UE). Tipado solo con JSDoc. ESLint 9 + Prettier.
Previstos en fases posteriores: TanStack Query (solo panel), react-hook-form + zod, `qrcode`, `libphonenumber-js` (ES +34 por defecto), Vitest, pgTAP, Playwright.

## Estructura
- `src/app` router; `src/lib` env.js, supabase.js; `src/features/{auth,merchant,card-config,share,enroll,pass,panel}`; `src/components/ui`; `src/styles`.
- `supabase/config.toml`, `supabase/migrations/` (SQL versionado), `supabase/seed.sql`, `supabase/functions/{_shared,enroll-customer}` (solo esqueleto), `supabase/tests/` (pgTAP, pendiente).
- `docs/drafts/0001_init.sql`: borrador original, NO tocar (la migración real es `supabase/migrations/20261020000000_init.sql`).
- `panel` es un añadido sobre ADR-002 para la ruta `/app`; las pantallas del panel irán en `features/*` según la arquitectura.

## Comandos
`npm run dev` | `npm run build` | `npm run lint` | `npm run format`
Supabase (CLI instalado como devDependency, vía npx; requiere Docker Desktop en marcha): `npm run db:start`, `npm run db:reset` (aplica migraciones + seed), `npm run db:stop`, `npm run fn:serve`.
Env: copiar `.env.example` a `.env.local`. Nunca commitear `.env*` ni secretos.

## Rutas
`/c/:slug` (landing de alta), `/p/:token` (pase web), `/app/login`, `/app` (panel; guard pendiente). `/` redirige a `/app/login`.

## Decisiones clave
- Un solo `/c/:slug` para NFC y QR; origen en `?s=nfc|qr|link`. Slug inmutable (grabado en etiquetas).
- `pass_token` (API/arquitectura) = `customer_cards.public_id` (uuid) en BD y SQL. También es el contenido del QR.
- `anon` sin acceso a tablas; lo público va por RPC `SECURITY DEFINER` (`get_public_merchant`, `get_public_pass`); el alta va por Edge Function `enroll-customer` (service_role + Turnstile + rate limit) y SQL `enroll_customer`.
- Re-emisión del pase solo si coinciden email Y teléfono; si no, respuesta genérica `already_registered`.
- Consentimientos separados por finalidad (`terms_privacy` obligatorio, `marketing` opcional, fila propia).
- Auth del comercio sin confirmación de email (sin SMTP/dominio propio). Recuperación de contraseña manual en pilotos.
- Multi-tenant por `merchant_id` + `merchant_members` desde el día 1.

## Flags (todos apagados por defecto)
`APPLE_ENABLED` / `WALLET_APPLE_ENABLED` / `VITE_APPLE_WALLET_ENABLED` (=false), `EMAIL_REISSUE_ENABLED` (=false), `GOOGLE_WALLET_ENABLED` (=false hasta Fase 4). Lista completa en `.env.example`.

## Aparcado
- Apple Wallet (sin cuenta Apple Developer ni dominio propio): Fase D.
- Email transaccional (Resend free no verifica `*.vercel.app`): Fase D.
- Revisión legal/abogado: textos RGPD son PLACEHOLDER; obligatoria antes de clientes reales.
- Sumar visitas/puntos, canje, caja, KPIs: fuera de alcance (el modelo ya deja la puerta abierta).
- Vercel Hobby es no comercial; Supabase free se pausa por inactividad: revisar antes de cobrar.

## Roadmap (ARCHITECTURE.md sec. 7)
- T0-T1 (HECHO en parte): scaffold, Supabase CLI, migración base, esqueleto de funciones. Falta ejecutar la migración (requiere Docker), CI, pgTAP.
- Fase 2: comercio (auth UI, onboarding, configurar tarjeta, logo, preview, activar, compartir).
- Fase 3: alta del cliente y pase web (RPC, landing, `enroll-customer`, `/p/:token`).
- Fase 4: Google Wallet. Fase 5: endurecimiento y piloto. Fase D: Apple y email.

## Huecos conocidos entre SQL y arquitectura (resolver antes de la fase indicada)
- Faltan en la migración: `rate_limits` + `rate_limit_hit` (antes de T3.4), `activate_card` (T2.6), `wallet_events` (T4.3), `get_pass_by_token` (el SQL tiene `get_public_pass(uuid)`; usar este).
- `create_merchant(p_name, p_slug, p_legal_name, p_privacy_email) returns uuid` en SQL difiere de la firma de ARCHITECTURE 3.6; manda el SQL.
