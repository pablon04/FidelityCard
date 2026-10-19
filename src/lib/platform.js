/** Deteccion de plataforma (UX.md 2.1). Falla en silencio hacia 'other'. */
export function detectPlatform() {
  try {
    const ua = navigator.userAgent || ''
    if (/Android/i.test(ua)) return 'android'
    if (
      /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    )
      return 'ios'
  } catch {
    /* ignorar */
  }
  return 'other'
}
