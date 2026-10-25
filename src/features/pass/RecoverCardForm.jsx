import { useRef, useState } from 'react'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { TextField } from '../../components/ui/TextField.jsx'
import { normalizePhone, stripSpanishPrefix } from '../../lib/phone.js'
import { ApiError, recoverCard } from '../../services/publicApi.js'
import { useTurnstile } from '../enroll/useTurnstile.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const ERRORS = {
  not_found:
    'No encontramos una tarjeta con ese email y teléfono. Revisa que sean los mismos que usaste al registrarte o pregunta en el mostrador.',
  rate_limited: 'Demasiados intentos. Espera un rato e inténtalo de nuevo.',
  captcha_failed: 'No hemos podido verificar que no eres un robot. Inténtalo de nuevo.',
}

/** Recupera la tarjeta con email + teléfono (los dos deben coincidir con el registro). */
export function RecoverCardForm({ slug, onRecovered }) {
  const [f, setF] = useState({ email: '', phone: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState('')
  const tsRef = useRef(null)
  const { getToken, reset } = useTurnstile(tsRef)

  const set = (k, v) => {
    setF((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!EMAIL_RE.test(f.email.trim())) errs.email = 'Escribe el email con el que te registraste.'
    if (!normalizePhone(f.phone)) errs.phone = 'Escribe el teléfono con el que te registraste.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setBanner('')
    try {
      const token = await recoverCard({
        slug,
        email: f.email.trim(),
        phone: normalizePhone(f.phone),
        captcha_token: await getToken(),
      })
      onRecovered(token)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network'
      setBanner(
        ERRORS[code] ?? 'No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.',
      )
      reset()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={busy} className="space-y-4 text-left">
      <div>
        <h2 className="text-lg font-semibold">¿Ya tenías tarjeta?</h2>
        <p className="text-sm text-text-muted">
          Escribe el email y el teléfono con los que te registraste y recupera tus visitas.
        </p>
      </div>
      <TextField
        label="Email"
        required
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={f.email}
        onChange={(e) => set('email', e.target.value)}
        error={errors.email}
      />
      <TextField
        label="Teléfono móvil"
        required
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="612 34 56 78"
        prefix={
          <span>
            <span aria-hidden="true">🇪🇸</span> +34
          </span>
        }
        value={f.phone}
        onChange={(e) => set('phone', stripSpanishPrefix(e.target.value))}
        error={errors.phone}
      />
      <div ref={tsRef} />
      {banner && <Alert tone="error">{banner}</Alert>}
      <Button type="submit" size="lg" loading={busy} className="w-full">
        Recuperar mi tarjeta
      </Button>
    </form>
  )
}
