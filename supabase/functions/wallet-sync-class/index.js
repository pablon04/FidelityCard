// Edge Function: wallet-sync-class  (POST, requiere sesion de comercio; verify_jwt=false y se
// valida aqui el JWT del usuario para poder responder al preflight CORS).
// Tras guardar la tarjeta en el panel, empuja nombre, color y logo a la clase de Google Wallet:
// cambia en todos los pases ya guardados a la vez. Recompensa y umbral se actualizan en cada
// visita (card-action). Autorizacion: RLS con el JWT del usuario (solo ve sus programas).
// Logs: solo request_id y resultado. Sin claves ni PII.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsFor, parseAllowedOrigins } from '../_shared/cors.js'
import { errorResponse, json, log } from '../_shared/errors.js'
import { checkRateLimits, hashKey } from '../_shared/rate-limit.js'
import { logoUrl } from '../_shared/enroll-map.js'
import {
  buildLoyaltyClass,
  getAccessToken,
  importPrivateKey,
  patchLoyaltyClass,
} from '../_shared/google-wallet.js'

export async function handle(req) {
  const requestId = crypto.randomUUID()
  const cors = corsFor(
    req.headers.get('origin'),
    parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS')),
  )
  const h = { ...cors.headers, 'x-request-id': requestId }
  const fail = (status, code, opts = {}) =>
    errorResponse(status, code, { ...opts, headers: { ...h, ...(opts.headers ?? {}) } })

  try {
    if (!cors.allowed) return fail(403, 'origin_not_allowed')
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
    if (req.method !== 'POST')
      return fail(405, 'method_not_allowed', { headers: { allow: 'POST, OPTIONS' } })
    if (Deno.env.get('GOOGLE_WALLET_ENABLED') !== 'true') return fail(503, 'wallet_disabled')

    const authHeader = req.headers.get('authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) return fail(401, 'unauthorized')

    const url = Deno.env.get('SUPABASE_URL')
    const userDb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY'), {
      global: { headers: { authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: u, error: ue } = await userDb.auth.getUser(jwt)
    if (ue || !u?.user) return fail(401, 'unauthorized')

    const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const salt = Deno.env.get('IP_HASH_SALT') ?? ''
    const rl = await checkRateLimits(svc, [
      { key: `ws:user:${await hashKey(salt, u.user.id)}`, window: 3600, max: 60 },
    ])
    if ('error' in rl) return fail(500, 'internal')
    if (!rl.allowed) return fail(429, 'rate_limited', { retry_after: rl.retry_after })

    // RLS: solo programas activos de comercios de este usuario.
    const { data: progs, error: pe } = await userDb
      .from('loyalty_programs')
      .select('merchant_id, card_name, brand_color, logo_path, merchants(name)')
      .eq('status', 'active')
    if (pe) {
      log(requestId, 'db_error', { pg_code: pe.code })
      return fail(500, 'internal')
    }
    if (!progs?.length) return json({ synced: 0 }, 200, h)

    const issuerId = (Deno.env.get('GOOGLE_WALLET_ISSUER_ID') ?? '').trim()
    const saEmail = (Deno.env.get('GOOGLE_WALLET_SA_EMAIL') ?? '').trim()
    const publicBaseUrl = (Deno.env.get('PUBLIC_BASE_URL') ?? '').trim()
    let key
    try {
      key = await importPrivateKey(Deno.env.get('GOOGLE_WALLET_SA_PRIVATE_KEY'))
    } catch {
      key = null
    }
    if (!issuerId || !saEmail || !publicBaseUrl || !key) {
      log(requestId, 'wallet_misconfigured')
      return fail(500, 'internal')
    }
    const auth = await getAccessToken({ saEmail, key, fetchImpl: fetch })
    if (!auth.ok) {
      log(requestId, 'google_error', { reason: auth.reason })
      return fail(500, 'internal')
    }

    const fallbackLogo =
      Deno.env.get('GOOGLE_WALLET_FALLBACK_LOGO_URL') ||
      `${publicBaseUrl.replace(/\/+$/, '')}/wallet-logo.png`
    let synced = 0
    for (const p of progs) {
      const cls = buildLoyaltyClass({
        issuerId,
        merchantId: p.merchant_id,
        merchantName: p.merchants?.name ?? p.card_name,
        cardName: p.card_name,
        color: p.brand_color,
        logoUrl: logoUrl(url ?? '', p.logo_path) ?? fallbackLogo,
      })
      const r = await patchLoyaltyClass({ cls, token: auth.token, fetchImpl: fetch })
      log(requestId, 'wallet_class_sync', r)
      if (r.ok) synced++
    }
    return json({ synced }, 200, h)
  } catch (e) {
    log(requestId, 'unhandled', { name: e?.name })
    return fail(500, 'internal')
  }
}

Deno.serve(handle)
