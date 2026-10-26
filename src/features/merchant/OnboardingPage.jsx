import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { PhoneField } from '../../components/ui/PhoneField.jsx'
import { TextField } from '../../components/ui/TextField.jsx'
import {
  DEFAULT_COUNTRY,
  dialOf,
  normalizePhone,
  splitE164,
  stripDialPrefix,
} from '../../lib/phone.js'
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
  const [phone, setPhone] = useState(() => {
    const e164 = loc.state?.phone || session?.user?.user_metadata?.contact_phone
    return e164 ? splitE164(e164) : { country: DEFAULT_COUNTRY, number: '' }
  })
  const [error, setError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [busy, setBusy] = useState(false)
  if (merchant) return <Navigate to="/app" replace />

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError('Escribe el nombre de tu negocio.')
    const contactPhone = normalizePhone(phone.number, dialOf(phone.country))
    if (!contactPhone) return setPhoneError('Escribe un teléfono de contacto válido.')
    setBusy(true)
    setError('')
    try {
      await createMerchant({ name, contactPhone })
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
        <PhoneField
          label="Teléfono de contacto"
          required
          name="phone"
          autoComplete="tel-national"
          country={phone.country}
          onCountryChange={(c) => setPhone((p) => ({ ...p, country: c }))}
          value={phone.number}
          onChange={(e) => {
            setPhone((p) => ({ ...p, number: stripDialPrefix(e.target.value, dialOf(p.country)) }))
            setPhoneError('')
          }}
          error={phoneError}
          help="Solo lo usa el equipo de FidelityCard para contactar contigo."
        />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" size="lg" loading={busy}>
          Continuar
        </Button>
      </form>
    </main>
  )
}
