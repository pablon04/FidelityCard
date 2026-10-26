import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { PasswordField } from '../../components/ui/PasswordField.jsx'
import { TextField } from '../../components/ui/TextField.jsx'
import { resetPasswordWithCode } from '../../services/publicApi.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const CODE_ERROR = 'Error: póngase en contacto con el organizador.'

/**
 * /app/recuperar — el equipo genera un código temporal (10 min) en /admin y se lo pasa al
 * comercio. Paso 1: email + código. Paso 2: contraseña nueva. Sin correo ni SMTP.
 */
export default function ForgotPasswordPage() {
  const [step, setStep] = useState('code') // code | password | done
  const [f, setF] = useState({ email: '', code: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Cambiar contraseña · FidelityCard'
  }, [])

  const set = (k) => (e) => {
    setF((p) => ({ ...p, [k]: e.target.value }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const run = async (ev, action, validate) => {
    ev.preventDefault()
    if (busy) return
    const errs = validate()
    setErrors(errs)
    const first = Object.keys(errs).find((k) => errs[k])
    if (first) return ev.currentTarget.elements[first]?.focus()
    setBanner(null)
    setBusy(true)
    try {
      await resetPasswordWithCode({
        action,
        email: f.email.trim(),
        code: f.code.trim(),
        password: action === 'reset' ? f.password : undefined,
      })
      setStep(action === 'verify' ? 'password' : 'done')
    } catch (err) {
      const text =
        err.code === 'rate_limited'
          ? 'Demasiados intentos. Espera un poco e inténtalo de nuevo.'
          : err.code === 'validation_error'
            ? 'La contraseña no es válida.'
            : err.code === 'invalid_code'
              ? CODE_ERROR
              : 'No hemos podido completar el cambio. Inténtalo de nuevo.'
      setBanner({ tone: 'error', text })
    } finally {
      setBusy(false)
    }
  }

  const verify = (ev) =>
    run(ev, 'verify', () => {
      const errs = {}
      if (!f.email.trim()) errs.email = 'Escribe el email del comercio.'
      else if (!EMAIL_RE.test(f.email.trim()))
        errs.email = 'Revisa el email: parece que falta algo.'
      if (!f.code.trim()) errs.code = 'Escribe el código que te ha dado el organizador.'
      return errs
    })

  const save = (ev) =>
    run(ev, 'reset', () => {
      const errs = {}
      if (f.password.length < 8) errs.password = 'La contraseña necesita al menos 8 caracteres.'
      if (f.confirm !== f.password) errs.confirm = 'Las contraseñas no coinciden.'
      return errs
    })

  return (
    <main className="flex min-h-screen items-start justify-center bg-bg-muted px-4 py-8 md:items-center">
      <div className="w-full max-w-[420px] rounded-card bg-surface p-6 shadow-card md:border md:border-border-subtle">
        <p className="mb-4 text-center text-lg font-bold text-primary">FidelityCard</p>
        <h1 className="mb-4 text-2xl font-bold">
          {step === 'password' ? 'Elige una contraseña nueva' : 'Cambiar contraseña'}
        </h1>

        {step === 'code' && (
          <form onSubmit={verify} noValidate className="space-y-4" aria-busy={busy}>
            <p className="text-sm text-text-muted">
              Pide un código al organizador y escríbelo aquí junto al email de tu cuenta. El código
              dura 10 minutos y solo sirve una vez.
            </p>
            <TextField
              name="email"
              label="Email"
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="tu@negocio.com"
              value={f.email}
              onChange={set('email')}
              error={errors.email}
            />
            <TextField
              name="code"
              label="Código"
              required
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={8}
              placeholder="ABCD2345"
              className="[&_input]:font-mono [&_input]:uppercase [&_input]:tracking-widest"
              value={f.code}
              onChange={set('code')}
              error={errors.code}
            />
            {banner && <Alert tone={banner.tone}>{banner.text}</Alert>}
            <Button type="submit" size="lg" loading={busy}>
              Continuar
            </Button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={save} noValidate className="space-y-4" aria-busy={busy}>
            <PasswordField
              name="password"
              label="Contraseña nueva"
              required
              autoComplete="new-password"
              value={f.password}
              onChange={set('password')}
              error={errors.password}
              help="Mínimo 8 caracteres"
            />
            <PasswordField
              name="confirm"
              label="Repite la contraseña"
              required
              autoComplete="new-password"
              value={f.confirm}
              onChange={set('confirm')}
              error={errors.confirm}
            />
            {banner && <Alert tone={banner.tone}>{banner.text}</Alert>}
            <Button type="submit" size="lg" loading={busy}>
              Guardar contraseña
            </Button>
          </form>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <Alert tone="success">Contraseña cambiada. Ya puedes entrar con la nueva.</Alert>
            <Link
              to="/app/login"
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-control bg-primary text-lg font-semibold text-on-primary hover:bg-primary-hover"
            >
              Entrar
            </Link>
          </div>
        )}

        {step !== 'done' && (
          <p className="mt-4 text-center text-sm">
            <Link
              to="/app/login"
              className="inline-flex min-h-[44px] items-center text-primary underline"
            >
              Volver a entrar
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}
