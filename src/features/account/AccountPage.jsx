import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Crown, MapPin, Scale } from 'lucide-react'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { TextField } from '../../components/ui/TextField.jsx'
import { publicBase } from '../../lib/env.js'
import { mapsUrl } from '../../lib/format.js'
import {
  PLANS,
  geocodeAddress,
  syncWalletCard,
  updateMerchantAccount,
} from '../../services/merchantService.js'
import { useMerchant } from '../merchant/merchantCtx.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const initial = (m) => ({
  name: m.name ?? '',
  legal_name: m.legal_name ?? '',
  tax_id: m.tax_id ?? '',
  privacy_email: m.privacy_email ?? '',
  address: m.address ?? '',
  latitude: m.latitude ?? null,
  longitude: m.longitude ?? null,
})

function validate(v) {
  const e = {}
  const n = v.name.trim().length
  if (n < 1 || n > 80) e.name = 'Escribe el nombre de tu negocio (máximo 80 caracteres).'
  if (v.privacy_email.trim() && !EMAIL_RE.test(v.privacy_email.trim()))
    e.privacy_email = 'Revisa el email de contacto.'
  const a = v.address.trim().length
  if (a && (a < 5 || a > 200)) e.address = 'Escribe una dirección de entre 5 y 200 caracteres.'
  return e
}

function Section({ icon: Icon, title, help, children }) {
  return (
    <section className="rounded-card border border-border-subtle bg-surface p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon aria-hidden="true" size={20} />
        {title}
      </h2>
      {help && <p className="mt-1 text-sm text-text-muted">{help}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

/** /app/cuenta — datos del comercio comunes a todas sus tarjetas (legales, ubicacion) y plan. */
export default function AccountPage() {
  const { merchant, cards, plan, refresh } = useMerchant()
  const [v, setV] = useState(() => initial(merchant))
  const [saved, setSaved] = useState(() => JSON.stringify(initial(merchant)))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [geo, setGeo] = useState({ busy: false, text: '', tone: 'muted' })
  const formRef = useRef(null)
  const dirty = useMemo(() => JSON.stringify(v) !== saved, [v, saved])
  const hasCoords = Number.isFinite(v.latitude) && Number.isFinite(v.longitude)
  const legalReady = !!(merchant.legal_name?.trim() && merchant.privacy_email?.trim())

  useEffect(() => {
    document.title = 'Cuenta · FidelityCard'
  }, [])

  useEffect(() => {
    if (!dirty) return
    const h = (e) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const set = (k, val) => {
    setV((p) => ({ ...p, [k]: val }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
    setMsg(null)
  }
  const setCoords = (latitude, longitude) => setV((p) => ({ ...p, latitude, longitude }))

  const onGeocode = async () => {
    if (v.address.trim().length < 5)
      return setErrors((p) => ({ ...p, address: 'Escribe primero la dirección completa.' }))
    setGeo({ busy: true, text: '', tone: 'muted' })
    try {
      const hit = await geocodeAddress(v.address)
      if (!hit) {
        setCoords(null, null)
        return setGeo({
          busy: false,
          tone: 'warning',
          text: 'No encontramos esa dirección. Añade calle, número, ciudad y código postal, o usa tu ubicación actual.',
        })
      }
      setCoords(hit.latitude, hit.longitude)
      setGeo({ busy: false, tone: 'muted', text: `Encontrada: ${hit.label}` })
    } catch {
      setGeo({
        busy: false,
        tone: 'warning',
        text: 'No hemos podido buscar la dirección. Inténtalo de nuevo.',
      })
    }
  }

  const onMyLocation = () => {
    if (!navigator.geolocation)
      return setGeo({
        busy: false,
        tone: 'warning',
        text: 'Tu navegador no permite obtener la ubicación.',
      })
    setGeo({ busy: true, text: '', tone: 'muted' })
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoords(Number(coords.latitude.toFixed(6)), Number(coords.longitude.toFixed(6)))
        setGeo({
          busy: false,
          tone: 'muted',
          text: 'Ubicación actual guardada como la de tu negocio.',
        })
      },
      () =>
        setGeo({
          busy: false,
          tone: 'warning',
          text: 'No hemos podido obtener tu ubicación. Revisa los permisos del navegador.',
        }),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const save = async (e) => {
    e.preventDefault()
    const errs = validate(v)
    setErrors(errs)
    const first = Object.keys(errs)[0]
    if (first) {
      formRef.current?.elements[first]?.focus()
      return setMsg({ tone: 'error', text: 'Revisa los campos marcados.' })
    }
    setBusy(true)
    setMsg(null)
    try {
      await updateMerchantAccount(merchant.id, v)
      syncWalletCard() // nombre del negocio y direccion a los pases ya guardados en Wallet
      await refresh()
      setSaved(JSON.stringify(v))
      setMsg({ tone: 'success', text: 'Datos guardados. Se aplican a todas tus tarjetas.' })
    } catch {
      setMsg({ tone: 'error', text: 'No hemos podido guardar. Inténtalo de nuevo.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Cuenta</h1>
        <p className="text-text-muted">
          Datos de tu negocio. Se rellenan una vez y valen para todas tus tarjetas.
        </p>
      </div>

      {!legalReady && (
        <Alert tone="info">
          Completa la razón social y el email de contacto RGPD: son obligatorios para activar
          tarjetas.
        </Alert>
      )}

      <form ref={formRef} noValidate onSubmit={save} className="space-y-6">
        <Section icon={Building2} title="Negocio">
          <TextField
            name="name"
            label="Nombre del negocio"
            required
            value={v.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
            maxLength={80}
            autoComplete="organization"
            help="Aparece en la página de alta y como emisor en Google Wallet."
          />
          <div>
            <p className="mb-1.5 text-sm font-medium">Enlace de tu negocio</p>
            <p className="break-all rounded-control bg-bg-muted p-2 text-sm">
              {publicBase()}/c/{merchant.slug}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              No se puede cambiar: va grabado en tus QR y etiquetas NFC.
            </p>
          </div>
        </Section>

        <Section
          icon={Scale}
          title="Datos legales"
          help="Se muestran a tus clientes como responsable del tratamiento de sus datos. Obligatorios para activar tarjetas."
        >
          <TextField
            name="legal_name"
            label="Razón social o nombre del responsable"
            value={v.legal_name}
            onChange={(e) => set('legal_name', e.target.value)}
            error={errors.legal_name}
          />
          <TextField
            name="tax_id"
            label="NIF/CIF (opcional)"
            value={v.tax_id}
            onChange={(e) => set('tax_id', e.target.value)}
          />
          <TextField
            name="privacy_email"
            label="Email de contacto para derechos RGPD"
            type="email"
            inputMode="email"
            value={v.privacy_email}
            onChange={(e) => set('privacy_email', e.target.value)}
            error={errors.privacy_email}
          />
        </Section>

        <Section
          icon={MapPin}
          title="Ubicación"
          help="Tus clientes la ven en su tarjeta con un enlace «Cómo llegar»."
        >
          <TextField
            name="address"
            label="Dirección del negocio (opcional)"
            placeholder="Calle Mayor 12, 28013 Madrid"
            value={v.address}
            onChange={(e) => {
              set('address', e.target.value)
              if (hasCoords) setCoords(null, null) // coordenadas viejas ya no valen
              setGeo({ busy: false, text: '', tone: 'muted' })
            }}
            error={errors.address}
            autoComplete="street-address"
            maxLength={200}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={onGeocode} disabled={geo.busy}>
              {geo.busy ? 'Buscando…' : 'Localizar en el mapa'}
            </Button>
            <Button variant="link" onClick={onMyLocation} disabled={geo.busy}>
              Estoy en el local: usar mi ubicación
            </Button>
          </div>
          {geo.text && (
            <p
              role="status"
              className={`text-sm ${geo.tone === 'warning' ? 'text-warning' : 'text-text-muted'}`}
            >
              {geo.text}
            </p>
          )}
          {hasCoords && (
            <p className="text-sm text-text-muted">
              Ubicación lista.{' '}
              <a
                href={mapsUrl(v)}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline"
              >
                Comprobar en Google Maps
              </a>
            </p>
          )}
        </Section>

        <div className="space-y-3">
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy}>
              Guardar cambios
            </Button>
            {dirty && <span className="text-sm text-text-muted">Tienes cambios sin guardar.</span>}
          </div>
        </div>
      </form>

      <Section icon={Crown} title={`Plan ${plan.name}`}>
        <p>
          Usas {cards.length} de {plan.cards} {plan.cards === 1 ? 'tarjeta' : 'tarjetas'}.
        </p>
        <ul className="grid gap-3 sm:grid-cols-3">
          {Object.entries(PLANS).map(([key, p]) => {
            const current = p === plan
            return (
              <li
                key={key}
                className={`rounded-card p-3 ${current ? 'border-2 border-primary' : 'border border-border-subtle'}`}
              >
                <p className="font-semibold">
                  {p.name}
                  {current && <span className="ml-2 text-sm font-normal text-primary">Actual</span>}
                </p>
                <p className="text-sm text-text-muted">
                  Hasta {p.cards} {p.cards === 1 ? 'tarjeta' : 'tarjetas'}
                </p>
              </li>
            )
          })}
        </ul>
        <p className="text-sm text-text-muted">
          ¿Necesitas más tarjetas? Escríbenos y te cambiamos de plan.
        </p>
      </Section>
    </main>
  )
}
