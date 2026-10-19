import { useCallback, useEffect, useRef } from 'react'
import { env } from '../../lib/env.js'

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise

function loadScript() {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = resolve
    s.onerror = () => {
      scriptPromise = undefined
      reject(new Error('turnstile'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

/**
 * Turnstile (solo en la landing). `getToken()` espera hasta `timeout` ms a que haya token.
 * Sin site key (produccion sin configurar) devuelve '' y el servidor decide.
 */
export function useTurnstile(containerRef) {
  const token = useRef('')
  const widget = useRef(null)
  const waiters = useRef([])

  useEffect(() => {
    if (!env.turnstileSiteKey) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widget.current = window.turnstile.render(containerRef.current, {
          sitekey: env.turnstileSiteKey,
          appearance: 'interaction-only',
          language: 'es',
          callback: (t) => {
            token.current = t
            waiters.current.splice(0).forEach((w) => w(t))
          },
          'expired-callback': () => {
            token.current = ''
          },
          'error-callback': () => {
            token.current = ''
          },
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (widget.current != null && window.turnstile) window.turnstile.remove(widget.current)
      widget.current = null
    }
  }, [containerRef])

  const getToken = useCallback((timeout = 10000) => {
    if (!env.turnstileSiteKey || token.current) return Promise.resolve(token.current)
    return new Promise((resolve) => {
      waiters.current.push(resolve)
      setTimeout(() => resolve(token.current), timeout)
    })
  }, [])

  /** Los tokens son de un solo uso: renovar tras cada envio. */
  const reset = useCallback(() => {
    token.current = ''
    if (widget.current != null && window.turnstile) window.turnstile.reset(widget.current)
  }, [])

  return { getToken, reset }
}
