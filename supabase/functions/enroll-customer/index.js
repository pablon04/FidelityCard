// Edge Function: enroll-customer  (POST, publica, verify_jwt=false)
// Contrato: docs/API-CONTRACT.md (y docs/ARCHITECTURE.md sec. 3.1, ADR-007/008).
// Flujo: CORS -> metodo/tamano -> honeypot -> validar -> Turnstile -> rate limit
//        -> version de consentimiento vigente -> rpc enroll_customer -> mapear.
// Logs: solo request_id, evento y codigos. Nunca email/telefono/IP/tokens.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsFor, parseAllowedOrigins } from '../_shared/cors.js'
import { errorResponse, json, log } from '../_shared/errors.js'
import { MAX_BODY_BYTES, isHoneypotTripped, validateEnrollBody } from '../_shared/validate.js'
import { verifyTurnstile } from '../_shared/turnstile.js'
import { checkRateLimits, enrollLimits, hashKey } from '../_shared/rate-limit.js'
import { clientIp, clientUa } from '../_shared/client-info.js'
import { mapRpcError, mapRpcSuccess } from '../_shared/enroll-map.js'

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

/** Versiones vigentes (la mas reciente por finalidad) de consent_texts. */
async function currentConsentVersions(supabase) {
  const { data, error } = await supabase
    .from('consent_texts')
    .select('purpose, version, published_at')
    .in('purpose', ['terms_privacy', 'marketing'])
    .order('published_at', { ascending: false })
  if (error || !data) return null
  const cur = {}
  for (const r of data) cur[r.purpose] ??= r.version
  return cur
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

    // Cuerpo acotado y JSON valido.
    const text = await req.text()
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES)
      return fail(413, 'payload_too_large')
    let body
    try {
      body = JSON.parse(text)
    } catch {
      return fail(400, 'validation_error', { fields: { body: 'JSON invalido.' } })
    }

    // Honeypot: respuesta 200 simulada, sin crear nada ni delatar la deteccion.
    if (isHoneypotTripped(body)) {
      log(requestId, 'honeypot')
      const token = crypto.randomUUID()
      const base = (Deno.env.get('PUBLIC_BASE_URL') ?? '').replace(/\/+$/, '')
      return json(
        { status: 'created', pass_token: token, wallet: { web_url: `${base}/p/${token}` } },
        200,
        h,
      )
    }

    const v = validateEnrollBody(body)
    if (!v.ok) return fail(400, 'validation_error', { fields: v.fields })
    const input = v.value
    const ip = clientIp(req.headers)

    // Turnstile (el token es de un solo uso: tras un error el front debe renovarlo).
    const captcha = await verifyTurnstile({
      secret: Deno.env.get('TURNSTILE_SECRET_KEY'),
      token: input.captcha_token,
      ip,
    })
    if (captcha.result === 'failed') {
      log(requestId, 'captcha_failed', { slug: input.slug })
      return fail(403, 'captcha_failed')
    }
    if (captcha.result === 'unavailable') {
      log(requestId, 'captcha_unavailable', { reason: captcha.reason, has_ip: ip !== null })
      return fail(503, 'captcha_unavailable')
    }

    const supabase = db()

    // Rate limit (fail closed si la BD falla).
    const salt = Deno.env.get('IP_HASH_SALT') ?? ''
    const rl = await checkRateLimits(
      supabase,
      enrollLimits({
        ipHash: await hashKey(salt, ip ?? 'unknown'),
        slug: input.slug,
        emailHash: await hashKey(salt, input.email),
        phoneHash: await hashKey(salt, input.phone_e164),
      }),
    )
    if ('error' in rl) {
      log(requestId, 'rate_limit_error')
      return fail(500, 'internal')
    }
    if (!rl.allowed) {
      log(requestId, 'rate_limited', { slug: input.slug })
      return fail(429, 'rate_limited', { retry_after: rl.retry_after })
    }

    // El texto aceptado debe ser el vigente (la RPC solo comprueba que exista).
    const cur = await currentConsentVersions(supabase)
    if (!cur) {
      log(requestId, 'consent_lookup_error')
      return fail(500, 'internal')
    }
    if (
      input.terms_version !== cur.terms_privacy ||
      (input.marketing_opt_in && input.marketing_version !== cur.marketing)
    ) {
      return fail(409, 'consent_outdated')
    }

    const { data, error } = await supabase.rpc('enroll_customer', {
      p_slug: input.slug,
      p_full_name: input.full_name,
      p_email: input.email,
      p_phone_e164: input.phone_e164,
      p_terms_accepted: true,
      p_terms_version: input.terms_version,
      p_marketing_opt_in: input.marketing_opt_in,
      p_marketing_version: input.marketing_version,
      p_ip: ip,
      p_user_agent: clientUa(req.headers),
      p_card_code: input.card,
    })
    if (error) {
      const m = mapRpcError(error)
      log(requestId, 'rpc_error', { slug: input.slug, code: m.code, pg_code: error.code })
      return fail(m.status, m.code, { fields: m.fields })
    }

    const mapped = mapRpcSuccess(data, {
      publicBaseUrl: Deno.env.get('PUBLIC_BASE_URL') ?? '',
      supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
      googleWalletEnabled: Deno.env.get('GOOGLE_WALLET_ENABLED') === 'true',
    })
    if (!mapped) {
      log(requestId, 'unexpected_rpc_shape')
      return fail(500, 'internal')
    }
    log(requestId, 'enroll', { slug: input.slug, status: mapped.body.status, source: input.source })
    return json(mapped.body, mapped.status, h)
  } catch (e) {
    log(requestId, 'unhandled', { name: e?.name }) // sin mensaje: podria contener datos
    return fail(500, 'internal')
  }
}

if (import.meta.main !== false) Deno.serve(handle)
