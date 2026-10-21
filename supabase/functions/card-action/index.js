// Edge Function: card-action  (POST, publica, verify_jwt=false)
// POST {slug, pass_token, action: 'visit'|'redeem'} -> 200 {result, balance, threshold, ...}
// El cliente escanea el QR/NFC de visita (/v/:slug) o de canje (/r/:slug); el token del pase
// (customer_cards.public_id) lo identifica. Logica de negocio en SQL (register_visit /
// redeem_reward, service_role). Aqui: CORS, validacion, rate limit y traduccion de errores.
// Logs: solo request_id, accion y resultado. Sin token ni PII.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsFor, parseAllowedOrigins } from '../_shared/cors.js'
import { errorResponse, json, log } from '../_shared/errors.js'
import { checkRateLimits, hashKey } from '../_shared/rate-limit.js'
import { clientIp } from '../_shared/client-info.js'
import {
  getAccessToken,
  importPrivateKey,
  loyaltyUpdate,
  objectId,
  patchLoyaltyObject,
} from '../_shared/google-wallet.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/
const RPC = { visit: 'register_visit', redeem: 'redeem_reward' }

let _supabase
function db() {
  _supabase ??= createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
  return _supabase
}

/** Refleja el nuevo saldo en el pase de Google Wallet. Nunca lanza ni cambia la respuesta. */
async function syncWallet(requestId, token, data) {
  try {
    if (Deno.env.get('GOOGLE_WALLET_ENABLED') !== 'true') return
    if (data.result !== 'visit_added' && data.result !== 'redeemed') return
    const issuerId = (Deno.env.get('GOOGLE_WALLET_ISSUER_ID') ?? '').trim()
    const saEmail = (Deno.env.get('GOOGLE_WALLET_SA_EMAIL') ?? '').trim()
    if (!issuerId || !saEmail) return
    const key = await importPrivateKey(Deno.env.get('GOOGLE_WALLET_SA_PRIVATE_KEY'))
    const auth = await getAccessToken({ saEmail, key, fetchImpl: fetch })
    if (!auth.ok) return log(requestId, 'wallet_sync', { ok: false, reason: auth.reason })
    const r = await patchLoyaltyObject({
      id: objectId(issuerId, token),
      update: loyaltyUpdate({
        type: 'visits',
        balance: data.balance,
        threshold: data.threshold,
        reward: data.reward,
      }),
      token: auth.token,
      fetchImpl: fetch,
    })
    log(requestId, 'wallet_sync', r)
  } catch (e) {
    log(requestId, 'wallet_sync', { ok: false, reason: String(e?.name ?? 'unknown') })
  }
}

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

    const raw = await req.text()
    if (raw.length > 1024) return fail(413, 'payload_too_large')
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return fail(400, 'invalid_token')
    }
    const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    const token = typeof body?.pass_token === 'string' ? body.pass_token.trim().toLowerCase() : ''
    const action = body?.action
    if (!SLUG_RE.test(slug) || !UUID_RE.test(token) || !Object.hasOwn(RPC, action))
      return fail(400, 'invalid_token')

    const supabase = db()
    const salt = Deno.env.get('IP_HASH_SALT') ?? ''
    const ipHash = await hashKey(salt, clientIp(req.headers) ?? 'unknown')
    // Limites holgados mientras se prueba; endurecer junto con visit_cooldown_minutes.
    const rl = await checkRateLimits(supabase, [
      { key: `ca:ip:${ipHash}`, window: 3600, max: 300 },
      { key: `ca:token:${await hashKey(salt, token)}`, window: 3600, max: 120 },
    ])
    if ('error' in rl) {
      log(requestId, 'rate_limit_error')
      return fail(500, 'internal')
    }
    if (!rl.allowed) return fail(429, 'rate_limited', { retry_after: rl.retry_after })

    const { data, error } = await supabase.rpc(RPC[action], { p_slug: slug, p_token: token })
    if (error || !data || typeof data !== 'object') {
      log(requestId, 'db_error', { action, pg_code: error?.code })
      return fail(500, 'internal')
    }
    if (data.result === 'not_found') return fail(404, 'not_found')

    log(requestId, 'card_action', { action, result: data.result })
    await syncWallet(requestId, token, data)
    return json(data, 200, h)
  } catch (e) {
    log(requestId, 'unhandled', { name: e?.name })
    return fail(500, 'internal')
  }
}

Deno.serve(handle)
