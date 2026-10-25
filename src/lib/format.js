export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'

export const firstName = (full = '') => full.trim().split(/\s+/)[0] ?? ''

export function slugify(name) {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
  return base || 'tienda'
}

export function randomSuffix(len = 4) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const buf = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(buf, (b) => chars[b % chars.length]).join('')
}

/** Resumen de la recompensa para el chip/preview. */
export function rewardChip(card) {
  if (!card) return ''
  const reward = card.reward_description || 'tu recompensa'
  return card.type === 'points'
    ? `Con ${card.threshold} puntos, ${reward}`
    : `Cada ${card.threshold} visitas, ${reward}`
}

export function logoUrl(path, supabaseUrl) {
  if (!path || !supabaseUrl) return null
  return `${supabaseUrl}/storage/v1/object/public/merchant-logos/${path}`
}

const TYPOS = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.es': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'yahoo.es': null,
  'yaho.com': 'yahoo.com',
  'icloud.es': 'icloud.com',
}

/** Sugerencia de correccion de typos comunes de dominio, o null. */
export function suggestEmail(email) {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(email.trim().toLowerCase())
  if (!m) return null
  const fix = TYPOS[m[2]]
  return fix ? `${m[1]}@${fix}` : null
}

/** Enlace a Google Maps (abre la app en Android/iOS): coordenadas si hay, si no la direccion. */
export function mapsUrl({ address, latitude, longitude } = {}) {
  const q =
    Number.isFinite(latitude) && Number.isFinite(longitude) ? `${latitude},${longitude}` : address
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
}

/** Tarjeta del enlace (?card=); null = la principal del comercio. */
export const cardParam = (params) => params.get('card')?.trim().toLowerCase() || null

/** Clave de localStorage del pase de una tarjeta (la principal conserva la clave antigua). */
export const passKey = (slug, card) => (card ? `fc:pass:${slug}:${card}` : `fc:pass:${slug}`)

/** Anade ?card= a un enlace publico si la tarjeta no es la principal. */
export function withCard(url, card, extra = {}) {
  const q = new URLSearchParams({ ...(card ? { card } : {}), ...extra }).toString()
  return q ? `${url}?${q}` : url
}
