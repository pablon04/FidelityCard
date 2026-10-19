/** Utilidades de contraste WCAG para el color del comercio (UX.md 4.1). */
const HEX = /^#[0-9a-fA-F]{6}$/

export const isHex = (v) => HEX.test(v ?? '')

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')

export function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** Texto sobre el color de marca: blanco o #111827, el de mayor contraste. */
export function onColor(hex) {
  if (!isHex(hex)) return '#ffffff'
  return ratio(hex, '#ffffff') >= ratio(hex, '#111827') ? '#ffffff' : '#111827'
}

/** Oscurece el color en pasos del 5 % hasta alcanzar 4.5:1 contra el fondo (para texto/bordes). */
export function brandUi(hex, bg = '#ffffff') {
  if (!isHex(hex)) return '#1f2937'
  let rgb = toRgb(hex)
  let out = hex
  for (let i = 0; i < 20 && ratio(out, bg) < 4.5; i++) {
    rgb = rgb.map((c) => c * 0.95)
    out = toHex(rgb)
  }
  return out
}

/** true si ni blanco ni negro dan 4.5:1 sobre el color (aviso de UX 2.5). */
export const isLowContrast = (hex) =>
  isHex(hex) && Math.max(ratio(hex, '#ffffff'), ratio(hex, '#111827')) < 4.5

/** Variables CSS del comercio para style={{...}}. */
export function brandVars(hex) {
  const c = isHex(hex) ? hex : '#1f2937'
  return { '--brand': c, '--on-brand': onColor(c), '--brand-ui': brandUi(c) }
}
