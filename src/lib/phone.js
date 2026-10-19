/**
 * Normalizacion de telefono a E.164 sin libphonenumber (ahorra bundle en la landing).
 * Pais por defecto ES (+34). El servidor revalida (ARCHITECTURE 3.1).
 * @returns {string|null} E.164 o null si no es valido
 */
export function normalizePhone(raw) {
  let s = (raw ?? '').replace(/[\s().-]/g, '')
  if (!s) return null
  if (s.startsWith('00')) s = '+' + s.slice(2)
  if (s.startsWith('+')) {
    if (s.startsWith('+34')) return /^\+34[6-9]\d{8}$/.test(s) ? s : null
    return /^\+[1-9]\d{7,14}$/.test(s) ? s : null
  }
  if (/^[6-9]\d{8}$/.test(s)) return '+34' + s
  return null
}
