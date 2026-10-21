// Edge Function: google-wallet-link  (POST, publica, verify_jwt=false)
// Contrato: docs/API-CONTRACT.md sec. 2b. POST {pass_token} -> 200 {save_url}.
// Flujo: CORS -> flag -> JSON -> uuid -> rate limit -> BD (service_role) -> Google
//        (clase + objeto idempotentes) -> JWT savetowallet -> wallet_passes/wallet_events.
// Logs: solo request_id, evento, motivo/codigo HTTP de Google. Sin claves ni PII.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsFor, parseAllowedOrigins } from '../_shared/cors.js'
import { errorResponse, json, log } from '../_shared/errors.js'
import { checkRateLimits, hashKey } from '../_shared/rate-limit.js'
import { clientIp } from '../_shared/client-info.js'
import { logoUrl } from '../_shared/enroll-map.js'
import {
  UUID_RE,
  buildLoyaltyClass,
  buildLoyaltyObject,
  buildSaveUrl,
  classId,
  ensureResource,
  getAccessToken,
  importPrivateKey,
  objectId,
} from '../_shared/google-wallet.js'

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

/** Evento de wallet; best effort, nunca rompe la respuesta. */
async function walletEvent(supabase, merchantId, cardId, event, errorCode = null) {
  try {
    await supabase.from('wallet_events').insert({
      merchant_id: merchantId,
      card_id: cardId,
      platform: 'google',
      event,
      error_code: errorCode,
    })
  } catch {
    /* ignorar */
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
    if (Deno.env.get('GOOGLE_WALLET_ENABLED') !== 'true') return fail(503, 'wallet_disabled')

    const raw = await req.text()
    if (raw.length > 1024) return fail(400, 'invalid_token')
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return fail(400, 'invalid_token')
    }
    const token = typeof body?.pass_token === 'string' ? body.pass_token.trim().toLowerCase() : ''
    if (!UUID_RE.test(token)) return fail(400, 'invalid_token')

    const supabase = db()
    const salt = Deno.env.get('IP_HASH_SALT') ?? ''
    const ipHash = await hashKey(salt, clientIp(req.headers) ?? 'unknown')
    const rl = await checkRateLimits(supabase, [
      { key: `gw:ip:${ipHash}`, window: 3600, max: 60 },
      { key: `gw:ip-token:${await hashKey(salt, `${ipHash}:${token}`)}`, window: 3600, max: 10 },
    ])
    if ('error' in rl) {
      log(requestId, 'rate_limit_error')
      return fail(500, 'internal')
    }
    if (!rl.allowed) return fail(429, 'rate_limited', { retry_after: rl.retry_after })

    // Lectura minima: solo lo necesario para pintar el pase de ESTE token.
    const { data: card, error: e1 } = await supabase
      .from('customer_cards')
      .select('id, merchant_id, customer_id, program_id, balance, status')
      .eq('public_id', token)
      .maybeSingle()
    if (e1) {
      log(requestId, 'db_error', { step: 'card', pg_code: e1.code })
      return fail(500, 'internal')
    }
    if (!card || card.status !== 'active') return fail(404, 'not_found')

    const [cust, prog, merch] = await Promise.all([
      supabase.from('customers').select('full_name').eq('id', card.customer_id).maybeSingle(),
      supabase
        .from('loyalty_programs')
        .select('type, threshold, reward_description, card_name, brand_color, logo_path')
        .eq('id', card.program_id)
        .maybeSingle(),
      supabase.from('merchants').select('name').eq('id', card.merchant_id).maybeSingle(),
    ])
    if (cust.error || prog.error || merch.error || !cust.data || !prog.data || !merch.data) {
      log(requestId, 'db_error', { step: 'details' })
      return fail(500, 'internal')
    }

    // Configuracion Google.
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
      log(requestId, 'wallet_misconfigured', {
        issuer: !!issuerId,
        sa: !!saEmail,
        base: !!publicBaseUrl,
        key: !!key,
      })
      return fail(500, 'internal')
    }

    const fallbackLogo =
      Deno.env.get('GOOGLE_WALLET_FALLBACK_LOGO_URL') ||
      `${publicBaseUrl.replace(/\/+$/, '')}/wallet-logo.png`
    const logo = logoUrl(Deno.env.get('SUPABASE_URL') ?? '', prog.data.logo_path) ?? fallbackLogo

    const auth = await getAccessToken({ saEmail, key, fetchImpl: fetch })
    if (!auth.ok) {
      log(requestId, 'google_error', { reason: auth.reason })
      await walletEvent(supabase, card.merchant_id, card.id, 'error', auth.reason)
      return fail(500, 'internal')
    }

    const cls = buildLoyaltyClass({
      issuerId,
      merchantId: card.merchant_id,
      merchantName: merch.data.name,
      cardName: prog.data.card_name,
      color: prog.data.brand_color,
      logoUrl: logo,
    })
    const obj = buildLoyaltyObject({
      issuerId,
      merchantId: card.merchant_id,
      token,
      customerName: cust.data.full_name,
      type: prog.data.type,
      balance: card.balance,
      threshold: prog.data.threshold,
      reward: prog.data.reward_description,
      publicBaseUrl,
    })

    for (const [kind, id, b] of [
      ['class', cls.id, cls],
      ['object', obj.id, obj],
    ]) {
      const r = await ensureResource({ kind, id, body: b, token: auth.token, fetchImpl: fetch })
      if (!r.ok) {
        log(requestId, 'google_error', { reason: r.reason })
        await walletEvent(supabase, card.merchant_id, card.id, 'error', r.reason)
        return fail(500, 'internal')
      }
      if (r.updated === false) log(requestId, 'google_update_failed', { kind })
    }

    const save_url = await buildSaveUrl({ saEmail, key, objectId: obj.id })

    // Registro del pase (idempotente por UNIQUE(card_id, platform)) y evento.
    const { error: pe } = await supabase.from('wallet_passes').upsert(
      {
        merchant_id: card.merchant_id,
        card_id: card.id,
        platform: 'google',
        google_object_id: objectId(issuerId, token),
      },
      { onConflict: 'card_id,platform' },
    )
    if (pe) log(requestId, 'wallet_pass_upsert_error', { pg_code: pe.code })
    await walletEvent(supabase, card.merchant_id, card.id, 'save_url_issued')

    log(requestId, 'google_wallet_link', { class: classId(issuerId, card.merchant_id) })
    return json({ save_url }, 200, h)
  } catch (e) {
    log(requestId, 'unhandled', { name: e?.name })
    return fail(500, 'internal')
  }
}

Deno.serve(handle)
