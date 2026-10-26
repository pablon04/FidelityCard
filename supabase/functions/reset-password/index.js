// Edge Function: reset-password  (POST, publica, verify_jwt=false)
// El equipo genera un codigo temporal en /admin y se lo pasa al comercio (SQL 0014).
//   POST {action:'verify', email, code}                  -> 200 {ok:true} | 400 invalid_code
//   POST {action:'reset',  email, code, password}        -> 200 {ok:true} | 400 invalid_code
// 'reset' canjea el codigo (un solo uso) y cambia la contrasena con auth.admin (service_role).
// Flujo: CORS -> metodo/tamano -> validar -> rate limit -> rpc verify_password_reset.
// Logs: solo request_id, evento y codigos. Nunca email/codigo/contrasena/IP.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsFor, parseAllowedOrigins } from '../_shared/cors.js'
import { errorResponse, json, log } from '../_shared/errors.js'
import { checkRateLimits, hashKey } from '../_shared/rate-limit.js'
import { clientIp } from '../_shared/client-info.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const CODE_RE = /^[A-Za-z0-9]{8}$/
const HOUR = 3600

let _supabase
function db() {
  _supabase ??= createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
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
    if (raw.length > 4096) return fail(413, 'payload_too_large')
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return fail(400, 'validation_error')
    }

    const action = body?.action
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (action !== 'verify' && action !== 'reset') return fail(400, 'validation_error')
    // Formato invalido = mismo error que codigo incorrecto (no da pistas).
    if (email.length > 254 || !EMAIL_RE.test(email) || !CODE_RE.test(code))
      return fail(400, 'invalid_code')
    if (action === 'reset' && (password.length < 8 || password.length > 72))
      return fail(400, 'validation_error', {
        fields: { password: 'La contrasena necesita entre 8 y 72 caracteres.' },
      })

    const supabase = db()
    const salt = Deno.env.get('IP_HASH_SALT') ?? ''
    const ip = clientIp(req.headers)
    const rl = await checkRateLimits(supabase, [
      { key: `pr:ip:${await hashKey(salt, ip ?? 'unknown')}`, window: HOUR, max: 30 },
      { key: `pr:email:${await hashKey(salt, email)}`, window: HOUR, max: 20 },
    ])
    if ('error' in rl) {
      log(requestId, 'rate_limit_error')
      return fail(500, 'internal')
    }
    if (!rl.allowed) return fail(429, 'rate_limited', { retry_after: rl.retry_after })

    const { data: userId, error } = await supabase.rpc('verify_password_reset', {
      p_email: email,
      p_code: code,
      p_consume: action === 'reset',
    })
    if (error) {
      log(requestId, 'db_error', { pg_code: error.code })
      return fail(500, 'internal')
    }
    if (!userId) {
      log(requestId, 'invalid_code', { action })
      return fail(400, 'invalid_code')
    }
    if (action === 'verify') return json({ ok: true }, 200, h)

    const { error: upErr } = await supabase.auth.admin.updateUserById(userId, { password })
    if (upErr) {
      log(requestId, 'update_user_error', { status: upErr.status })
      return fail(
        upErr.status === 422 ? 400 : 500,
        upErr.status === 422 ? 'weak_password' : 'internal',
      )
    }
    log(requestId, 'password_reset')
    return json({ ok: true }, 200, h)
  } catch (e) {
    log(requestId, 'unhandled', { name: e?.name })
    return fail(500, 'internal')
  }
}

if (import.meta.main !== false) Deno.serve(handle)
