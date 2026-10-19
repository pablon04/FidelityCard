// CORS restringido a ALLOWED_ORIGINS (lista separada por comas).
// Sin ALLOWED_ORIGINS => ningun origen de navegador permitido (fail closed).

/** @param {string|undefined|null} raw */
export function parseAllowedOrigins(raw) {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

/**
 * @param {string|null} origin  cabecera Origin (null si no es peticion de navegador)
 * @param {string[]} allowed
 * @returns {{ allowed: boolean, headers: Record<string,string> }}
 *  - sin Origin: permitido (llamadas servidor-a-servidor/curl), sin cabeceras CORS.
 *  - Origin en la lista: permitido y se refleja.
 *  - Origin fuera de la lista: no permitido.
 */
export function corsFor(origin, allowed) {
  const base = { vary: 'Origin' }
  if (!origin) return { allowed: true, headers: base }
  if (!allowed.includes(origin)) return { allowed: false, headers: base }
  return {
    allowed: true,
    headers: {
      ...base,
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-max-age': '86400',
      'access-control-expose-headers': 'x-request-id, retry-after',
    },
  }
}
