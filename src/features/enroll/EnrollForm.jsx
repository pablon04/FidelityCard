import { useEffect, useRef, useState } from 'react'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Checkbox } from '../../components/ui/Checkbox.jsx'
import { TextField } from '../../components/ui/TextField.jsx'
import { normalizePhone, stripSpanishPrefix } from '../../lib/phone.js'
import { suggestEmail } from '../../lib/format.js'
import { enrollCustomer, ApiError } from '../../services/publicApi.js'
import { es } from '../../i18n/es.js'
import { useTurnstile } from './useTurnstile.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function validate(f) {
  const e = {}
  const name = f.name.trim()
  if (!name) e.name = es.errors.nameEmpty
  else if (name.length < 2 || name.split(/\s+/).length < 2) e.name = es.errors.nameShort
  if (!f.email.trim()) e.email = es.errors.emailEmpty
  else if (!EMAIL_RE.test(f.email.trim())) e.email = es.errors.emailBad
  if (!f.phone.trim()) e.phone = es.errors.phoneEmpty
  else if (!normalizePhone(f.phone)) e.phone = es.errors.phoneBad
  if (!f.terms) e.terms = es.errors.terms
  return e
}

const ORDER = ['name', 'email', 'phone', 'terms']

export function EnrollForm({ merchant, slug, source, onDone, onOpenPrivacy, onReload }) {
  const [f, setF] = useState({
    name: '',
    email: '',
    phone: '',
    terms: false,
    marketing: false,
    website: '',
  })
  const [errors, setErrors] = useState({})
  const [summary, setSummary] = useState('')
  const [banner, setBanner] = useState(null) // {kind: 'network'|'offline'|'rate'|'partial'|'server'}
  const [submitting, setSubmitting] = useState(false)
  const [slow, setSlow] = useState(false)
  const [wait, setWait] = useState(0)
  const tsRef = useRef(null)
  const { getToken, reset } = useTurnstile(tsRef)
  const started = useRef(false)
  const consents = merchant.consents ?? {}
  const shown = merchant.legal_name || merchant.name

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const set = (k, v) => {
    started.current = true
    setF((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined })) // el error desaparece al corregir
  }
  const onBlur = (k) => {
    if (typeof f[k] === 'string' && !f[k].trim()) return // sin error si aun no escribio
    const e = validate(f)[k]
    setErrors((p) => ({ ...p, [k]: e }))
  }

  const submit = async (ev) => {
    ev.preventDefault()
    if (submitting || wait > 0) return
    const errs = validate(f)
    setErrors(errs)
    const keys = ORDER.filter((k) => errs[k])
    if (keys.length) {
      setSummary(es.errors.summary(keys.length))
      ev.currentTarget.elements[keys[0]]?.focus()
      return
    }
    setSummary('')
    setBanner(null)
    if (!navigator.onLine) {
      setBanner({ kind: 'offline' })
      return
    }
    setSubmitting(true)
    setSlow(false)
    const slowTimer = setTimeout(() => setSlow(true), 4000)
    try {
      const captcha_token = await getToken()
      const res = await enrollCustomer({
        slug,
        full_name: f.name.trim(),
        email: f.email.trim(),
        phone: normalizePhone(f.phone),
        consent: true,
        consent_version: consents.terms_privacy?.version,
        marketing_opt_in: f.marketing,
        ...(f.marketing && { marketing_version: consents.marketing?.version }),
        captcha_token,
        source,
        website: f.website,
      })
      if (res.status === 'already_registered') {
        setBanner({ kind: 'partial' })
      } else {
        onDone({ kind: res.status, token: res.passToken, name: f.name.trim() })
      }
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'rate_limited' || err.status === 429)) {
        setWait(err.retryAfter || 30)
        setBanner({ kind: 'rate' })
      } else if (err instanceof ApiError && err.code === 'consent_outdated') {
        setBanner({ kind: 'outdated' })
        onReload()
      } else if (err instanceof ApiError && err.code === 'captcha_failed') {
        setBanner({ kind: 'captcha' })
      } else {
        setBanner({ kind: 'server' })
      }
    } finally {
      clearTimeout(slowTimer)
      setSubmitting(false)
      reset()
    }
  }

  const suggestion = suggestEmail(f.email)
  const ro = submitting ? { readOnly: true } : {}

  return (
    <form onSubmit={submit} noValidate aria-busy={submitting}>
      <p className="sr-only" role="status" aria-live="polite">
        {summary}
        {submitting ? 'Creando tu tarjeta' : ''}
      </p>
      {summary && (
        <p className="mb-3 text-sm font-medium text-danger" aria-hidden="true">
          {summary}
        </p>
      )}
      <div className="space-y-3">
        <TextField
          label="Nombre completo"
          required
          name="name"
          autoComplete="name"
          placeholder="María García López"
          value={f.name}
          onChange={(e) => set('name', e.target.value)}
          onBlur={() => onBlur('name')}
          error={errors.name}
          {...ro}
        />
        <TextField
          label="Email"
          required
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={f.email}
          onChange={(e) => set('email', e.target.value)}
          onBlur={() => onBlur('email')}
          error={errors.email}
          {...ro}
        >
          {suggestion && !errors.email && (
            <p className="mt-1 text-sm text-text">
              ¿Quisiste decir <strong>{suggestion}</strong>?{' '}
              <button
                type="button"
                className="min-h-[44px] font-medium text-primary underline"
                onClick={() => set('email', suggestion)}
              >
                Sí, corregir
              </button>
            </p>
          )}
        </TextField>
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
          onBlur={() => onBlur('phone')}
          error={errors.phone}
          {...ro}
        />
        <Checkbox
          name="terms"
          checked={f.terms}
          onChange={(e) => set('terms', e.target.checked)}
          error={errors.terms}
          disabled={submitting}
          label={
            <>
              Acepto que <strong>{shown}</strong> trate mis datos (nombre, email y teléfono) para
              gestionar mi tarjeta de fidelidad{' '}
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="font-medium text-primary underline"
              >
                Más información
              </button>
              . <span className="text-text-muted">(obligatorio)</span>
            </>
          }
        />
        <Checkbox
          name="marketing"
          checked={f.marketing}
          onChange={(e) => set('marketing', e.target.checked)}
          disabled={submitting}
          label={
            <>
              Quiero recibir ofertas y novedades de <strong>{shown}</strong> por email o teléfono.{' '}
              <span className="text-text-muted">(opcional)</span>
            </>
          }
        />
        {/* Honeypot: invisible para personas y lectores de pantalla */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px' }}>
          <label>
            No rellenar
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={f.website}
              onChange={(e) => setF((p) => ({ ...p, website: e.target.value }))}
            />
          </label>
        </div>
      </div>

      <div ref={tsRef} className="mt-2 empty:hidden" />

      {banner && (
        <Alert tone="error" className="mt-3">
          {banner.kind === 'offline' && es.errors.offline}
          {banner.kind === 'rate' && es.errors.rate(wait)}
          {banner.kind === 'partial' && es.errors.partial}
          {banner.kind === 'outdated' && es.errors.outdated}
          {banner.kind === 'captcha' && es.errors.captcha}
          {banner.kind === 'server' && es.errors.server}
        </Alert>
      )}

      <Button
        type="submit"
        size="lg"
        className="mt-3"
        loading={submitting}
        aria-disabled={wait > 0 || undefined}
        disabled={wait > 0}
      >
        {submitting
          ? slow
            ? es.form.slow
            : es.form.submitting
          : banner && banner.kind !== 'partial' && wait === 0
            ? 'Reintentar'
            : wait > 0
              ? es.form.wait(wait)
              : es.form.submit}
      </Button>

      <p className="mt-3 text-xs text-text-muted">
        <button type="button" onClick={onOpenPrivacy} className="min-h-[44px] underline">
          {es.form.privacyLink}
        </button>
        . Responsable: {shown}. Puedes retirar tu consentimiento en cualquier momento.
      </p>
    </form>
  )
}
