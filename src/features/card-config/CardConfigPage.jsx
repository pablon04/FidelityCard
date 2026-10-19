import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { PassCard } from '../../components/ui/PassCard.jsx'
import { Sheet } from '../../components/ui/Sheet.jsx'
import { TextField } from '../../components/ui/TextField.jsx'
import { isHex, isLowContrast } from '../../lib/contrast.js'
import { env } from '../../lib/env.js'
import { logoUrl } from '../../lib/format.js'
import {
  LOGO_TYPES,
  activateProgram,
  countProgramCards,
  saveProgram,
  updateMerchantLegal,
  uploadLogo,
} from '../../services/merchantService.js'
import { useMerchant } from '../merchant/merchantCtx.js'

const SWATCHES = ['#4F46E5', '#0F766E', '#B45309', '#BE123C', '#1F2937', '#FACC15']
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function initial(merchant, program) {
  return {
    card_name: program?.card_name ?? merchant.name.slice(0, 30),
    logo_path: program?.logo_path ?? '',
    brand_color: program?.brand_color ?? '#4F46E5',
    type: program?.type ?? 'visits',
    threshold: program?.threshold ?? 8,
    points_per_currency: Number(program?.points_per_currency ?? 1),
    reward_description: program?.reward_description ?? '',
    legal_name: merchant.legal_name ?? '',
    tax_id: merchant.tax_id ?? '',
    privacy_email: merchant.privacy_email ?? '',
  }
}

function validate(v, forActivate) {
  const e = {}
  const n = v.card_name.trim().length
  if (n < 2 || n > 30) e.card_name = 'Escribe un nombre de entre 2 y 30 caracteres.'
  if (!isHex(v.brand_color)) e.brand_color = 'Usa un color con formato #RRGGBB.'
  if (v.type === 'visits') {
    if (!Number.isInteger(v.threshold) || v.threshold < 2 || v.threshold > 50)
      e.threshold = 'Entre 2 y 50.'
  } else {
    if (!Number.isInteger(v.threshold) || v.threshold < 1)
      e.threshold = 'Escribe un número entero de 1 o más.'
    if (!(v.points_per_currency > 0)) e.points_per_currency = 'Escribe un número mayor que 0.'
  }
  const r = v.reward_description.trim().length
  if (r < 3 || r > 60)
    e.reward_description = 'Escribe qué recibirá tu cliente (entre 3 y 60 caracteres).'
  if (v.privacy_email.trim() && !EMAIL_RE.test(v.privacy_email.trim()))
    e.privacy_email = 'Revisa el email de contacto.'
  if (forActivate) {
    if (!v.legal_name.trim())
      e.legal_name = 'Necesitamos la razón social o el nombre del responsable.'
    if (!v.privacy_email.trim())
      e.privacy_email ||= 'Escribe un email de contacto para los derechos de tus clientes.'
  }
  return e
}

export default function CardConfigPage() {
  const { merchant, program, refresh } = useMerchant()
  const navigate = useNavigate()
  const [v, setV] = useState(() => initial(merchant, program))
  const [saved, setSaved] = useState(() => JSON.stringify(initial(merchant, program)))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // {tone,text}
  const [confirm, setConfirm] = useState(null) // 'activate' | 'threshold'
  const [hasCustomers, setHasCustomers] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState('')
  const formRef = useRef(null)
  const dirty = useMemo(() => JSON.stringify(v) !== saved, [v, saved])
  const active = program?.status === 'active'

  useEffect(() => {
    document.title = 'Tu tarjeta · FidelityCard'
    if (program)
      countProgramCards(program.id)
        .then((n) => setHasCustomers(n > 0))
        .catch(() => {})
  }, [program])

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
  const num = (k) => (e) => set(k, e.target.value === '' ? NaN : Number(e.target.value))

  const onLogo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoError('')
    if (!LOGO_TYPES.includes(file.type) || file.size > 1048576) {
      setLogoError(
        'El archivo es demasiado grande o no es una imagen válida. Prueba con un PNG de menos de 1 MB.',
      )
      return
    }
    setLogoBusy(true)
    try {
      set('logo_path', await uploadLogo(merchant.id, file))
    } catch {
      setLogoError('No hemos podido subir el logo. Inténtalo de nuevo.')
    } finally {
      setLogoBusy(false)
    }
  }

  const persist = async (activate) => {
    setBusy(true)
    setMsg(null)
    try {
      await updateMerchantLegal(merchant.id, v)
      let p = await saveProgram(merchant.id, program, v)
      if (activate && p.status !== 'active') p = await activateProgram(p.id)
      await refresh()
      setSaved(JSON.stringify(v))
      if (activate) navigate('/app/share', { state: { justActivated: true } })
      else setMsg({ tone: 'success', text: 'Cambios guardados.' })
    } catch (err) {
      const text =
        err?.code === 'type_locked'
          ? 'No puedes cambiar el tipo porque ya tienes clientes.'
          : err?.code === 'forbidden'
            ? 'No tienes permiso para activar esta tarjeta.'
            : 'No hemos podido guardar los cambios. Tus datos siguen aquí; inténtalo de nuevo.'
      setMsg({ tone: 'error', text })
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const attempt = (activate) => {
    const errs = validate(v, activate)
    setErrors(errs)
    const first = Object.keys(errs)[0]
    if (first) {
      formRef.current?.elements[first]?.focus()
      setMsg({ tone: 'error', text: 'Revisa los campos marcados.' })
      return
    }
    if (activate && !active) return setConfirm('activate')
    if (active && program.threshold !== v.threshold) return setConfirm('threshold')
    persist(activate)
  }

  const lowContrast = isLowContrast(v.brand_color)
  const preview = (
    <div aria-hidden="true">
      <PassCard
        name={v.card_name}
        logoUrl={logoUrl(v.logo_path, env.supabaseUrl)}
        color={isHex(v.brand_color) ? v.brand_color : '#4F46E5'}
        type={v.type}
        threshold={v.threshold}
        reward={v.reward_description}
      />
    </div>
  )
  const previewText = `Vista previa: tarjeta de ${v.card_name}, ${v.threshold} ${v.type === 'points' ? 'puntos' : 'visitas'}, recompensa ${v.reward_description || 'sin definir'}`

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tu tarjeta</h1>
        <span className="rounded-chip border border-border-subtle px-3 py-1 text-sm">
          Estado: {active ? 'Activa' : 'Borrador'}
        </span>
      </div>
      {!program && (
        <Alert tone="info" className="mb-4">
          Configura tu tarjeta para empezar. Solo te llevará un par de minutos.
        </Alert>
      )}
      <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:gap-8">
        <details className="mb-4 rounded-card border border-border-subtle p-3 lg:hidden">
          <summary className="min-h-[44px] cursor-pointer py-2 font-medium">
            Ver vista previa
          </summary>
          <p className="sr-only">{previewText}</p>
          <div className="mt-2 flex justify-center">{preview}</div>
        </details>

        <form
          ref={formRef}
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            attempt(!active)
          }}
          className="space-y-8"
        >
          <fieldset className="space-y-4">
            <legend className="mb-2 text-lg font-semibold">1. Datos del negocio</legend>
            <TextField
              name="card_name"
              label="Nombre en la tarjeta"
              required
              value={v.card_name}
              onChange={(e) => set('card_name', e.target.value)}
              error={errors.card_name}
              maxLength={30}
            />
            <div>
              <p className="mb-1.5 text-sm font-medium">Logo</p>
              <div className="flex items-center gap-3">
                {v.logo_path ? (
                  <img
                    src={logoUrl(v.logo_path, env.supabaseUrl)}
                    alt={`Logo de ${v.card_name}`}
                    width="64"
                    height="64"
                    className="h-16 w-16 rounded-control border border-border-subtle object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-16 w-16 items-center justify-center rounded-control border border-dashed border-border text-text-muted"
                  >
                    Sin logo
                  </span>
                )}
                <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-control border-[1.5px] border-border px-4 font-medium focus-within:outline focus-within:outline-2 focus-within:outline-offset-2">
                  {logoBusy ? 'Subiendo…' : v.logo_path ? 'Cambiar logo' : 'Subir logo'}
                  <input
                    type="file"
                    accept={LOGO_TYPES.join(',')}
                    onChange={onLogo}
                    className="sr-only"
                    disabled={logoBusy}
                  />
                </label>
                {v.logo_path && (
                  <Button variant="link" onClick={() => set('logo_path', '')}>
                    Quitar
                  </Button>
                )}
              </div>
              <p className="mt-1 text-sm text-text-muted">
                PNG, JPG o WebP. Máximo 1 MB. Mejor si es cuadrado.
              </p>
              {logoError && (
                <p role="alert" className="mt-1 text-sm font-medium text-danger">
                  ⚠ {logoError}
                </p>
              )}
            </div>
            <div>
              <p id="color-label" className="mb-1.5 text-sm font-medium">
                Color de la tarjeta
              </p>
              <div
                role="radiogroup"
                aria-labelledby="color-label"
                className="flex flex-wrap items-center gap-2"
              >
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={v.brand_color.toLowerCase() === c.toLowerCase()}
                    aria-label={`Color ${c}`}
                    onClick={() => set('brand_color', c)}
                    style={{ background: c }}
                    className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-border text-lg text-white mix-blend-normal"
                  >
                    {v.brand_color.toLowerCase() === c.toLowerCase() && (
                      <span
                        aria-hidden="true"
                        className="rounded-full bg-black/60 px-1 leading-none"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                ))}
                <input
                  name="brand_color"
                  aria-label="Color personalizado en formato hexadecimal"
                  value={v.brand_color}
                  onChange={(e) => set('brand_color', e.target.value)}
                  maxLength={7}
                  className="min-h-[44px] w-28 rounded-control border-[1.5px] border-border bg-surface px-3 text-base"
                />
              </div>
              {errors.brand_color && (
                <p role="alert" className="mt-1 text-sm font-medium text-danger">
                  ⚠ {errors.brand_color}
                </p>
              )}
              {lowContrast && (
                <p role="status" className="mt-1 text-sm text-warning">
                  Este color es muy claro y se leerá mal. Hemos ajustado el texto a negro.
                </p>
              )}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-lg font-semibold">2. Tipo de tarjeta</legend>
            <div
              role="radiogroup"
              aria-label="Tipo de tarjeta"
              className="grid gap-3 sm:grid-cols-2"
            >
              {[
                ['visits', 'Por visitas', 'El cliente suma 1 cada vez que viene.'],
                ['points', 'Por puntos', 'El cliente suma según lo que gasta.'],
              ].map(([val, t, d]) => {
                const sel = v.type === val
                const lock = hasCustomers && !sel
                return (
                  <label
                    key={val}
                    className={`block cursor-pointer rounded-card p-3 ${sel ? 'border-2 border-primary' : 'border-[1.5px] border-border'} ${lock ? 'opacity-60' : ''} focus-within:outline focus-within:outline-2 focus-within:outline-offset-2`}
                  >
                    <input
                      type="radio"
                      name="type"
                      value={val}
                      checked={sel}
                      disabled={lock}
                      onChange={() => {
                        set('type', val)
                        set('threshold', val === 'visits' ? 8 : 100)
                      }}
                      className="sr-only"
                    />
                    <span className="font-semibold">
                      {sel && <span aria-hidden="true">✓ </span>}
                      {t}
                    </span>
                    <span className="block text-sm text-text-muted">{d}</span>
                  </label>
                )
              })}
            </div>
            {hasCustomers && (
              <p className="text-sm text-text-muted">
                No puedes cambiar el tipo porque ya tienes clientes.
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-2 text-lg font-semibold">3. Cuándo se gana la recompensa</legend>
            {v.type === 'visits' ? (
              <TextField
                name="threshold"
                label="Visitas necesarias para la recompensa"
                required
                type="number"
                inputMode="numeric"
                min="2"
                max="50"
                value={Number.isNaN(v.threshold) ? '' : v.threshold}
                onChange={num('threshold')}
                error={errors.threshold}
                help="Entre 2 y 50."
              />
            ) : (
              <>
                <TextField
                  name="points_per_currency"
                  label="Puntos por cada 1 € gastado"
                  required
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={Number.isNaN(v.points_per_currency) ? '' : v.points_per_currency}
                  onChange={num('points_per_currency')}
                  error={errors.points_per_currency}
                  help={`Con 10 € gastados, tu cliente suma ${Math.round(10 * (v.points_per_currency || 0))} puntos.`}
                />
                <TextField
                  name="threshold"
                  label="Puntos necesarios para la recompensa"
                  required
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={Number.isNaN(v.threshold) ? '' : v.threshold}
                  onChange={num('threshold')}
                  error={errors.threshold}
                />
              </>
            )}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-2 text-lg font-semibold">4. Recompensa</legend>
            <TextField
              name="reward_description"
              label="Descripción de la recompensa"
              required
              placeholder="1 café gratis"
              value={v.reward_description}
              onChange={(e) => set('reward_description', e.target.value)}
              error={errors.reward_description}
              help={`${v.reward_description.trim().length}/60`}
              maxLength={60}
            />
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-1 text-lg font-semibold">5. Datos legales</legend>
            <p className="text-sm text-text-muted">
              Se muestran a tus clientes como responsable del tratamiento. Obligatorios para
              activar.
            </p>
            <TextField
              name="legal_name"
              label="Razón social o nombre del responsable"
              value={v.legal_name}
              onChange={(e) => set('legal_name', e.target.value)}
              error={errors.legal_name}
              autoComplete="organization"
            />
            <TextField
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
          </fieldset>

          <div className="space-y-3">
            {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
            <div className="flex flex-wrap items-center gap-3">
              {!active ? (
                <>
                  <Button type="submit" size="md" loading={busy}>
                    Guardar y activar
                  </Button>
                  <Button variant="secondary" onClick={() => attempt(false)} disabled={busy}>
                    Guardar borrador
                  </Button>
                </>
              ) : (
                <Button type="submit" loading={busy}>
                  Guardar cambios
                </Button>
              )}
              {dirty && (
                <span className="text-sm text-text-muted">Tienes cambios sin guardar.</span>
              )}
            </div>
          </div>
        </form>

        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
              Vista previa
            </h2>
            <p className="sr-only">{previewText}</p>
            {preview}
            <p className="mt-3 text-sm text-text-muted">
              Así verá tu cliente la tarjeta (orientativo; el aspecto final depende de Apple y
              Google).
            </p>
          </div>
        </aside>
      </div>

      <Sheet
        variant="dialog"
        open={confirm === 'activate'}
        onClose={() => setConfirm(null)}
        title="Activar tarjeta"
      >
        <p>Vas a activar tu tarjeta. Desde ahora tus clientes podrán registrarse con tu enlace.</p>
        <div className="mt-4 flex gap-3">
          <Button loading={busy} onClick={() => persist(true)}>
            Activar
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
      <Sheet
        variant="dialog"
        open={confirm === 'threshold'}
        onClose={() => setConfirm(null)}
        title="Cambiar la meta"
      >
        <p>Esto cambia la meta para todos tus clientes.</p>
        <div className="mt-4 flex gap-3">
          <Button loading={busy} onClick={() => persist(false)}>
            Guardar cambios
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
    </main>
  )
}
