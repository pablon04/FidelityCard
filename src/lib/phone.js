/**
 * Telefono a E.164 sin libphonenumber (ahorra bundle en la landing).
 * Pais por defecto ES (+34). El servidor revalida (API-CONTRACT 1).
 */

/**
 * Si el usuario escribe o pega el prefijo espanol dentro del campo (que ya muestra +34),
 * lo quita para no duplicarlo: "+34 634 51 30 12", "0034634513012", "34634513012" -> "634 51 30 12".
 * Otros prefijos internacionales se dejan intactos.
 */
export function stripSpanishPrefix(raw) {
  const s = (raw ?? '').replace(/[\s().-]/g, '')
  const m = /^(?:\+|00)34(\d*)$/.exec(s) || /^34([6-9]\d{8})$/.exec(s)
  return m ? m[1] : raw
}

/** @returns {string|null} E.164 o null si no es valido */
export function normalizePhone(raw) {
  let s = (raw ?? '').replace(/[\s().-]/g, '')
  if (!s) return null
  if (s.startsWith('00')) s = '+' + s.slice(2)
  if (/^34[6-9]\d{8}$/.test(s)) s = '+' + s
  if (s.startsWith('+')) {
    if (s.startsWith('+34')) return /^\+34[6-9]\d{8}$/.test(s) ? s : null
    return /^\+[1-9]\d{7,14}$/.test(s) ? s : null
  }
  if (/^[6-9]\d{8}$/.test(s)) return '+34' + s
  return null
}
