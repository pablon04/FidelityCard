import { useCallback, useEffect, useState } from 'react'
import {
  Award,
  CreditCard,
  Megaphone,
  Plus,
  ShieldCheck,
  Stamp,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { getDashboard } from '../../services/merchantService.js'
import { useMerchant } from '../merchant/merchantCtx.js'
import { VisitsChart } from '../../components/ui/VisitsChart.jsx'

const fmtAgo = (iso) =>
  new Date(iso).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
const MONTH = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

const KIND = {
  earn_visit: 'sumó una visita',
  earn_points: 'sumó puntos',
  redeem: 'consiguió su premio',
  adjust: 'tuvo un ajuste',
  reversal: 'tuvo una anulación',
}

/** Diferencia con el mes anterior, en texto (nunca solo color). */
function Delta({ now, prev }) {
  if (prev == null) return null
  const d = now - prev
  const text = d === 0 ? 'igual que el mes pasado' : `${d > 0 ? '+' : ''}${d} vs. mes pasado`
  return <p className="mt-1 text-sm text-text-muted">{text}</p>
}

function Stat({ icon: Icon, label, value, children, to }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm font-medium text-text-muted">
        <Icon aria-hidden="true" size={18} />
        {label}
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-text">{value}</p>
      {children}
    </>
  )
  const cls = 'block rounded-card border border-border-subtle bg-surface p-4'
  return to ? (
    <Link to={to} className={`${cls} hover:border-border`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** /app — Inicio: resumen del comercio (tarjetas, clientes, visitas, mensajes). */
export default function DashboardPage() {
  const { merchant, plan, canAddCard } = useMerchant()
  const [state, setState] = useState({ status: 'loading' })

  const load = useCallback(() => {
    setState({ status: 'loading' })
    getDashboard(merchant.id)
      .then((d) => setState({ status: 'ready', d }))
      .catch(() => setState({ status: 'error' }))
  }, [merchant.id])

  useEffect(() => {
    document.title = 'Inicio · FidelityCard'
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  if (state.status === 'loading')
    return (
      <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-56 w-full" />
      </main>
    )
  if (state.status === 'error')
    return (
      <main className="mx-auto max-w-6xl space-y-3 p-4 md:p-6">
        <Alert tone="error">No hemos podido cargar el resumen. Inténtalo de nuevo.</Alert>
        <Button onClick={load}>Reintentar</Button>
      </main>
    )

  const { d } = state
  const active = d.cards.filter((c) => c.status === 'active').length
  const pct = (n) => (d.customers.total ? Math.round((n / d.customers.total) * 100) : 0)

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {merchant.name}</h1>
        <p className="text-text-muted">
          Resumen de <span className="capitalize">{MONTH}</span>
        </p>
      </div>

      {!(merchant.legal_name?.trim() && merchant.privacy_email?.trim()) && (
        <Alert tone="info">
          Te faltan tus datos legales.{' '}
          <Link to="/app/cuenta" className="font-semibold underline">
            Complétalos en Cuenta
          </Link>{' '}
          para poder activar tarjetas.
        </Alert>
      )}
      {d.cards.length === 0 && (
        <Alert tone="info">
          Aún no tienes ninguna tarjeta.{' '}
          <Link to="/app/tarjetas/nueva" className="font-semibold underline">
            Crea la primera
          </Link>{' '}
          para empezar a sumar clientes.
        </Alert>
      )}

      <section aria-label="Métricas" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={CreditCard}
          label="Tarjetas"
          value={`${d.cards.length}/${d.card_limit}`}
          to="/app/tarjetas"
        >
          <p className="mt-1 text-sm text-text-muted">
            {active} {active === 1 ? 'activa' : 'activas'} · Plan {plan.name}
          </p>
        </Stat>
        <Stat icon={Users} label="Clientes" value={d.customers.total} to="/app/clientes">
          <p className="mt-1 text-sm text-text-muted">+{d.customers.new_month} este mes</p>
        </Stat>
        <Stat icon={Stamp} label="Visitas este mes" value={d.visits.month}>
          <Delta now={d.visits.month} prev={d.visits.prev} />
        </Stat>
        <Stat icon={Award} label="Premios este mes" value={d.rewards.month}>
          <p className="mt-1 text-sm text-text-muted">{d.rewards.total} desde el inicio</p>
        </Stat>
        <Stat icon={UserCheck} label="Clientes activos" value={d.customers.active_30d}>
          <p className="mt-1 text-sm text-text-muted">
            Vinieron en 30 días ({pct(d.customers.active_30d)}%)
          </p>
        </Stat>
        <Stat
          icon={Megaphone}
          label="Mensajes este mes"
          value={d.messages.sent_month}
          to="/app/promocionar"
        >
          <p className="mt-1 text-sm text-text-muted">
            {d.messages.promotions_month}{' '}
            {d.messages.promotions_month === 1 ? 'promoción' : 'promociones'}
          </p>
        </Stat>
        <Stat icon={Wallet} label="En Google Wallet" value={d.wallet_saved}>
          <p className="mt-1 text-sm text-text-muted">Pases guardados</p>
        </Stat>
        <Stat
          icon={ShieldCheck}
          label="Aceptan promociones"
          value={`${pct(d.customers.marketing)}%`}
        >
          <p className="mt-1 text-sm text-text-muted">{d.customers.marketing} clientes</p>
        </Stat>
      </section>

      <VisitsChart daily={d.daily ?? []} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="h-cards"
          className="rounded-card border border-border-subtle bg-surface p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="h-cards" className="text-lg font-semibold">
              Tus tarjetas
            </h2>
            {canAddCard && (
              <Link
                to="/app/tarjetas/nueva"
                className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-primary"
              >
                <Plus aria-hidden="true" size={18} /> Nueva
              </Link>
            )}
          </div>
          {d.cards.length === 0 ? (
            <p className="text-text-muted">Sin tarjetas todavía.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {d.cards.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/app/tarjetas/${c.id}`}
                    className="flex min-h-[52px] items-center gap-3 py-2"
                  >
                    <span
                      aria-hidden="true"
                      className="h-8 w-8 shrink-0 rounded-control"
                      style={{ background: c.brand_color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.card_name}</span>
                      <span className="block text-sm text-text-muted">
                        {c.type === 'points' ? `${c.threshold} puntos` : `${c.threshold} visitas`}
                        {' · '}
                        {c.customers} {c.customers === 1 ? 'cliente' : 'clientes'}
                      </span>
                    </span>
                    <span className="rounded-chip border border-border-subtle px-2 py-0.5 text-xs">
                      {c.status === 'active' ? 'Activa' : 'Borrador'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!canAddCard && (
            <p className="mt-3 text-sm text-text-muted">
              Has usado las {d.card_limit} {d.card_limit === 1 ? 'tarjeta' : 'tarjetas'} de tu plan{' '}
              {plan.name}. Para añadir más, pásate a un plan superior.
            </p>
          )}
        </section>

        <section
          aria-labelledby="h-recent"
          className="rounded-card border border-border-subtle bg-surface p-4"
        >
          <h2 id="h-recent" className="mb-3 text-lg font-semibold">
            Actividad reciente
          </h2>
          {d.recent.length === 0 ? (
            <p className="text-text-muted">
              Aquí verás cada visita y cada premio en cuanto tus clientes empiecen a usar la
              tarjeta.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {d.recent.map((r, i) => (
                <li key={i} className="py-2">
                  <p>
                    <Link
                      to={`/app/clientes/${r.customer_id}`}
                      className="font-medium hover:underline"
                    >
                      {r.customer}
                    </Link>{' '}
                    {KIND[r.kind] ?? r.kind}
                    {r.kind === 'earn_points' ? ` (+${r.delta})` : ''}
                    {r.kind === 'redeem' ? ' 🎁' : ''}
                  </p>
                  <p className="text-sm text-text-muted">
                    {fmtAgo(r.at)}
                    {d.cards.length > 1 ? ` · ${r.card_name}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {d.messages.last && (
            <div className="mt-4 rounded-control bg-bg-muted p-3 text-sm">
              <p className="font-medium">Última promoción: «{d.messages.last.title}»</p>
              <p className="text-text-muted">
                Enviada a {d.messages.last.sent} de {d.messages.last.total} ·{' '}
                {fmtAgo(d.messages.last.created_at)}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
