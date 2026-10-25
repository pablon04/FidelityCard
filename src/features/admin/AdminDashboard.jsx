import { useCallback, useEffect, useState } from 'react'
import {
  Award,
  ClipboardList,
  CreditCard,
  Megaphone,
  Stamp,
  Store,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { Link, useOutletContext } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { VisitsChart } from '../../components/ui/VisitsChart.jsx'
import { getOverview, listMerchants, setApproval } from '../../services/adminService.js'
import { PLANS } from '../../services/merchantService.js'
import { Stat } from './ui.jsx'
import { fmtDate, fmtDateTime, planName } from './format.js'

/** /admin — actividad de toda la plataforma y altas pendientes de autorizar. */
export default function AdminDashboard() {
  const { reload } = useOutletContext()
  const [state, setState] = useState({ status: 'loading' })
  const [busy, setBusy] = useState(null)

  const load = useCallback(() => {
    Promise.all([getOverview(), listMerchants()])
      .then(([o, ms]) =>
        setState({
          status: 'ready',
          o,
          pending: ms.filter((m) => m.approval_status === 'pending'),
        }),
      )
      .catch(() => setState({ status: 'error' }))
  }, [])
  useEffect(() => {
    document.title = 'Admin · FidelityCard'
    load()
  }, [load])

  const approve = async (id, status) => {
    setBusy(id)
    try {
      await setApproval(id, status)
      load()
      reload()
    } finally {
      setBusy(null)
    }
  }

  if (state.status === 'loading')
    return (
      <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </main>
    )
  if (state.status === 'error')
    return (
      <main className="mx-auto max-w-6xl space-y-3 p-4 md:p-6">
        <Alert tone="error">No hemos podido cargar el resumen.</Alert>
        <Button onClick={load}>Reintentar</Button>
      </main>
    )

  const { o, pending } = state
  const plans = Object.entries(PLANS).map(([k, p]) => [p.name, o.plans[k] ?? 0])

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">Resumen de la plataforma</h1>

      <section
        aria-labelledby="h-pending"
        className="rounded-card border-2 border-warning bg-surface p-4"
      >
        <h2 id="h-pending" className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <UserPlus aria-hidden="true" size={20} /> Pendientes de autorizar ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-text-muted">No hay comercios esperando autorización.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {pending.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/admin/comercios/${m.id}`} className="font-semibold hover:underline">
                    {m.name}
                  </Link>
                  <p className="truncate text-sm text-text-muted">
                    {m.owner_email} · registrado el {fmtDate(m.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => approve(m.id, 'approved')} loading={busy === m.id}>
                    Autorizar
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => approve(m.id, 'rejected')}
                    disabled={busy === m.id}
                  >
                    Rechazar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Métricas" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={Store}
          label="Comercios activos"
          value={o.merchants.approved}
          sub={`+${o.merchants.new_month} registros este mes`}
          to="/admin/comercios"
        />
        <Stat
          icon={ClipboardList}
          label="Solicitudes de plan"
          value={o.open_requests}
          sub="Pendientes de contactar"
          to="/admin/solicitudes"
        />
        <Stat icon={CreditCard} label="Tarjetas activas" value={o.cards_active} />
        <Stat
          icon={Users}
          label="Clientes finales"
          value={o.customers.total}
          sub={`+${o.customers.new_month} este mes`}
        />
        <Stat icon={Stamp} label="Visitas este mes" value={o.visits_month} />
        <Stat icon={Award} label="Premios este mes" value={o.rewards_month} />
        <Stat icon={Megaphone} label="Mensajes este mes" value={o.messages_month} />
        <Stat icon={Wallet} label="Pases en Wallet" value={o.wallet_saved} />
      </section>

      <VisitsChart daily={o.daily ?? []} title="Visitas en toda la plataforma (30 días)" />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section
          aria-labelledby="h-top"
          className="rounded-card border border-border-subtle bg-surface p-4"
        >
          <h2 id="h-top" className="mb-3 text-lg font-semibold">
            Actividad por comercio (30 días)
          </h2>
          {o.top.length === 0 ? (
            <p className="text-text-muted">Aún no hay comercios autorizados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <caption className="sr-only">Comercios ordenados por visitas</caption>
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th scope="col" className="py-2 pr-3">
                      Comercio
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Plan
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      Clientes
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      Visitas
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      Premios
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      Mensajes
                    </th>
                    <th scope="col" className="py-2">
                      Última actividad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {o.top.map((m) => (
                    <tr key={m.id} className="border-b border-border-subtle">
                      <td className="py-2 pr-3">
                        <Link
                          to={`/admin/comercios/${m.id}`}
                          className="font-medium hover:underline"
                        >
                          {m.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{planName(m.plan)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.customers}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.visits_30d}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.rewards_30d}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.messages_30d}</td>
                      <td className="whitespace-nowrap py-2">{fmtDateTime(m.last_activity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="h-plans"
          className="rounded-card border border-border-subtle bg-surface p-4"
        >
          <h2 id="h-plans" className="mb-3 text-lg font-semibold">
            Comercios por plan
          </h2>
          <ul className="space-y-3">
            {plans.map(([name, n]) => (
              <li key={name}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{name}</span>
                  <span className="tabular-nums">{n}</span>
                </div>
                <div aria-hidden="true" className="mt-1 h-2 rounded-full bg-bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${o.merchants.approved ? (n / o.merchants.approved) * 100 : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
