# API-CONTRACT (consumido por el front)

Fuente de verdad: firmas reales de `supabase/migrations/20261020000000_init.sql` (0001) y `20261021000000_0002_support.sql` (0002) y `supabase/functions/enroll-customer`. Donde difiere de ARCHITECTURE.md sec. 3, **manda este documento**.

Errores de RPC (supabase-js): `error.message` lleva el codigo (ej. `forbidden_or_not_found`) y `error.code` el SQLSTATE.

## 1. Edge Function `POST {SUPABASE_URL}/functions/v1/enroll-customer`

Publica (`verify_jwt=false`). Enviar `Content-Type: application/json` (con `supabase.functions.invoke` basta). CORS: solo origenes de `ALLOWED_ORIGINS`.

Request (max 8 KB):
```json
{ "slug": "cafe-luna-x7k2", "full_name": "Ana Perez", "email": "ana@example.com",
  "phone": "600 11 22 33", "consent": true, "consent_version": "2026-10-v1",
  "marketing_opt_in": false, "marketing_version": "2026-10-v1",
  "captcha_token": "<turnstile>", "source": "nfc", "website": "" }
```
- `full_name` 2-100; `email` <=254; `phone` libre, se normaliza a E.164 con ES (+34) por defecto (acepta `+44...`, `0044...`).
- `consent` debe ser `true`; `consent_version` = `consents.terms_privacy.version` de `get_public_merchant`.
- `marketing_opt_in` opcional (false). Si `true`, `marketing_version` obligatorio (= `consents.marketing.version`).
- `source` nfc|qr|link (default link; hoy solo se valida/loguea, no se persiste).
- `website` = honeypot: campo oculto (`tabindex=-1`, `autocomplete=off`), debe ir vacio. Si viene relleno la funcion responde 200 `created` falso (el pass_token no existe).
- `captcha_token` es de un solo uso: tras CUALQUIER error hay que resetear el widget de Turnstile.

Response 200 (`x-request-id` en cabeceras):
```json
{ "status": "created" | "existing_reissued",
  "pass_token": "uuid",
  "card": { "merchant_name": "Cafe Luna", "color": "#7a3b1e", "logo_url": "https://.../merchant-logos/<id>/logo.png" | null },
  "wallet": { "web_url": "https://<app>/p/<pass_token>", "google_url_endpoint": "solo si GOOGLE_WALLET_ENABLED=true" } }
```
```json
{ "status": "already_registered", "message": "texto neutro para mostrar" }
```
`already_registered` = coincide solo email o solo telefono (o clientes distintos): sin token ni datos. `existing_reissued` = email Y telefono del mismo cliente (mismo token de siempre).

Errores: `{ "error": { "code", "message", "fields"?: {campo: msg}, "retry_after"?: seg } }`

| HTTP | code | Cuando |
|---|---|---|
| 400 | `validation_error` | `fields` por campo (slug, full_name, email, phone, consent, consent_version, marketing_*, captcha_token, source, body) |
| 403 | `captcha_failed` | Turnstile rechazado |
| 403 | `origin_not_allowed` | Origin fuera de `ALLOWED_ORIGINS` |
| 404 | `card_not_found` | slug inexistente o tarjeta no activa |
| 405 / 413 | `method_not_allowed` / `payload_too_large` | |
| 409 | `consent_outdated` | version no vigente: recargar `get_public_merchant` y reintentar |
| 429 | `rate_limited` | `retry_after` en segundos (y cabecera `retry-after`). Limites: IP 10/h, comercio 300/h, email 3/dia, telefono 3/dia |
| 503 | `captcha_unavailable` | Turnstile no responde / mal configurado |
| 500 | `internal` | sin detalles |

## 1b. Edge Function `POST {SUPABASE_URL}/functions/v1/google-wallet-link`

Publica (`verify_jwt=false`), mismo CORS que enroll-customer. Pasos de puesta en marcha: `docs/GOOGLE-WALLET-SETUP.md`.

Request: `{ "pass_token": "<uuid = pass_token / customer_cards.public_id>" }`
Response 200: `{ "save_url": "https://pay.google.com/gp/v/save/<jwt>" }` (abrir en el movil Android; en modo demo solo funciona para usuarios de prueba).
Errores `{ "error": { "code", "message", "retry_after"? } }`:

| HTTP | code | Cuando |
|---|---|---|
| 503 | `wallet_disabled` | `GOOGLE_WALLET_ENABLED` != `true` (mostrar solo el pase web) |
| 400 | `invalid_token` | body no JSON o `pass_token` no es uuid |
| 404 | `not_found` | token inexistente o tarjeta bloqueada |
| 429 | `rate_limited` | `retry_after` en segundos (60/h por IP, 10/h por IP+token) |
| 500 | `internal` | fallo de BD o de Google (detalle solo en logs) |
| 403/405 | `origin_not_allowed` / `method_not_allowed` | |

Idempotente: crea la clase del comercio y el objeto del cliente si no existen (409 = actualiza). Contenido: comercio, color, logo (bucket publico o `GOOGLE_WALLET_FALLBACK_LOGO_URL`, por defecto `<PUBLIC_BASE_URL>/wallet-logo.png`: el front debe publicar ese fichero), titular, progreso `X/Y`, recompensa y QR con `<PUBLIC_BASE_URL>/p/<token>`.

## 2. RPC publicas (rol `anon`) - `supabase.rpc(...)`

### `get_public_merchant(p_slug text)` -> jsonb | `null`
`null` si el slug no existe o no tiene tarjeta activa (tratar como "No encontramos esta tarjeta").
```json
{ "slug": "...", "name": "Cafe Luna", "legal_name": null|"...", "privacy_email": null|"...",
  "card": { "card_name": "...", "type": "visits|points", "threshold": 8,
            "reward_description": "...", "brand_color": "#RRGGBB", "logo_path": null|"<merchant_id>/x.png" },
  "consents": { "terms_privacy": { "version": "2026-10-v1", "body": "... {{merchant_name}} ..." },
                "marketing":     { "version": "2026-10-v1", "body": "..." } } }
```
Sin `logo_url`, sin `tax_id`, sin `points_per_currency`. `body` contiene placeholders `{{merchant_name}}`, `{{legal_name}}`, `{{privacy_email}}` (los dos ultimos pueden ser null: mostrar un texto alternativo): sustituir en el cliente. Tras la migracion 0003 la version vigente es `2026-10-v2` (textos de UX.md 3.4, borrador sin revision legal; el `body` de terms_privacy incluye la primera capa informativa; la segunda capa es contenido estatico del front). Leer siempre la version de la RPC, no fijarla en codigo.

### `get_public_pass(p_token uuid)` -> jsonb | `null`
`p_token` = `pass_token`. `null` si no existe (o cliente borrado).
```json
{ "token": "uuid", "balance": 0, "status": "active|blocked", "merchant_name": "...", "slug": "...",
  "card": { "card_name","type","threshold","reward_description","brand_color","logo_path" } }
```
No hay nombre del cliente ni `serial` (el QR codifica el `token`).

### Logo
`logo_path` -> URL publica: `supabase.storage.from('merchant-logos').getPublicUrl(logo_path).data.publicUrl` (= `<SUPABASE_URL>/storage/v1/object/public/merchant-logos/<logo_path>`). Bucket publico de lectura, 1 MB, png/jpeg/webp.

## 3. Comercio autenticado (rol `authenticated`)

- `create_merchant(p_name text, p_slug text, p_legal_name text default null, p_privacy_email text default null)` -> `uuid` (merchant_id). **No crea tarjeta**: el front inserta el programa. Errores: `not_authenticated` (28000), `merchant_already_exists` (23505), slug duplicado (23505, `merchants_slug_uidx`), slug/nombre/email invalido (23514).
- `activate_card(p_card_id uuid)` -> jsonb (fila de `loyalty_programs`). `p_card_id` = `loyalty_programs.id`. Archiva la activa anterior; idempotente. Errores: `not_authenticated` (28000), `forbidden_or_not_found` (42501), `type_locked` (23514: la activa actual tiene clientes y la nueva es de otro tipo).
- `erase_customer(p_customer_id uuid)` -> void. Error `forbidden_or_not_found` (42501).
- `erase_merchant(p_merchant_id uuid, p_confirm_slug text)` -> `{ "customers_erased": n }`. Error `forbidden_or_not_found` (42501). No borra logos de Storage ni el usuario auth.

### Acceso directo por RLS (supabase-js)
- SELECT: `merchants`, `merchant_members`, `loyalty_programs`, `consent_texts`, `customers`, `customer_cards`, `consents`, `loyalty_ledger` (clientes/tarjetas/consents/ledger solo owner).
- UPDATE `merchants`: `name, legal_name, tax_id, privacy_email` (nunca `slug`).
- INSERT/UPDATE `loyalty_programs`: `merchant_id, type, threshold, points_per_currency, reward_description, visit_cooldown_minutes, card_name, brand_color, logo_path, status`. Reglas:
  - Crear siempre como `draft` (default). **Poner `status='active'` directamente falla (`use_activate_card`, 42501): usar `activate_card`.** `archived` si se puede poner directamente.
  - `visits` => `points_per_currency` NULL; `points` => > 0. `threshold` 1..100000.
  - `type` no cambia si ya hay clientes inscritos (23514).
  - `logo_path` debe empezar por `<merchant_id>/` (si no, `invalid_logo_path` 22023). Subir a Storage en `merchant-logos/<merchant_id>/<fichero>`.
- Sin acceso a `wallet_passes`, `rate_limits`, `wallet_events` (solo service_role).
