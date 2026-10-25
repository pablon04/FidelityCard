/**
 * Telefono a E.164 sin libphonenumber (ahorra bundle en la landing).
 * Pais por defecto ES (+34). El servidor revalida con libphonenumber (API-CONTRACT 1).
 */

/** Prefijos del selector. `code` es unico (+1 lo comparten varios paises). */
export const COUNTRIES = [
  ['ES', '34', 'España', '🇪🇸'],
  ['PT', '351', 'Portugal', '🇵🇹'],
  ['FR', '33', 'Francia', '🇫🇷'],
  ['AD', '376', 'Andorra', '🇦🇩'],
  ['GI', '350', 'Gibraltar', '🇬🇮'],
  ['GB', '44', 'Reino Unido', '🇬🇧'],
  ['IE', '353', 'Irlanda', '🇮🇪'],
  ['DE', '49', 'Alemania', '🇩🇪'],
  ['IT', '39', 'Italia', '🇮🇹'],
  ['NL', '31', 'Países Bajos', '🇳🇱'],
  ['BE', '32', 'Bélgica', '🇧🇪'],
  ['CH', '41', 'Suiza', '🇨🇭'],
  ['AT', '43', 'Austria', '🇦🇹'],
  ['SE', '46', 'Suecia', '🇸🇪'],
  ['NO', '47', 'Noruega', '🇳🇴'],
  ['DK', '45', 'Dinamarca', '🇩🇰'],
  ['FI', '358', 'Finlandia', '🇫🇮'],
  ['PL', '48', 'Polonia', '🇵🇱'],
  ['CZ', '420', 'Chequia', '🇨🇿'],
  ['HU', '36', 'Hungría', '🇭🇺'],
  ['GR', '30', 'Grecia', '🇬🇷'],
  ['RO', '40', 'Rumanía', '🇷🇴'],
  ['BG', '359', 'Bulgaria', '🇧🇬'],
  ['UA', '380', 'Ucrania', '🇺🇦'],
  ['RU', '7', 'Rusia', '🇷🇺'],
  ['MA', '212', 'Marruecos', '🇲🇦'],
  ['DZ', '213', 'Argelia', '🇩🇿'],
  ['SN', '221', 'Senegal', '🇸🇳'],
  ['NG', '234', 'Nigeria', '🇳🇬'],
  ['US', '1', 'Estados Unidos / Canadá', '🇺🇸'],
  ['MX', '52', 'México', '🇲🇽'],
  ['CU', '53', 'Cuba', '🇨🇺'],
  ['DO', '1', 'República Dominicana', '🇩🇴'],
  ['CO', '57', 'Colombia', '🇨🇴'],
  ['VE', '58', 'Venezuela', '🇻🇪'],
  ['EC', '593', 'Ecuador', '🇪🇨'],
  ['PE', '51', 'Perú', '🇵🇪'],
  ['BO', '591', 'Bolivia', '🇧🇴'],
  ['CL', '56', 'Chile', '🇨🇱'],
  ['AR', '54', 'Argentina', '🇦🇷'],
  ['UY', '598', 'Uruguay', '🇺🇾'],
  ['PY', '595', 'Paraguay', '🇵🇾'],
  ['BR', '55', 'Brasil', '🇧🇷'],
  ['CN', '86', 'China', '🇨🇳'],
  ['IN', '91', 'India', '🇮🇳'],
  ['PK', '92', 'Pakistán', '🇵🇰'],
  ['PH', '63', 'Filipinas', '🇵🇭'],
].map(([code, dial, name, flag]) => ({ code, dial, name, flag }))

export const DEFAULT_COUNTRY = 'ES'

/** Prefijo (sin "+") del pais; ES si no existe. */
export const dialOf = (code) => (COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0]).dial

/**
 * Si el usuario escribe o pega el prefijo del pais elegido dentro del campo (que ya lo muestra),
 * lo quita para no duplicarlo: con ES, "+34 634 51 30 12", "0034634513012", "34634513012" ->
 * "634 51 30 12". Otros prefijos internacionales se dejan intactos.
 */
export function stripDialPrefix(raw, dial = '34') {
  const s = (raw ?? '').replace(/[\s().-]/g, '')
  const m = new RegExp(`^(?:\\+|00)${dial}(\\d*)$`).exec(s)
  if (m) return m[1]
  if (dial === '34') {
    const es = /^34([6-9]\d{8})$/.exec(s)
    if (es) return es[1]
  }
  return raw
}

export const stripSpanishPrefix = (raw) => stripDialPrefix(raw, '34')

/**
 * @param {string} raw numero tal cual lo escribe el usuario
 * @param {string} [dial] prefijo del pais elegido (sin "+"); ES por defecto
 * @returns {string|null} E.164 o null si no es valido
 */
export function normalizePhone(raw, dial = '34') {
  let s = (raw ?? '').replace(/[\s().-]/g, '')
  if (!s) return null
  if (s.startsWith('00')) s = '+' + s.slice(2)
  if (dial === '34' && /^34[6-9]\d{8}$/.test(s)) s = '+' + s
  if (!s.startsWith('+')) {
    if (!/^\d+$/.test(s)) return null
    if (dial === '34') return /^[6-9]\d{8}$/.test(s) ? '+34' + s : null
    // Prefijo nacional "0" (UK 07700..., FR 06...) fuera; Italia lo conserva.
    if (dial !== '39') s = s.replace(/^0/, '')
    s = `+${dial}${s}`
  }
  if (s.startsWith('+34')) return /^\+34[6-9]\d{8}$/.test(s) ? s : null
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null
}

/**
 * E.164 -> {country, number} para editar un telefono guardado (prefijo mas largo que coincida).
 * Sin coincidencia: ES y el numero completo con "+" (normalizePhone lo respeta).
 */
export function splitE164(e164) {
  const s = e164 ?? ''
  const hit = COUNTRIES.filter((c) => s.startsWith(`+${c.dial}`)).sort(
    (a, b) => b.dial.length - a.dial.length,
  )[0]
  return hit
    ? { country: hit.code, number: s.slice(hit.dial.length + 1) }
    : { country: DEFAULT_COUNTRY, number: s }
}
