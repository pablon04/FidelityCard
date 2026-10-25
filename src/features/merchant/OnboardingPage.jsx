import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { TextField } from '../../components/ui/TextField.jsx'
import { createMerchant } from '../../services/merchantService.js'
import { useAuth } from '../auth/authCtx.js'
import { useMerchant } from './merchantCtx.js'

/** Crea el comercio (create_merchant) si el usuario aun no tiene uno. */
export default function OnboardingPage() {
  const { merchant, refresh } = useMerchant()
  const { session } = useAuth()
  const loc = useLocation()
  const navigate = useNavigate()
  const [name, setName] = useState(
    loc.state?.name || session?.user?.user_metadata?.business_name || '',
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (merchant) return <Navigate to="/app" replace />

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError('Escribe el nombre de tu negocio.')
    setBusy(true)
    setError('')
    try {
      await createMerchant({ name })
      await refresh()
      navigate('/app/tarjetas/nueva', { replace: true })
    } catch {
      setError('No hemos podido crear tu negocio. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold">Datos de tu negocio</h1>
      <p className="mt-2 text-text-muted">
        Configura tu tarjeta para empezar. Solo te llevará un par de minutos.
      </p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <TextField
          label="Nombre del negocio"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" size="lg" loading={busy}>
          Continuar
        </Button>
      </form>
    </main>
  )
}
