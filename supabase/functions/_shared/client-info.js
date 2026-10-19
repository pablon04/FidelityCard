// IP y User-Agent del cliente. Supabase Edge va detras de Cloudflare.
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6 = /^[0-9a-fA-F:]{2,45}$/

/** @param {Headers} headers @returns {string|null} IP valida o null (nunca se loguea) */
export function clientIp(headers) {
  const raw =
    headers.get('cf-connecting-ip') ||
    (headers.get('x-forwarded-for') || '').split(',')[0] ||
    headers.get('x-real-ip') ||
    ''
  const ip = raw.trim()
  if (IPV4.test(ip) && ip.split('.').every((n) => Number(n) <= 255)) return ip
  if (ip.includes(':') && IPV6.test(ip)) return ip
  return null
}

/** @param {Headers} headers @returns {string|null} UA truncado a 400 (limite de consents) */
export function clientUa(headers) {
  const ua = (headers.get('user-agent') || '').trim()
  return ua ? ua.slice(0, 400) : null
}
