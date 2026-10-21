/**
 * Llamadas publicas (anon) con fetch plano: la landing NO importa supabase-js
 * (presupuesto de bundle). Todo el contrato con el backend vive aqui.
 * Contrato: ARCHITECTURE 3.1 / 3.6 y SQL 0001 (get_public_merchant, get_public_pass).
 * TODO: contrastar con docs/API-CONTRACT.md cuando exista.
 */
import { env } from '../lib/env.js'

export class ApiError extends Error {
  constructor(code, { status, retryAfter, fields } = {}) {
    super(code)
    this.code = code
    this.status = status
    this.retryAfter = retryAfter
    this.fields = fields
  }
}

async function request(url, init, timeoutMs = 15000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    throw new ApiError(e?.name === 'AbortError' ? 'timeout' : 'network')
  } finally {
    clearTimeout(t)
  }
}

const baseHeaders = () => ({
  apikey: env.supabaseAnonKey,
  Authorization: `Bearer ${env.supabaseAnonKey}`,
  'Content-Type': 'application/json',
})

async function rpc(name, args) {
  const res = await request(`${env.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new ApiError('server', { status: res.status })
  return res.json()
}

/** @returns {Promise<object|null>} comercio publico o null si no existe / inactivo */
export async function getPublicMerchant(slug) {
  const data = await rpc('get_public_merchant', { p_slug: slug })
  return data && typeof data === 'object' ? data : null
}

/** @returns {Promise<object|null>} datos del pase o null */
export async function getPublicPass(token) {
  const data = await rpc('get_public_pass', { p_token: token })
  return data && typeof data === 'object' ? data : null
}

/**
 * Alta del cliente via Edge Function enroll-customer.
 * @returns {Promise<{status:'created'|'existing_reissued'|'already_registered', passToken?:string}>}
 */
export async function enrollCustomer(payload) {
  const res = await request(`${env.supabaseUrl}/functions/v1/enroll-customer`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify(payload),
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* cuerpo no JSON */
  }
  if (!res.ok) {
    const err = body?.error ?? {}
    throw new ApiError(err.code || (res.status >= 500 ? 'server' : 'unknown'), {
      status: res.status,
      retryAfter: (err.retry_after ?? Number(res.headers.get('retry-after'))) || undefined,
      fields: err.fields,
    })
  }
  // Contrato (API-CONTRACT 1): created | existing_reissued (con pass_token) | already_registered.
  if (body?.status === 'already_registered') return { status: 'already_registered' }
  if ((body?.status === 'created' || body?.status === 'existing_reissued') && body.pass_token)
    return { status: body.status, passToken: body.pass_token }
  throw new ApiError('server', { status: res.status })
}

/**
 * Google Wallet: Edge Function google-wallet-link. POST {pass_token} -> 200 {save_url}.
 * Errores {error:{code}}: wallet_disabled(503), invalid_token(400), not_found(404),
 * rate_limited(429, retry_after), internal(500).
 */
export async function getGoogleSaveUrl(passToken) {
  const res = await request(`${env.supabaseUrl}/functions/v1/google-wallet-link`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({ pass_token: passToken }),
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* no JSON */
  }
  if (
    res.ok &&
    typeof body?.save_url === 'string' &&
    body.save_url.startsWith('https://pay.google.com/')
  )
    return body.save_url
  const err = body?.error ?? {}
  throw new ApiError(err.code || 'internal', {
    status: res.status,
    retryAfter: (err.retry_after ?? Number(res.headers.get('retry-after'))) || undefined,
  })
}

/**
 * Visita (QR/NFC de caja): Edge Function card-action. Si con la visita se completa la tarjeta,
 * el servidor da el premio y la reinicia en la misma operacion.
 * POST {slug, pass_token} -> 200 {result, balance, threshold, reward?}
 * result: visit_added | reward_earned | cooldown | not_supported.
 * Errores {error:{code}}: invalid_token(400), not_found(404), rate_limited(429), internal(500).
 */
export async function cardAction(slug, passToken) {
  const res = await request(`${env.supabaseUrl}/functions/v1/card-action`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({ slug, pass_token: passToken }),
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* no JSON */
  }
  if (res.ok && typeof body?.result === 'string') return body
  const err = body?.error ?? {}
  throw new ApiError(err.code || 'internal', {
    status: res.status,
    retryAfter: (err.retry_after ?? Number(res.headers.get('retry-after'))) || undefined,
  })
}
