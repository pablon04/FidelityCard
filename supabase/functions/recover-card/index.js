// Edge Function: recover-card  (POST, publica, verify_jwt=false)
// POST {slug, email, phone, captcha_token} -> 200 {pass_token} | 404 not_found (generico).
// El cliente perdio su pase y lo recupera con email + telefono (deben ser del MISMO cliente).
// Flujo: CORS -> metodo/tamano -> validar -> Turnstile -> rate limit -> rpc recover_card.
// Logs: solo request_id, evento y codigos. Nunca email/telefono/IP/tokens.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsFor, parseAllowedOrigins } from '../_shared/cors.js'
import { errorResponse, json, log } from '../_shared/errors.js'
import { verifyTurnstile } from '../_shared/turnstile.js'
import { checkRateLimits, hashKey } from '../_shared/rate-limit.js'
import { clientIp } from '../_shared/client-info.js'
import { normalizePhone } from '../_shared/phone.js'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const HOUR = 3600
const DAY = 86400

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
    if (raw.length > 8192) return fail(413, 'payload_too_large')
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return fail(400, 'validation_error')
    }

    const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const phone = normalizePhone(body?.phone, 'ES')
    const captchaToken = typeof body?.captcha_token === 'string' ? body.captcha_token : ''
    const fields = {}
    if (!SLUG_RE.test(slug)) fields.slug = 'Enlace no valido.'
    if (email.length > 254 || !EMAIL_RE.test(email)) fields.email = 'Email no valido.'
    if (!phone.ok) fields.phone = 'Telefono no valido.'
    if (captchaToken.length < 1 || captchaToken.length > 4096)
      fields.captcha_token = 'Verificacion requerida.'
    if (Object.keys(fields).length) return fail(400, 'validation_error', { fields })

    const ip = clientIp(req.headers)
    const captcha = await verifyTurnstile({
      secret: Deno.env.get('TURNSTILE_SECRET_KEY'),
      token: captchaToken,
      ip,
    })
    if (captcha.result === 'failed') return fail(403, 'captcha_failed')
    if (captcha.result === 'unavailable') {
      log(requestId, 'captcha_unavailable', { reason: captcha.reason })
      return fail(503, 'captcha_unavailable')
    }

    // Estricto: es una puerta para obtener el token de una tarjeta ajena si se adivinan los datos.
    const supabase = db()
    const salt = Deno.env.get('IP_HASH_SALT') ?? ''
    const rl = await checkRateLimits(supabase, [
      { key: `rc:ip:${await hashKey(salt, ip ?? 'unknown')}`, window: HOUR, max: 10 },
      { key: `rc:email:${await hashKey(salt, email)}`, window: DAY, max: 5 },
      { key: `rc:phone:${await hashKey(salt, phone.e164)}`, window: DAY, max: 5 },
    ])
    if ('error' in rl) {
      log(requestId, 'rate_limit_error')
      return fail(500, 'internal')
    }
    if (!rl.allowed) return fail(429, 'rate_limited', { retry_after: rl.retry_after })

    const { data, error } = await supabase.rpc('recover_card', {
      p_slug: slug,
      p_email: email,
      p_phone_e164: phone.e164,
    })
    if (error) {
      log(requestId, 'db_error', { pg_code: error.code })
      return fail(500, 'internal')
    }
    log(requestId, 'recover_card', { slug, found: !!data })
    if (!data) return fail(404, 'not_found')
    return json({ pass_token: data }, 200, h)
  } catch (e) {
    log(requestId, 'unhandled', { name: e?.name })
    return fail(500, 'internal')
  }
}

if (import.meta.main !== false) Deno.serve(handle)
