// Rate limiting (ADR-007) sobre la RPC rate_limit_hit (migracion 0002).
// Claves con hash+sal: nunca IP/email/telefono en claro en la BD ni en logs.

/** SHA-256 hex de `${salt}:${value}`. */
export async function hashKey(salt, value) {
  const data = new TextEncoder().encode(`${salt}:${value}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

const HOUR = 3600
const DAY = 86400

/**
 * Reglas ADR-007. El comercio se identifica por slug (aun no tenemos su id).
 * @param {{ ipHash: string, slug: string, emailHash: string, phoneHash: string }} k
 * @returns {{ key: string, window: number, max: number }[]}  en orden de evaluacion
 */
export function enrollLimits(k) {
  return [
    { key: `enroll:ip:${k.ipHash}`, window: HOUR, max: 10 },
    { key: `enroll:merchant:${k.slug}`, window: HOUR, max: 300 },
    { key: `enroll:email:${k.emailHash}`, window: DAY, max: 3 },
    { key: `enroll:phone:${k.phoneHash}`, window: DAY, max: 3 },
  ]
}

/**
 * Evalua las reglas en orden; se detiene en la primera que deniega.
 * @param {{ rpc: (fn: string, args: object) => Promise<{data: any, error: any}> }} supabase
 * @param {{ key: string, window: number, max: number }[]} rules
 * @returns {Promise<{ allowed: true } | { allowed: false, retry_after: number } | { error: true }>}
 */
export async function checkRateLimits(supabase, rules) {
  for (const r of rules) {
    const { data, error } = await supabase.rpc('rate_limit_hit', {
      p_key: r.key,
      p_window_seconds: r.window,
      p_max: r.max,
    })
    if (error || !data) return { error: true }
    if (data.allowed !== true)
      return { allowed: false, retry_after: Number(data.retry_after) || r.window }
  }
  return { allowed: true }
}
