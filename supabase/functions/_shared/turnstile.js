// Verificacion server-side de Cloudflare Turnstile.
// Para desarrollo basta configurar TURNSTILE_SECRET_KEY con la secret de prueba
// de Cloudflare (1x0000000000000000000000000000000AA: siempre valida); se
// llama igualmente a siteverify, sin ramas especiales.
export const TURNSTILE_TEST_SECRET_PASS = '1x0000000000000000000000000000000AA'
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v1/siteverify'

/**
 * @param {{ secret: string|undefined, token: string, ip: string|null, fetchImpl?: typeof fetch, timeoutMs?: number }} p
 * @returns {Promise<'ok'|'failed'|'unavailable'>}
 */
export async function verifyTurnstile({ secret, token, ip, fetchImpl = fetch, timeoutMs = 5000 }) {
  if (!secret) return 'unavailable' // mal configurado: cierra el alta
  const form = new URLSearchParams({ secret, response: token })
  if (ip) form.set('remoteip', ip)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(VERIFY_URL, { method: 'POST', body: form, signal: ctrl.signal })
    if (!res.ok) return 'unavailable'
    const data = await res.json()
    return data && data.success === true ? 'ok' : 'failed'
  } catch {
    return 'unavailable'
  } finally {
    clearTimeout(t)
  }
}
