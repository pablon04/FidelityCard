// Edge Function: send-promotion  (POST, requiere sesion de comercio; verify_jwt=false y el JWT
// se valida aqui para responder al preflight CORS).
// POST {title, text, code?, customer_ids[]} -> 200 {promotion_id, total, sent, failed, skipped}
// Envia un mensaje con notificacion a la tarjeta de Google Wallet de cada cliente elegido.
// Autorizacion: RLS con el JWT del usuario (solo ve sus clientes). Escritura con service_role.
// PROMO_REQUIRE_MARKETING_CONSENT=true => salta a quien no tenga consentimiento de marketing
// vigente (apagado en pruebas; ACTIVAR antes de clientes reales). Sin tope de frecuencia aun.
// Logs: solo request_id, contadores y motivos. Sin PII ni textos del mensaje.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsFor, parseAllowedOrigins } from '../_shared/cors.js'
import { errorResponse, json, log } from '../_shared/errors.js'
import { checkRateLimits, hashKey } from '../_shared/rate-limit.js'
import {
  addObjectMessage,
  getAccessToken,
  importPrivateKey,
  objectId,
} from '../_shared/google-wallet.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_RECIPIENTS = 500
const CONCURRENCY = 5

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

    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return fail(401, 'unauthorized')

    const raw = await req.text()
    if (raw.length > 40000) return fail(413, 'payload_too_large')
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return fail(400, 'validation_error')
    }
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    const ids = Array.isArray(body?.customer_ids) ? [...new Set(body.customer_ids)] : []
    const fields = {}
    if (title.length < 1 || title.length > 60) fields.title = 'invalid'
    if (text.length < 1 || text.length > 300) fields.text = 'invalid'
    if (code.length > 30) fields.code = 'invalid'
    if (ids.length < 1 || ids.length > MAX_RECIPIENTS || !ids.every((i) => UUID_RE.test(i)))
      fields.customer_ids = 'invalid'
    if (Object.keys(fields).length) return fail(400, 'validation_error', { fields })

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
      { key: `promo:user:${await hashKey(salt, u.user.id)}`, window: 3600, max: 30 },
    ])
    if ('error' in rl) return fail(500, 'internal')
    if (!rl.allowed) return fail(429, 'rate_limited', { retry_after: rl.retry_after })

    // RLS: solo clientes de comercios de este usuario.
    const { data: rows, error: ce } = await userDb
      .from('customers')
      .select('id, merchant_id, customer_cards(public_id, status)')
      .in('id', ids)
    if (ce) {
      log(requestId, 'db_error', { step: 'customers', pg_code: ce.code })
      return fail(500, 'internal')
    }
    if (!rows?.length) return fail(404, 'not_found')
    const merchantId = rows[0].merchant_id
    if (rows.some((r) => r.merchant_id !== merchantId)) return fail(400, 'validation_error')

    // Consentimiento de marketing (opcional segun flag).
    let allowed = new Set(rows.map((r) => r.id))
    if (Deno.env.get('PROMO_REQUIRE_MARKETING_CONSENT') === 'true') {
      const { data: cons, error: ke } = await svc
        .from('consents')
        .select('customer_id')
        .eq('purpose', 'marketing')
        .is('revoked_at', null)
        .in('customer_id', [...allowed])
      if (ke) return fail(500, 'internal')
      allowed = new Set(cons.map((c) => c.customer_id))
    }

    const issuerId = (Deno.env.get('GOOGLE_WALLET_ISSUER_ID') ?? '').trim()
    const saEmail = (Deno.env.get('GOOGLE_WALLET_SA_EMAIL') ?? '').trim()
    let key
    try {
      key = await importPrivateKey(Deno.env.get('GOOGLE_WALLET_SA_PRIVATE_KEY'))
    } catch {
      key = null
    }
    if (!issuerId || !saEmail || !key) {
      log(requestId, 'wallet_misconfigured')
      return fail(500, 'internal')
    }
    const auth = await getAccessToken({ saEmail, key, fetchImpl: fetch })
    if (!auth.ok) {
      log(requestId, 'google_error', { reason: auth.reason })
      return fail(500, 'internal')
    }

    const messageBody = code ? `${text}\n\nCódigo: ${code}` : text
    const results = []
    const todo = rows.filter((r) => r.customer_cards?.[0]?.status === 'active')
    for (const r of rows) {
      if (!todo.includes(r) || !allowed.has(r.id))
        results.push({
          customer_id: r.id,
          status: 'skipped',
          error_code: !allowed.has(r.id) ? 'no_consent' : 'no_card',
        })
    }
    const queue = todo.filter((r) => allowed.has(r.id))
    let next = 0
    const worker = async () => {
      while (next < queue.length) {
        const r = queue[next++]
        const res = await addObjectMessage({
          id: objectId(issuerId, r.customer_cards[0].public_id),
          header: title,
          body: messageBody,
          messageId: crypto.randomUUID(),
          token: auth.token,
          fetchImpl: fetch,
        })
        results.push(
          res.ok
            ? { customer_id: r.id, status: 'sent' }
            : { customer_id: r.id, status: 'failed', error_code: res.reason },
        )
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))

    const count = (s) => results.filter((x) => x.status === s).length
    const { data: promo, error: pe } = await svc
      .from('promotions')
      .insert({
        merchant_id: merchantId,
        title,
        body: text,
        code: code || null,
        sent_by: u.user.id,
        total: results.length,
        sent: count('sent'),
        failed: count('failed'),
      })
      .select('id')
      .single()
    if (pe) {
      log(requestId, 'db_error', { step: 'promotion', pg_code: pe.code })
      return fail(500, 'internal')
    }
    const { error: de } = await svc
      .from('promotion_deliveries')
      .insert(results.map((x) => ({ ...x, promotion_id: promo.id, merchant_id: merchantId })))
    if (de) log(requestId, 'db_error', { step: 'deliveries', pg_code: de.code })

    const reasons = {}
    for (const x of results)
      if (x.error_code) reasons[x.error_code] = (reasons[x.error_code] ?? 0) + 1
    log(requestId, 'promotion_sent', {
      total: results.length,
      sent: count('sent'),
      failed: count('failed'),
      reasons,
    })
    return json(
      {
        promotion_id: promo.id,
        total: results.length,
        sent: count('sent'),
        failed: count('failed'),
        skipped: count('skipped'),
      },
      200,
      h,
    )
  } catch (e) {
    log(requestId, 'unhandled', { name: e?.name })
    return fail(500, 'internal')
  }
}

Deno.serve(handle)
