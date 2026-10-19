// Normalizacion de telefono a E.164 con libphonenumber-js (build "min").
// Pais por defecto ES (+34): "600 11 22 33" -> "+34600112233"; con prefijo
// internacional valido ("+44 7911 123456", "0044...") se respeta.
import { parsePhoneNumberFromString } from 'npm:libphonenumber-js@1.11.20/min'

/**
 * @param {unknown} raw
 * @param {string} [defaultCountry]
 * @returns {{ ok: true, e164: string } | { ok: false }}
 */
export function normalizePhone(raw, defaultCountry = 'ES') {
  if (typeof raw !== 'string') return { ok: false }
  const s = raw.trim()
  if (s.length < 6 || s.length > 30) return { ok: false }
  // Solo caracteres habituales de un telefono.
  if (!/^[+0-9\s().-]+$/.test(s)) return { ok: false }
  // "00" internacional -> "+"
  const input = s.startsWith('00') ? '+' + s.slice(2) : s
  let parsed
  try {
    parsed = parsePhoneNumberFromString(input, defaultCountry)
  } catch {
    return { ok: false }
  }
  if (!parsed || !parsed.isValid()) return { ok: false }
  const e164 = parsed.number // ya en E.164
  // Misma regla que customers_phone_chk en SQL.
  if (!/^\+[1-9][0-9]{7,14}$/.test(e164)) return { ok: false }
  return { ok: true, e164 }
}
