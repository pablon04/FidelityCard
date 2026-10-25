import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { listMerchants } from '../../services/adminService.js'
import { ApprovalChip } from './ui.jsx'
import { fmtDate, planName } from './format.js'

const TABS = [
  ['pending', 'Pendientes'],
  ['approved', 'Clientes'],
  ['rejected', 'Rechazados'],
  ['all', 'Todos'],
]

/** /admin/comercios — altas pendientes, clientes (autorizados) y rechazados. */
export default function AdminMerchants() {
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState({ status: 'loading', rows: [] })
  const [q, setQ] = useState('')

  useEffect(() => {
    document.title = 'Comercios · Admin'
    listMerchants()
      .then((rows) => {
        setState({ status: 'ready', rows })
        // Por defecto: pendientes si los hay; si no, clientes.
        if (!params.get('tab'))
          setParams(
            { tab: rows.some((r) => r.approval_status === 'pending') ? 'pending' : 'approved' },
            { replace: true },
          )
      })
      .catch(() => setState({ status: 'error', rows: [] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tab = params.get('tab') ?? 'pending'
  const count = (t) =>
    t === 'all' ? state.rows.length : state.rows.filter((r) => r.approval_status === t).length
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return state.rows.filter(
      (r) =>
        (tab === 'all' || r.approval_status === tab) &&
        (!t ||
          [r.name, r.owner_email, r.legal_name, r.slug].some((x) => x?.toLowerCase().includes(t))),
    )
  }, [state.rows, tab, q])

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold">Comercios</h1>
      <div role="tablist" aria-label="Estado" className="flex flex-wrap gap-2">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams({ tab: t }, { replace: true })}
            className={`min-h-[44px] rounded-chip border px-4 text-sm font-medium ${
              tab === t ? 'border-primary bg-primary text-on-primary' : 'border-border'
            }`}
          >
            {label} ({count(t)})
          </button>
        ))}
      </div>
      <input
        type="search"
        aria-label="Buscar comercio"
        placeholder="Buscar por nombre, email o razón social"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-h-[48px] w-full rounded-control border-[1.5px] border-border bg-surface px-3 text-base"
      />
      {state.status === 'loading' && <Skeleton className="h-48 w-full" />}
      {state.status === 'error' && (
        <Alert tone="error">No hemos podido cargar los comercios.</Alert>
      )}
      {state.status === 'ready' && rows.length === 0 && (
        <p className="rounded-card border border-border-subtle p-6 text-center text-text-muted">
          No hay comercios en esta lista.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface">
          {rows.map((m) => (
            <li key={m.id}>
              <Link
                to={`/admin/comercios/${m.id}`}
                className="flex min-h-[64px] items-center gap-3 p-3 hover:bg-bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {m.name} <ApprovalChip status={m.approval_status} />
                    {m.open_request && (
                      <span className="rounded-chip border border-primary px-2 py-0.5 text-xs font-medium text-primary">
                        Pide {planName(m.open_request.requested_plan)}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-text-muted">
                    {m.owner_email} · Plan {planName(m.plan)} · {m.cards_active} tarjetas activas ·{' '}
                    {m.customers} clientes · alta {fmtDate(m.created_at)}
                  </p>
                </div>
                <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
