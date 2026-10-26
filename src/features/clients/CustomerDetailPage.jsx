import { useCallback, useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Sheet } from '../../components/ui/Sheet.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { PhoneField } from '../../components/ui/PhoneField.jsx'
import { TextField } from '../../components/ui/TextField.jsx'
import { dialOf, normalizePhone, splitE164, stripDialPrefix } from '../../lib/phone.js'
import { getCustomerDetail, updateCustomerContact } from '../../services/customersService.js'
import { useMerchant } from '../merchant/merchantCtx.js'

const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })

const KIND = {
  earn_visit: 'Visita',
  redeem: 'Premio canjeado',
  earn_points: 'Puntos sumados',
  adjust: 'Ajuste',
  reversal: 'Anulación',
}

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="break-all font-medium">{children}</dd>
    </div>
  )
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const CONTACT_ERRORS = {
  email_taken: { email: 'Ese email ya lo tiene otro cliente de tu comercio.' },
  phone_taken: { phone: 'Ese teléfono ya lo tiene otro cliente de tu comercio.' },
  invalid_email: { email: 'Revisa el email.' },
  invalid_phone: { phone: 'Revisa el teléfono.' },
  forbidden: { form: 'No tienes permiso para cambiar este cliente.' },
}

/** Dialogo para editar email y telefono (cliente que cambio de correo o de numero). */
function ContactDialog({ open, customer, onClose, onSaved }) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('ES')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const cur = splitE164(customer.phone)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmail(customer.email)
    setCountry(cur.country)
    setPhone(cur.number)
    setErrors({})
  }, [open, customer.email, customer.phone])

  const save = async (e) => {
    e.preventDefault()
    const mail = email.trim().toLowerCase()
    const e164 = normalizePhone(phone, dialOf(country))
    const errs = {}
    if (!EMAIL_RE.test(mail)) errs.email = 'Escribe un email válido.'
    if (!e164) errs.phone = 'Escribe un teléfono válido.'
    setErrors(errs)
    if (errs.email || errs.phone) return
    if (mail === customer.email && e164 === customer.phone) return onClose()
    setBusy(true)
    try {
      onSaved(await updateCustomerContact(customer.id, mail, e164))
    } catch (err) {
      setErrors(
        CONTACT_ERRORS[err.code] ?? {
          form: 'No hemos podido guardar los cambios. Inténtalo de nuevo.',
        },
      )
    } finally {
      setBusy(false)
    }
  }

  const clear = (k) => setErrors((p) => ({ ...p, [k]: undefined, form: undefined }))

  return (
    <Sheet variant="dialog" open={open} onClose={onClose} title="Editar datos de contacto">
      <form onSubmit={save} noValidate className="space-y-4">
        <p className="text-sm text-text-muted">
          Úsalo si {customer.name} ha cambiado de correo o de número. Con el email y el teléfono
          nuevos podrá recuperar su tarjeta en otro móvil.
        </p>
        <TextField
          label="Email"
          required
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            clear('email')
          }}
          error={errors.email}
        />
        <PhoneField
          label="Teléfono"
          required
          name="phone"
          autoComplete="off"
          country={country}
          onCountryChange={(c) => {
            setCountry(c)
            clear('phone')
          }}
          value={phone}
          onChange={(e) => {
            setPhone(stripDialPrefix(e.target.value, dialOf(country)))
            clear('phone')
          }}
          error={errors.phone}
        />
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <div className="flex gap-3">
          <Button type="submit" loading={busy}>
            Guardar
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

/** /app/clientes/:id — ficha del cliente con su historial de visitas y premios. */
export default function CustomerDetailPage() {
  const { id } = useParams()
  const { merchant, programs } = useMerchant()
  const [state, setState] = useState({ status: 'loading' })
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(() => {
    setState({ status: 'loading' })
    getCustomerDetail(merchant.id, id)
      .then((c) => setState(c ? { status: 'ready', c } : { status: 'none' }))
      .catch(() => setState({ status: 'error' }))
  }, [merchant.id, id])

  useEffect(() => {
    document.title = 'Ficha de cliente · FidelityCard'
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const back = (
    <Link
      to="/app/clientes"
      className="mb-4 inline-flex min-h-[44px] items-center font-medium text-primary"
    >
      ← Volver a clientes
    </Link>
  )

  if (state.status === 'loading')
    return (
      <main className="mx-auto max-w-4xl p-4 md:p-6" aria-busy="true">
        {back}
        <Skeleton className="mb-3 h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </main>
    )
  if (state.status === 'none')
    return (
      <main className="mx-auto max-w-4xl p-4 md:p-6">
        {back}
        <Alert tone="info">No encontramos este cliente.</Alert>
      </main>
    )
  if (state.status === 'error')
    return (
      <main className="mx-auto max-w-4xl space-y-3 p-4 md:p-6">
        {back}
        <Alert tone="error">No hemos podido cargar la ficha. Inténtalo de nuevo.</Alert>
        <Button onClick={load}>Reintentar</Button>
      </main>
    )

  const { c } = state
  const visits = c.movements.filter((m) => m.kind === 'earn_visit').length
  const rewards = c.movements.filter((m) => m.kind === 'redeem')
  const multi = programs.length > 1
  const cardName = (id) => programs.find((p) => p.id === id)?.card_name ?? ''
  const progress = c.cards.length
    ? c.cards
        .map((k) => {
          const p = programs.find((x) => x.id === k.programId)
          if (!p) return String(k.balance)
          const txt = `${k.balance} / ${p.threshold} ${p.type === 'points' ? 'puntos' : 'visitas'}`
          return multi ? `${p.card_name}: ${txt}` : txt
        })
        .join(' · ')
    : '—'

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        {back}
        <h1 className="text-2xl font-bold">{c.name}</h1>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      <section aria-labelledby="h-data" className="rounded-card border border-border-subtle p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="h-data" className="text-lg font-semibold">
            Datos del cliente
          </h2>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" size={16} />
            Editar
          </Button>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">{c.email}</Field>
          <Field label="Teléfono">{c.phone}</Field>
          <Field label="Registrado el">{fmtDateTime(c.createdAt)}</Field>
          <Field label="Última visita">
            {c.lastVisitAt ? fmtDateTime(c.lastVisitAt) : 'Todavía no ha venido'}
          </Field>
          <Field label="Marketing">{c.marketing ? 'Sí' : 'No'}</Field>
          <Field label="Progreso">{progress}</Field>
          <Field label="Visitas totales">{visits}</Field>
          <Field label="Premios canjeados">{rewards.length}</Field>
        </dl>
      </section>

      <ContactDialog
        open={editing}
        customer={c}
        onClose={() => setEditing(false)}
        onSaved={({ email, phone }) => {
          setState({ status: 'ready', c: { ...c, email, phone } })
          setEditing(false)
          setNotice('Datos de contacto actualizados.')
        }}
      />

      <section aria-labelledby="h-hist">
        <h2 id="h-hist" className="mb-2 text-lg font-semibold">
          Historial
        </h2>
        {c.movements.length === 0 ? (
          <p className="rounded-card border border-border-subtle p-6 text-center text-text-muted">
            Aún no hay movimientos. Aparecerán aquí cada vez que el cliente sume una visita o
            consiga un premio.
          </p>
        ) : (
          <>
            <table className="hidden w-full text-left text-sm md:table">
              <caption className="sr-only">Historial de movimientos</caption>
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th scope="col" className="py-2 pr-3">
                    Fecha y hora
                  </th>
                  {multi && (
                    <th scope="col" className="py-2 pr-3">
                      Tarjeta
                    </th>
                  )}
                  <th scope="col" className="py-2 pr-3">
                    Movimiento
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Cambio
                  </th>
                  <th scope="col" className="py-2">
                    Saldo después
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.movements.map((m) => (
                  <tr key={m.id} className="border-b border-border-subtle">
                    <td className="whitespace-nowrap py-2 pr-3">{fmtDateTime(m.at)}</td>
                    {multi && <td className="py-2 pr-3">{cardName(m.programId)}</td>}
                    <td className="py-2 pr-3 font-medium">
                      {m.kind === 'redeem' ? '🎁 ' : ''}
                      {KIND[m.kind] ?? m.kind}
                    </td>
                    <td className="py-2 pr-3">{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                    <td className="py-2">{m.balanceAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="space-y-2 md:hidden">
              {c.movements.map((m) => (
                <li key={m.id} className="rounded-card border border-border-subtle p-3">
                  <p className="font-semibold">
                    {m.kind === 'redeem' ? '🎁 ' : ''}
                    {KIND[m.kind] ?? m.kind} ({m.delta > 0 ? `+${m.delta}` : m.delta})
                  </p>
                  <p className="text-sm text-text-muted">
                    {fmtDateTime(m.at)}
                    {multi ? ` · ${cardName(m.programId)}` : ''} · Saldo {m.balanceAfter}
                  </p>
                </li>
              ))}
            </ul>
            {c.movements.length >= 500 && (
              <p className="mt-2 text-sm text-text-muted">Mostrando los últimos 500 movimientos.</p>
            )}
          </>
        )}
      </section>
    </main>
  )
}
