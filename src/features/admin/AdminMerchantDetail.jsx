import { useCallback, useEffect, useState } from 'react'
import { Award, Mail, MapPin, Megaphone, Phone, Stamp, Users } from 'lucide-react'
import { Link, useOutletContext, useParams } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { VisitsChart } from '../../components/ui/VisitsChart.jsx'
import { mapsUrl } from '../../lib/format.js'
import {
  REQUEST_STATUS,
  getMerchant,
  setApproval,
  setPlan,
  updateRequest,
} from '../../services/adminService.js'
import { PLANS } from '../../services/merchantService.js'
import { ApprovalChip, Stat } from './ui.jsx'
import { fmtDate, fmtDateTime, planName } from './format.js'

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3">
      {Icon && <Icon aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-text-muted" />}
      <div className="min-w-0">
        <dt className="text-sm text-text-muted">{label}</dt>
        <dd className="break-words font-medium">{children || '—'}</dd>
      </div>
    </div>
  )
}

/** /admin/comercios/:id — contacto, autorizacion, plan, solicitud abierta y actividad. */
export default function AdminMerchantDetail() {
  const { id } = useParams()
  const { reload } = useOutletContext()
  const [state, setState] = useState({ status: 'loading' })
  const [plan, setPlanSel] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)

  const load = useCallback(() => {
    getMerchant(id)
      .then((m) => {
        setState({ status: 'ready', m })
        setPlanSel(m.plan)
      })
      .catch(() => setState({ status: 'error' }))
  }, [id])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (state.m) document.title = `${state.m.name} · Admin`
  }, [state.m])

  const act = async (key, fn, ok) => {
    setBusy(key)
    setMsg(null)
    try {
      await fn()
      load()
      reload()
      setMsg({ tone: 'success', text: ok })
    } catch {
      setMsg({ tone: 'error', text: 'No se ha podido guardar. Inténtalo de nuevo.' })
    } finally {
      setBusy('')
    }
  }

  const back = (
    <Link to="/admin/comercios" className="text-sm font-medium text-primary">
      ← Comercios
    </Link>
  )
  if (state.status === 'loading')
    return (
      <main className="mx-auto max-w-5xl space-y-4 p-4 md:p-6" aria-busy="true">
        {back}
        <Skeleton className="h-40 w-full" />
      </main>
    )
  if (state.status === 'error')
    return (
      <main className="mx-auto max-w-5xl space-y-3 p-4 md:p-6">
        {back}
        <Alert tone="error">No encontramos este comercio.</Alert>
      </main>
    )

  const { m } = state
  const req = m.open_request
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        {back}
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold">
          {m.name} <ApprovalChip status={m.approval_status} />
        </h1>
        <p className="text-text-muted">
          /c/{m.slug} · registrado el {fmtDate(m.created_at)}
          {m.approved_at ? ` · autorizado el ${fmtDate(m.approved_at)}` : ''}
        </p>
      </div>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <section className="rounded-card border border-border-subtle bg-surface p-4">
        <h2 className="mb-3 text-lg font-semibold">Acceso a la plataforma</h2>
        <div className="flex flex-wrap gap-2">
          {m.approval_status !== 'approved' && (
            <Button
              loading={busy === 'approve'}
              onClick={() =>
                act('approve', () => setApproval(m.id, 'approved'), 'Comercio autorizado.')
              }
            >
              Autorizar
            </Button>
          )}
          {m.approval_status !== 'rejected' && (
            <Button
              variant="secondary"
              loading={busy === 'reject'}
              onClick={() =>
                act(
                  'reject',
                  () => setApproval(m.id, 'rejected'),
                  'Acceso retirado. Sus enlaces y tarjetas dejan de funcionar.',
                )
              }
            >
              {m.approval_status === 'approved' ? 'Retirar acceso' : 'Rechazar'}
            </Button>
          )}
        </div>
        {m.approval_status === 'approved' && (
          <p className="mt-2 text-sm text-text-muted">
            Retirar el acceso bloquea su panel y deja de admitir altas y visitas en sus tarjetas.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-border-subtle bg-surface p-4">
          <h2 className="mb-3 text-lg font-semibold">Datos de contacto</h2>
          <dl className="space-y-3">
            <Row icon={Mail} label="Email de acceso">
              {m.owner_email && (
                <a href={`mailto:${m.owner_email}`} className="text-primary hover:underline">
                  {m.owner_email}
                </a>
              )}
            </Row>
            <Row icon={Phone} label="Teléfono">
              {m.contact_phone && (
                <a href={`tel:${m.contact_phone}`} className="text-primary hover:underline">
                  {m.contact_phone}
                </a>
              )}
            </Row>
            <Row icon={Mail} label="Email RGPD">
              {m.privacy_email}
            </Row>
            <Row label="Razón social">{m.legal_name}</Row>
            <Row label="NIF/CIF">{m.tax_id}</Row>
            <Row icon={MapPin} label="Dirección">
              {m.address && (
                <a
                  href={mapsUrl({ address: m.address })}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {m.address}
                </a>
              )}
            </Row>
          </dl>
        </section>

        <section className="space-y-4 rounded-card border border-border-subtle bg-surface p-4">
          <h2 className="text-lg font-semibold">Plan</h2>
          {req && (
            <div className="rounded-control border-2 border-primary p-3">
              <p className="font-semibold">
                Pide cambiar de {planName(req.current_plan)} a {planName(req.requested_plan)}
              </p>
              <p className="text-sm text-text-muted">
                {REQUEST_STATUS[req.status]} · {fmtDateTime(req.created_at)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  loading={busy === 'apply'}
                  onClick={() =>
                    act(
                      'apply',
                      () => setPlan(m.id, req.requested_plan),
                      `Plan cambiado a ${planName(req.requested_plan)}.`,
                    )
                  }
                >
                  Aplicar {planName(req.requested_plan)}
                </Button>
                {req.status === 'pending' && (
                  <Button
                    variant="secondary"
                    loading={busy === 'contacted'}
                    onClick={() =>
                      act(
                        'contacted',
                        () => updateRequest(req.id, 'contacted'),
                        'Marcada como contactada.',
                      )
                    }
                  >
                    Marcar contactado
                  </Button>
                )}
                <Button
                  variant="link"
                  disabled={!!busy}
                  onClick={() =>
                    act('cancel', () => updateRequest(req.id, 'cancelled'), 'Solicitud cancelada.')
                  }
                >
                  Cancelar solicitud
                </Button>
              </div>
            </div>
          )}
          <div>
            <label htmlFor="adm-plan" className="mb-1.5 block text-sm font-medium">
              Plan actual: {planName(m.plan)}
            </label>
            <div className="flex flex-wrap gap-2">
              <select
                id="adm-plan"
                value={plan}
                onChange={(e) => setPlanSel(e.target.value)}
                className="min-h-[48px] rounded-control border-[1.5px] border-border bg-surface px-3 text-base"
              >
                {Object.entries(PLANS).map(([k, p]) => (
                  <option key={k} value={k}>
                    {p.name} ({p.cards} {p.cards === 1 ? 'tarjeta' : 'tarjetas'})
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                disabled={plan === m.plan}
                loading={busy === 'plan'}
                onClick={() =>
                  act('plan', () => setPlan(m.id, plan), `Plan cambiado a ${planName(plan)}.`)
                }
              >
                Guardar plan
              </Button>
            </div>
            <p className="mt-1 text-sm text-text-muted">
              Usa {m.cards_total} de {PLANS[m.plan]?.cards} tarjetas. Bajar de plan no borra
              tarjetas; solo impide crear más.
            </p>
          </div>
        </section>
      </div>

      <section aria-label="Actividad" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Users} label="Clientes" value={m.customers} />
        <Stat
          icon={Stamp}
          label="Visitas (30 días)"
          value={m.visits_30d}
          sub={`${m.visits_total} en total`}
        />
        <Stat icon={Award} label="Premios (30 días)" value={m.rewards_30d} />
        <Stat
          icon={Megaphone}
          label="Mensajes (30 días)"
          value={m.messages_30d}
          sub={`${m.promotions_total} promociones en total`}
        />
      </section>

      <VisitsChart daily={m.daily ?? []} />

      <section className="rounded-card border border-border-subtle bg-surface p-4">
        <h2 className="mb-3 text-lg font-semibold">Tarjetas ({m.cards.length})</h2>
        {m.cards.length === 0 ? (
          <p className="text-text-muted">Todavía no ha creado tarjetas.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {m.cards.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <span
                  aria-hidden="true"
                  className="h-8 w-8 shrink-0 rounded-control"
                  style={{ background: c.brand_color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.card_name}</p>
                  <p className="text-sm text-text-muted">
                    {c.type === 'points' ? `${c.threshold} puntos` : `${c.threshold} visitas`} ·{' '}
                    {c.reward_description} · {c.customers} clientes
                  </p>
                </div>
                <span className="rounded-chip border border-border-subtle px-2 py-0.5 text-xs">
                  {c.status === 'active'
                    ? 'Activa'
                    : c.status === 'draft'
                      ? 'Borrador'
                      : 'Archivada'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {m.requests.length > 0 && (
        <section className="rounded-card border border-border-subtle bg-surface p-4">
          <h2 className="mb-3 text-lg font-semibold">Historial de solicitudes de plan</h2>
          <ul className="divide-y divide-border-subtle text-sm">
            {m.requests.map((r) => (
              <li key={r.id} className="py-2">
                {planName(r.current_plan)} → {planName(r.requested_plan)} ·{' '}
                {REQUEST_STATUS[r.status]} · {fmtDateTime(r.created_at)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
