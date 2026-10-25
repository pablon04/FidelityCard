import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Sheet } from '../../components/ui/Sheet.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { PhoneField } from '../../components/ui/PhoneField.jsx'
import { dialOf, normalizePhone, splitE164, stripDialPrefix } from '../../lib/phone.js'
import { getCustomerDetail, updateCustomerPhone } from '../../services/customersService.js'
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

const PHONE_ERRORS = {
  phone_taken: 'Ese teléfono ya lo tiene otro cliente de tu comercio.',
  invalid_phone: 'Revisa el teléfono.',
  forbidden: 'No tienes permiso para cambiar este cliente.',
}

/** Dialogo para cambiar el telefono (cliente que cambio de numero). */
function PhoneDialog({ open, customer, onClose, onSaved }) {
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('ES')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const cur = splitE164(customer.phone)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCountry(cur.country)
    setPhone(cur.number)
    setError('')
  }, [open, customer.phone])

  const save = async (e) => {
    e.preventDefault()
    const e164 = normalizePhone(phone, dialOf(country))
    if (!e164) return setError('Escribe un teléfono válido.')
    if (e164 === customer.phone) return onClose()
    setBusy(true)
    setError('')
    try {
      onSaved(await updateCustomerPhone(customer.id, e164))
    } catch (err) {
      setError(PHONE_ERRORS[err.code] ?? 'No hemos podido guardar el teléfono. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet variant="dialog" open={open} onClose={onClose} title="Cambiar teléfono">
      <form onSubmit={save} noValidate className="space-y-4">
        <p className="text-sm text-text-muted">
          Úsalo si {customer.name} ha cambiado de número. Con el nuevo teléfono y su email podrá
          recuperar su tarjeta en otro móvil.
        </p>
        <PhoneField
          label="Nuevo teléfono"
          required
          name="phone"
          autoComplete="off"
          country={country}
          onCountryChange={(c) => {
            setCountry(c)
            setError('')
          }}
          value={phone}
          onChange={(e) => {
            setPhone(stripDialPrefix(e.target.value, dialOf(country)))
            setError('')
          }}
          error={error}
        />
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
  const [editPhone, setEditPhone] = useState(false)
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
        <h2 id="h-data" className="sr-only">
          Datos del cliente
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">{c.email}</Field>
          <Field label="Teléfono">
            {c.phone}{' '}
            <Button variant="link" onClick={() => setEditPhone(true)}>
              Cambiar
            </Button>
          </Field>
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

      <PhoneDialog
        open={editPhone}
        customer={c}
        onClose={() => setEditPhone(false)}
        onSaved={(phone) => {
          setState({ status: 'ready', c: { ...c, phone } })
          setEditPhone(false)
          setNotice('Teléfono actualizado.')
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
