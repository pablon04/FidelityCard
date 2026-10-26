import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { PasswordField } from '../../components/ui/PasswordField.jsx'
import { PhoneField } from '../../components/ui/PhoneField.jsx'
import { TextField } from '../../components/ui/TextField.jsx'
import { signIn, signUp } from '../../services/authService.js'
import { DEFAULT_COUNTRY, dialOf, normalizePhone, stripDialPrefix } from '../../lib/phone.js'
import { createMerchant } from '../../services/merchantService.js'
import { useAuth } from './authCtx.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function LoginPage() {
  const [params] = useSearchParams()
  const register = params.get('modo') === 'registro'
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()
  // Vuelta a la pagina protegida que pidio el login (p. ej. /admin); solo rutas propias.
  const from = /^\/(app|admin)(\/|$)/.test(loc.state?.from ?? '') ? loc.state.from : '/app'
  const [f, setF] = useState({
    business: '',
    phone: '',
    phoneCountry: DEFAULT_COUNTRY,
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)
  const [fails, setFails] = useState(0)
  const [registering, setRegistering] = useState(false)

  useEffect(() => {
    document.title = register ? 'Crear cuenta · FidelityCard' : 'Entrar · FidelityCard'
  }, [register])

  if (!loading && session && !registering) return <Navigate to={from} replace />

  const set = (k) => (e) => {
    setF((p) => ({ ...p, [k]: e.target.value }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const submit = async (ev) => {
    ev.preventDefault()
    if (busy) return
    const errs = {}
    if (register && !f.business.trim()) errs.business = 'Escribe el nombre de tu negocio.'
    if (register && !normalizePhone(f.phone, dialOf(f.phoneCountry)))
      errs.phone = 'Escribe un teléfono de contacto válido.'
    if (!f.email.trim()) errs.email = 'Escribe tu email.'
    else if (!EMAIL_RE.test(f.email.trim())) errs.email = 'Revisa el email: parece que falta algo.'
    if (!f.password) errs.password = 'Escribe tu contraseña.'
    else if (register && f.password.length < 8)
      errs.password = 'La contraseña necesita al menos 8 caracteres.'
    setErrors(errs)
    const first = ['business', 'phone', 'email', 'password'].find((k) => errs[k])
    if (first) return ev.currentTarget.elements[first]?.focus()
    setBanner(null)
    setBusy(true)
    const contactPhone = register ? normalizePhone(f.phone, dialOf(f.phoneCountry)) : null
    try {
      if (register) {
        setRegistering(true)
        const { session: s } = await signUp({
          email: f.email.trim(),
          password: f.password,
          businessName: f.business.trim(),
          contactPhone,
        })
        if (!s) {
          setRegistering(false)
          setBanner({
            tone: 'info',
            text: 'Revisa tu correo para confirmar la cuenta y después entra.',
          })
          return
        }
        try {
          await createMerchant({ name: f.business.trim(), contactPhone })
          navigate('/app/tarjetas/nueva', { replace: true })
        } catch {
          navigate('/app/onboarding', {
            replace: true,
            state: { name: f.business.trim(), phone: contactPhone },
          })
        }
      } else {
        await signIn({ email: f.email.trim(), password: f.password })
        navigate(from, { replace: true })
      }
    } catch (err) {
      setRegistering(false)
      if (register) {
        setBanner({
          tone: 'error',
          text: 'No hemos podido crear la cuenta con ese email. Si ya tienes una, entra con ella.',
        })
      } else {
        const n = fails + 1
        setFails(n)
        setBanner({
          tone: 'error',
          text:
            err?.status === 429 || n >= 5
              ? 'Demasiados intentos. Espera un minuto o recupera tu contraseña.'
              : 'Email o contraseña incorrectos.',
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-bg-muted px-4 py-8 md:items-center">
      <div className="w-full max-w-[420px] rounded-card bg-surface p-6 shadow-card md:border md:border-border-subtle">
        <p className="mb-4 text-center text-lg font-bold text-primary">FidelityCard</p>
        <h1 className="mb-4 text-2xl font-bold">
          {register ? 'Crea tu tarjeta de fidelidad en unos minutos' : 'Entra en tu panel'}
        </h1>
        <form onSubmit={submit} noValidate className="space-y-4" aria-busy={busy}>
          {register && (
            <TextField
              name="business"
              label="Nombre del negocio"
              required
              autoComplete="organization"
              placeholder="Cafetería La Plaza"
              value={f.business}
              onChange={set('business')}
              error={errors.business}
            />
          )}
          {register && (
            <PhoneField
              name="phone"
              label="Teléfono de contacto"
              required
              autoComplete="tel-national"
              country={f.phoneCountry}
              onCountryChange={(c) => setF((p) => ({ ...p, phoneCountry: c }))}
              value={f.phone}
              onChange={(e) => {
                const v = stripDialPrefix(e.target.value, dialOf(f.phoneCountry))
                setF((p) => ({ ...p, phone: v }))
                if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }))
              }}
              error={errors.phone}
              help="Solo lo usa el equipo de FidelityCard para contactar contigo."
            />
          )}
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
          <PasswordField
            name="password"
            label="Contraseña"
            required
            autoComplete={register ? 'new-password' : 'current-password'}
            value={f.password}
            onChange={set('password')}
            error={errors.password}
            help={register ? 'Mínimo 8 caracteres' : undefined}
          >
            {!register && (
              <Link
                to="/app/recuperar"
                className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline"
              >
                ¿Has olvidado la contraseña? Cambiar contraseña
              </Link>
            )}
          </PasswordField>
          {banner && <Alert tone={banner.tone}>{banner.text}</Alert>}
          <Button type="submit" size="lg" loading={busy}>
            {register ? 'Crear cuenta' : 'Entrar'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          {register ? (
            <Link
              to="/app/login"
              className="inline-flex min-h-[44px] items-center text-primary underline"
            >
              ¿Ya tienes cuenta? Entrar
            </Link>
          ) : (
            <Link
              to="/app/login?modo=registro"
              className="inline-flex min-h-[44px] items-center text-primary underline"
            >
              ¿Aún no tienes cuenta? Crear cuenta
            </Link>
          )}
        </p>
        {register && (
          <p className="mt-2 text-center text-xs text-text-muted">
            Al crear la cuenta aceptas los Términos y la Política de privacidad (borrador, pendiente
            de revisión legal).
          </p>
        )}
      </div>
    </main>
  )
}
