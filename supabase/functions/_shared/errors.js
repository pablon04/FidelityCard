// Respuestas JSON comunes. Forma de error (ARCHITECTURE sec. 3):
// { "error": { "code", "message", "fields"?, "retry_after"? } } + x-request-id.

const MESSAGES = {
  validation_error: 'Revisa los datos del formulario.',
  captcha_failed: 'No hemos podido verificar que eres una persona. Intentalo de nuevo.',
  captcha_unavailable: 'Verificacion no disponible ahora mismo. Intentalo en unos minutos.',
  card_not_found: 'No encontramos esta tarjeta.',
  consent_outdated: 'Los terminos han cambiado. Recarga la pagina e intentalo de nuevo.',
  rate_limited: 'Demasiados intentos. Espera un poco e intentalo de nuevo.',
  origin_not_allowed: 'Origen no permitido.',
  method_not_allowed: 'Metodo no permitido.',
  payload_too_large: 'Peticion demasiado grande.',
  wallet_disabled: 'Google Wallet no esta disponible ahora mismo.',
  invalid_token: 'Enlace de pase no valido.',
  not_found: 'No encontramos este pase.',
  unauthorized: 'Sesion no valida.',
  internal: 'Error interno. Intentalo mas tarde.',
}

/**
 * @param {unknown} data
 * @param {number} status
 * @param {Record<string,string>} headers
 */
export function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

/**
 * @param {number} status
 * @param {string} code
 * @param {{ fields?: Record<string,string>, retry_after?: number, headers?: Record<string,string> }} [opts]
 */
export function errorResponse(status, code, opts = {}) {
  const error = { code, message: MESSAGES[code] ?? MESSAGES.internal }
  if (opts.fields) error.fields = opts.fields
  if (opts.retry_after !== undefined) error.retry_after = opts.retry_after
  const headers = { ...(opts.headers ?? {}) }
  if (opts.retry_after !== undefined) headers['retry-after'] = String(opts.retry_after)
  return json({ error }, status, headers)
}

/** Log estructurado SIN PII: solo request_id, evento y codigos. */
export function log(requestId, event, extra = {}) {
  console.log(JSON.stringify({ request_id: requestId, event, ...extra }))
}
