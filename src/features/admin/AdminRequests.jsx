import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import {
  REQUEST_STATUS,
  listRequests,
  setPlan,
  updateRequest,
} from '../../services/adminService.js'
import { fmtDateTime, planDirection, planName } from './format.js'

const OPEN = ['pending', 'contacted']

/** /admin/solicitudes — comercios que han pulsado "Contratar este plan" en su Cuenta. */
export default function AdminRequests() {
  const { reload } = useOutletContext()
  const [state, setState] = useState({ status: 'loading', rows: [] })
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    listRequests()
      .then((rows) => setState({ status: 'ready', rows }))
      .catch(() => setState({ status: 'error', rows: [] }))
  }, [])
  useEffect(() => {
    document.title = 'Solicitudes · Admin'
    load()
  }, [load])

  const act = async (key, fn) => {
    setBusy(key)
    try {
      await fn()
      load()
      reload()
    } finally {
      setBusy('')
    }
  }

  const open = state.rows.filter((r) => OPEN.includes(r.status))
  const closed = state.rows.filter((r) => !OPEN.includes(r.status))

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Solicitudes de cambio de plan</h1>
        <p className="text-text-muted">
          Contacta con el comercio, acordad el pago y aplica el plan. Al aplicarlo la solicitud se
          cierra sola.
        </p>
      </div>
      {state.status === 'loading' && <Skeleton className="h-40 w-full" />}
      {state.status === 'error' && (
        <Alert tone="error">No hemos podido cargar las solicitudes.</Alert>
      )}

      <section aria-labelledby="h-open">
        <h2 id="h-open" className="mb-2 text-lg font-semibold">
          Pendientes de comunicación ({open.length})
        </h2>
        {state.status === 'ready' && open.length === 0 && (
          <p className="rounded-card border border-border-subtle p-6 text-center text-text-muted">
            No hay solicitudes pendientes.
          </p>
        )}
        <ul className="space-y-3">
          {open.map((r) => (
            <li key={r.id} className="rounded-card border border-border-subtle bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    to={`/admin/comercios/${r.merchant.id}`}
                    className="text-lg font-semibold hover:underline"
                  >
                    {r.merchant.name}
                  </Link>
                  <p className="font-medium">
                    {planName(r.current_plan)} → {planName(r.requested_plan)}
                    {` (${planDirection(r.current_plan, r.requested_plan)})`}
                  </p>
                  <p className="text-sm text-text-muted">
                    {REQUEST_STATUS[r.status]} · pedida el {fmtDateTime(r.created_at)}
                  </p>
                </div>
                <div className="text-right text-sm">
                  {r.merchant.owner_email && (
                    <a
                      href={`mailto:${r.merchant.owner_email}`}
                      className="block text-primary hover:underline"
                    >
                      {r.merchant.owner_email}
                    </a>
                  )}
                  {r.merchant.contact_phone && (
                    <a
                      href={`tel:${r.merchant.contact_phone}`}
                      className="block text-primary hover:underline"
                    >
                      {r.merchant.contact_phone}
                    </a>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  loading={busy === `apply-${r.id}`}
                  onClick={() =>
                    act(`apply-${r.id}`, () => setPlan(r.merchant.id, r.requested_plan))
                  }
                >
                  Aplicar {planName(r.requested_plan)}
                </Button>
                {r.status === 'pending' && (
                  <Button
                    variant="secondary"
                    loading={busy === `c-${r.id}`}
                    onClick={() => act(`c-${r.id}`, () => updateRequest(r.id, 'contacted'))}
                  >
                    Marcar contactado
                  </Button>
                )}
                <Button
                  variant="link"
                  disabled={!!busy}
                  onClick={() => act(`x-${r.id}`, () => updateRequest(r.id, 'cancelled'))}
                >
                  Cancelar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {closed.length > 0 && (
        <section aria-labelledby="h-closed">
          <h2 id="h-closed" className="mb-2 text-lg font-semibold">
            Cerradas
          </h2>
          <ul className="divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface text-sm">
            {closed.map((r) => (
              <li key={r.id} className="p-3">
                <span className="font-medium">{r.merchant.name}</span>: {planName(r.current_plan)} →{' '}
                {planName(r.requested_plan)} · {REQUEST_STATUS[r.status]} ·{' '}
                {fmtDateTime(r.created_at)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
