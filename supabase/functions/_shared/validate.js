// Validacion y normalizacion del body de enroll-customer. Logica PURA (testeable).
import { normalizePhone } from './phone.js'

export const MAX_BODY_BYTES = 8192
export const SOURCES = ['nfc', 'qr', 'link']
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/ // = merchants_slug_chk
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/ // = customers_email_chk
const VERSION_RE = /^[A-Za-z0-9._-]{1,40}$/
/** = programs_code_chk (SQL 0012): tarjeta del enlace ?card=. */
export const CARD_RE = /^[a-z0-9][a-z0-9-]{0,22}[a-z0-9]$/

/**
 * @typedef {Object} EnrollInput
 * @property {string} slug
 * @property {string} full_name
 * @property {string} email
 * @property {string} phone_e164
 * @property {string} terms_version
 * @property {boolean} marketing_opt_in
 * @property {string|null} marketing_version
 * @property {string} captcha_token
 * @property {'nfc'|'qr'|'link'} source
 * @property {string|null} card
 */

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: EnrollInput } | { ok: false, fields: Record<string,string> }}
 */
export function validateEnrollBody(body) {
  /** @type {Record<string,string>} */
  const fields = {}
  const b =
    body && typeof body === 'object' && !Array.isArray(body) ? /** @type {any} */ (body) : null
  if (!b) return { ok: false, fields: { body: 'Cuerpo invalido.' } }

  const slug = typeof b.slug === 'string' ? b.slug.trim().toLowerCase() : ''
  if (!SLUG_RE.test(slug)) fields.slug = 'Enlace no valido.'

  const full_name = typeof b.full_name === 'string' ? b.full_name.replace(/\s+/g, ' ').trim() : ''
  if (full_name.length < 2 || full_name.length > 100)
    fields.full_name = 'Escribe tu nombre (2-100 caracteres).'

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
  if (email.length > 254 || !EMAIL_RE.test(email)) fields.email = 'Email no valido.'

  const phone = normalizePhone(b.phone, 'ES')
  if (!phone.ok) fields.phone = 'Telefono no valido.'

  if (b.consent !== true) fields.consent = 'Debes aceptar los terminos y la politica de privacidad.'

  const terms_version = typeof b.consent_version === 'string' ? b.consent_version.trim() : ''
  if (!VERSION_RE.test(terms_version))
    fields.consent_version = 'Version de consentimiento no valida.'

  if (b.marketing_opt_in !== undefined && typeof b.marketing_opt_in !== 'boolean') {
    fields.marketing_opt_in = 'Valor no valido.'
  }
  const marketing_opt_in = b.marketing_opt_in === true
  let marketing_version = null
  if (marketing_opt_in) {
    marketing_version = typeof b.marketing_version === 'string' ? b.marketing_version.trim() : ''
    if (!VERSION_RE.test(marketing_version))
      fields.marketing_version = 'Version de consentimiento de marketing no valida.'
  }

  const captcha_token = typeof b.captcha_token === 'string' ? b.captcha_token : ''
  if (captcha_token.length < 1 || captcha_token.length > 4096)
    fields.captcha_token = 'Verificacion requerida.'

  const source = b.source === undefined || b.source === null || b.source === '' ? 'link' : b.source
  if (!SOURCES.includes(source)) fields.source = 'Origen no valido.'

  const card = typeof b.card === 'string' && b.card.trim() ? b.card.trim().toLowerCase() : null
  if (card !== null && !CARD_RE.test(card)) fields.card = 'Tarjeta no valida.'

  if (Object.keys(fields).length > 0) return { ok: false, fields }
  return {
    ok: true,
    value: {
      slug,
      full_name,
      email,
      phone_e164: /** @type {{ok:true,e164:string}} */ (phone).e164,
      terms_version,
      marketing_opt_in,
      marketing_version,
      captcha_token,
      source,
      card,
    },
  }
}

/** Honeypot: campo oculto `website`; relleno => bot. */
export function isHoneypotTripped(body) {
  return (
    !!body &&
    typeof body === 'object' &&
    typeof body.website === 'string' &&
    body.website.trim() !== ''
  )
}
