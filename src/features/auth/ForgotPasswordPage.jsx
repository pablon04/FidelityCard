import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { TextField } from '../../components/ui/TextField.jsx'
import { requestPasswordReset } from '../../services/authService.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState()
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [banner, setBanner] = useState(null)

  useEffect(() => {
    document.title = 'Recuperar contraseña · FidelityCard'
  }, [])

  const submit = async (ev) => {
    ev.preventDefault()
    if (busy) return
    const v = email.trim()
    if (!v) return setError('Escribe tu email.')
    if (!EMAIL_RE.test(v)) return setError('Revisa el email: parece que falta algo.')
    setError(undefined)
    setBanner(null)
    setBusy(true)
    try {
      await requestPasswordReset(v)
      setSent(true)
    } catch (err) {
      setBanner({
        tone: 'error',
        text:
          err?.status === 429
            ? 'Demasiados intentos. Espera unos minutos y vuelve a probar.'
            : 'No hemos podido enviar el correo. Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-bg-muted px-4 py-8 md:items-center">
      <div className="w-full max-w-[420px] rounded-card bg-surface p-6 shadow-card md:border md:border-border-subtle">
        <p className="mb-4 text-center text-lg font-bold text-primary">FidelityCard</p>
        <h1 className="mb-4 text-2xl font-bold">Cambiar contraseña</h1>
        {sent ? (
          <Alert tone="info">
            Si existe una cuenta con {email.trim()}, te hemos enviado un correo con un enlace para
            elegir una contraseña nueva. Revisa también el spam.
          </Alert>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4" aria-busy={busy}>
            <p className="text-sm text-text-muted">
              Escribe el email de tu cuenta y te enviaremos un enlace para crear una contraseña
              nueva.
            </p>
            <TextField
              name="email"
              label="Email"
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="tu@negocio.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(undefined)
              }}
              error={error}
            />
            {banner && <Alert tone={banner.tone}>{banner.text}</Alert>}
            <Button type="submit" size="lg" loading={busy}>
              Enviar enlace
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm">
          <Link
            to="/app/login"
            className="inline-flex min-h-[44px] items-center text-primary underline"
          >
            Volver a entrar
          </Link>
        </p>
      </div>
    </main>
  )
}
