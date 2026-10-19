// Verificacion server-side de Cloudflare Turnstile.
// Para desarrollo basta configurar TURNSTILE_SECRET_KEY con la secret de prueba
// de Cloudflare (1x0000000000000000000000000000000AA: siempre valida).
// Devuelve { result, reason }; `reason` es diagnostico SIN secretos ni token:
//   ok | rejected | no_secret | http_<status> | timeout | fetch_error:<name> | bad_json
export const TURNSTILE_TEST_SECRET_PASS = '1x0000000000000000000000000000000AA'
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v1/siteverify'

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6 = /^[0-9a-fA-F:.]{2,45}$/
/** Solo se envia remoteip si es una IP sintacticamente valida (es opcional en Cloudflare). */
export function validRemoteIp(ip) {
  if (typeof ip !== 'string') return false
  if (IPV4.test(ip)) return ip.split('.').every((n) => Number(n) <= 255)
  return ip.includes(':') && IPV6.test(ip)
}

/**
 * @param {{ secret: string|undefined, token: string, ip: string|null, fetchImpl?: typeof fetch, timeoutMs?: number }} p
 * @returns {Promise<{ result: 'ok'|'failed'|'unavailable', reason: string }>}
 */
export async function verifyTurnstile({ secret, token, ip, fetchImpl, timeoutMs = 5000 }) {
  const doFetch = fetchImpl ?? globalThis.fetch
  const sec = (secret ?? '').trim() // por si el secret se guardo con salto de linea/espacios
  if (!sec) return { result: 'unavailable', reason: 'no_secret' }
  const form = new URLSearchParams({ secret: sec, response: token })
  if (validRemoteIp(ip)) form.set('remoteip', ip)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await doFetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form.toString(),
      signal: ctrl.signal,
    })
    if (!res.ok) return { result: 'unavailable', reason: `http_${res.status}` }
    let data
    try {
      data = JSON.parse(await res.text())
    } catch {
      return { result: 'unavailable', reason: 'bad_json' }
    }
    return data && data.success === true
      ? { result: 'ok', reason: 'ok' }
      : { result: 'failed', reason: 'rejected' }
  } catch (e) {
    if (e?.name === 'AbortError') return { result: 'unavailable', reason: 'timeout' }
    return { result: 'unavailable', reason: `fetch_error:${String(e?.name ?? 'unknown').slice(0, 40)}` }
  } finally {
    clearTimeout(t)
  }
}
