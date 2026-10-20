import { useState } from 'react'
import { getGoogleSaveUrl } from '../../services/publicApi.js'

const MSG = {
  wallet_disabled: 'Google Wallet no está disponible ahora mismo. Usa «Guardar tarjeta».',
  invalid_token: 'No hemos podido abrir tu Wallet. Usa «Guardar tarjeta».',
  not_found: 'No hemos encontrado tu tarjeta. Usa «Guardar tarjeta» o consulta con el comercio.',
  rate_limited: (n) => `Demasiados intentos. Espera ${n || 30} segundos y prueba otra vez.`,
  internal: 'No hemos podido abrir tu Wallet. Inténtalo de nuevo o usa «Guardar tarjeta».',
}

/** Logo "G" multicolor simplificado (SVG propio, no es el asset oficial). */
function GMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.5 12.2c0-.8-.1-1.4-.2-2H12v3.8h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.700 3.300-7.800z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.400-1 7.200-2.700l-3.500-2.700c-1 .7-2.200 1-3.700 1-2.800 0-5.200-1.900-6-4.500H2.400v2.800A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M6 14.100a6.600 6.600 0 0 1 0-4.200V7.100H2.400a11 11 0 0 0 0 9.800z"
      />
      <path
        fill="#EA4335"
        d="M12 5.400c1.600 0 3 .6 4.100 1.600l3.100-3.100A11 11 0 0 0 2.400 7.100L6 9.900c.8-2.600 3.200-4.500 6-4.500z"
      />
    </svg>
  )
}

/** Boton "Añadir a Google Wallet". Redirige en la misma ventana a save_url. */
export function GoogleWalletButton({ token, primary = true }) {
  const [state, setState] = useState({ busy: false, error: '' })

  const click = async () => {
    setState({ busy: true, error: '' })
    try {
      const url = await getGoogleSaveUrl(token)
      window.location.assign(url)
      // Si no hay cambio de contexto en 8 s, se libera el boton con el respaldo.
      setTimeout(() => setState({ busy: false, error: MSG.internal }), 8000)
    } catch (err) {
      const m = MSG[err.code] ?? MSG.internal
      setState({ busy: false, error: typeof m === 'function' ? m(err.retryAfter) : m })
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={click}
        disabled={state.busy}
        aria-busy={state.busy || undefined}
        className={`flex min-h-[52px] w-full items-center justify-center gap-3 rounded-chip border px-5 text-base font-medium disabled:opacity-70 ${
          primary
            ? 'border-black bg-black text-white dark:border-white'
            : 'border-border bg-surface text-text'
        }`}
      >
        <GMark />
        {state.busy ? 'Abriendo Wallet…' : 'Añadir a Google Wallet'}
      </button>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      )}
    </div>
  )
}
