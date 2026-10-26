import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { PasswordField } from '../../components/ui/PasswordField.jsx'
import { updatePassword } from '../../services/authService.js'
import { useAuth } from './authCtx.js'

/** Destino del enlace del correo: supabase-js canjea el token de la URL y abre sesión de recuperación. */
export default function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [f, setF] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [banner, setBanner] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Nueva contraseña · FidelityCard'
  }, [])

  const set = (k) => (e) => {
    setF((p) => ({ ...p, [k]: e.target.value }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const submit = async (ev) => {
    ev.preventDefault()
    if (busy) return
    const errs = {}
    if (f.password.length < 8) errs.password = 'La contraseña necesita al menos 8 caracteres.'
    if (f.confirm !== f.password) errs.confirm = 'Las contraseñas no coinciden.'
    setErrors(errs)
    const first = ['password', 'confirm'].find((k) => errs[k])
    if (first) return ev.currentTarget.elements[first]?.focus()
    setBanner(null)
    setBusy(true)
    try {
      await updatePassword(f.password)
      navigate('/app', { replace: true })
    } catch {
      setBanner({
        tone: 'error',
        text: 'No hemos podido cambiar la contraseña. Pide un enlace nuevo e inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  return (
    <main className="flex min-h-screen items-start justify-center bg-bg-muted px-4 py-8 md:items-center">
      <div className="w-full max-w-[420px] rounded-card bg-surface p-6 shadow-card md:border md:border-border-subtle">
        <p className="mb-4 text-center text-lg font-bold text-primary">FidelityCard</p>
        <h1 className="mb-4 text-2xl font-bold">Elige una contraseña nueva</h1>
        {session ? (
          <form onSubmit={submit} noValidate className="space-y-4" aria-busy={busy}>
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
        ) : (
          <>
            <Alert tone="error">El enlace no es válido o ha caducado. Pide uno nuevo.</Alert>
            <p className="mt-4 text-center text-sm">
              <Link
                to="/app/recuperar"
                className="inline-flex min-h-[44px] items-center text-primary underline"
              >
                Pedir otro enlace
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
