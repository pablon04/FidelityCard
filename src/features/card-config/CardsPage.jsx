import { useEffect, useState } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, QrCode } from 'lucide-react'
import { Link } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Sheet } from '../../components/ui/Sheet.jsx'
import { archiveProgram, restoreProgram } from '../../services/merchantService.js'
import { useMerchant } from '../merchant/merchantCtx.js'

const STATUS = { active: 'Activa', draft: 'Borrador', archived: 'Archivada' }

/** /app/tarjetas — tarjetas del comercio y hueco disponible segun su plan. */
export default function CardsPage() {
  const { programs, cards, plan, canAddCard, refresh } = useMerchant()
  const [confirm, setConfirm] = useState(null) // programa a archivar
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const archived = programs.filter((p) => p.status === 'archived')

  useEffect(() => {
    document.title = 'Tarjetas · FidelityCard'
  }, [])

  const run = async (fn, ok) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      await refresh()
      setMsg({ tone: 'success', text: ok })
    } catch (e) {
      setMsg({
        tone: 'error',
        text:
          e?.code === 'plan_limit'
            ? `Tu plan ${plan.name} permite ${plan.cards} ${plan.cards === 1 ? 'tarjeta' : 'tarjetas'}. Archiva otra o mejora tu plan.`
            : 'No hemos podido completar la acción. Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tarjetas</h1>
          <p className="text-text-muted">
            Usas {cards.length} de {plan.cards} {plan.cards === 1 ? 'tarjeta' : 'tarjetas'} de tu
            plan {plan.name}.
          </p>
        </div>
        {canAddCard ? (
          <Link
            to="/app/tarjetas/nueva"
            className="inline-flex min-h-[48px] items-center gap-2 rounded-control bg-primary px-4 font-semibold text-on-primary"
          >
            <Plus aria-hidden="true" size={20} /> Nueva tarjeta
          </Link>
        ) : (
          <p className="max-w-xs text-sm text-text-muted">
            Has llegado al límite de tu plan. Para crear más tarjetas, pásate a Pro (3) o Premium
            (10).
          </p>
        )}
      </div>

      <div
        aria-hidden="true"
        className="h-2 w-full overflow-hidden rounded-full bg-bg-muted"
        title={`${cards.length}/${plan.cards}`}
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, (cards.length / plan.cards) * 100)}%` }}
        />
      </div>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {cards.length === 0 ? (
        <p className="rounded-card border border-border-subtle p-6 text-center text-text-muted">
          Aún no tienes tarjetas. Crea la primera para empezar.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((p) => (
            <li key={p.id} className="rounded-card border border-border-subtle bg-surface p-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="h-12 w-12 shrink-0 rounded-control"
                  style={{ background: p.brand_color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">{p.card_name}</p>
                  <p className="text-sm text-text-muted">
                    {p.type === 'points' ? `${p.threshold} puntos` : `${p.threshold} visitas`} ·{' '}
                    {p.reward_description}
                  </p>
                </div>
                <span className="rounded-chip border border-border-subtle px-2 py-0.5 text-xs">
                  {STATUS[p.status]}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={`/app/tarjetas/${p.id}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-control border-[1.5px] border-border px-3 font-medium"
                >
                  <Pencil aria-hidden="true" size={16} /> Editar
                </Link>
                {p.status === 'active' && (
                  <Link
                    to={`/app/share?card=${p.id}`}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-control border-[1.5px] border-border px-3 font-medium"
                  >
                    <QrCode aria-hidden="true" size={16} /> Compartir
                  </Link>
                )}
                <Button variant="link" onClick={() => setConfirm(p)} disabled={busy}>
                  <Archive aria-hidden="true" size={16} className="mr-1 inline" /> Archivar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section aria-labelledby="h-arch">
          <h2 id="h-arch" className="mb-2 text-lg font-semibold">
            Archivadas
          </h2>
          <ul className="divide-y divide-border-subtle rounded-card border border-border-subtle">
            {archived.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1 truncate">{p.card_name}</span>
                <Button
                  variant="secondary"
                  disabled={busy || !canAddCard}
                  onClick={() =>
                    run(() => restoreProgram(p.id), 'Tarjeta recuperada como borrador.')
                  }
                >
                  <ArchiveRestore aria-hidden="true" size={16} className="mr-1.5" /> Recuperar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Sheet
        variant="dialog"
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Archivar tarjeta"
      >
        <p>
          «{confirm?.card_name}» dejará de admitir altas y visitas. Los clientes conservan su saldo
          y podrás recuperarla más tarde.
        </p>
        <div className="mt-4 flex gap-3">
          <Button
            loading={busy}
            onClick={() => run(() => archiveProgram(confirm.id), 'Tarjeta archivada.')}
          >
            Archivar
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
    </main>
  )
}
