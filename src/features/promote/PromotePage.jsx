import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { TextField } from '../../components/ui/TextField.jsx'
import { SIGNUP_FILTERS, VISIT_FILTERS, listAllCustomers } from '../../services/customersService.js'
import { listPromotions, sendPromotion } from '../../services/promotionsService.js'
import { useMerchant } from '../merchant/merchantCtx.js'

const fmt = (iso) =>
  new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
const fmtVisit = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES') : 'Nunca')
const MAX = 500

const ERRORS = {
  wallet_disabled: 'Google Wallet no está activado en el servidor.',
  rate_limited: 'Demasiados envíos seguidos. Espera un poco e inténtalo de nuevo.',
  validation_error: 'Revisa el mensaje y los destinatarios.',
  unauthorized: 'Tu sesión ha caducado. Vuelve a entrar.',
  network: 'No hemos podido conectar. Revisa tu conexión.',
}

const selectCls =
  'min-h-[48px] rounded-control border-[1.5px] border-border bg-surface px-3 text-base'

/** /app/promocionar — mensaje con notificacion a la tarjeta de Wallet de los clientes elegidos. */
export default function PromotePage() {
  const { merchant } = useMerchant()
  const [signup, setSignup] = useState('all')
  const [visit, setVisit] = useState('away30')
  const [search, setSearch] = useState('')
  const [list, setList] = useState({ status: 'loading', rows: [] })
  const [picked, setPicked] = useState(() => new Set())
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [code, setCode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    document.title = 'Promocionar · FidelityCard'
  }, [])

  const loadHistory = useCallback(() => {
    listPromotions(merchant.id)
      .then(setHistory)
      .catch(() => {})
  }, [merchant.id])
  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList((l) => ({ ...l, status: 'loading' }))
    const t = setTimeout(() => {
      listAllCustomers(merchant.id, { search, signup, visit, ascending: false })
        .then((rows) => {
          if (!alive) return
          setList({ status: 'ready', rows })
          setPicked(new Set()) // al cambiar el filtro se limpia la seleccion
        })
        .catch(() => alive && setList({ status: 'error', rows: [] }))
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [merchant.id, search, signup, visit])

  const rows = list.rows
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id))
  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))

  const errs = useMemo(() => {
    const e = {}
    if (title.trim().length < 1 || title.trim().length > 60) e.title = 'Entre 1 y 60 caracteres.'
    if (text.trim().length < 1 || text.trim().length > 300) e.text = 'Entre 1 y 300 caracteres.'
    if (code.trim().length > 30) e.code = 'Máximo 30 caracteres.'
    return e
  }, [title, text, code])
  const valid = Object.keys(errs).length === 0 && picked.size >= 1 && picked.size <= MAX
  const noMarketing = rows.filter((r) => picked.has(r.id) && !r.marketing).length

  const send = async () => {
    setSending(true)
    setError(null)
    setResult(null)
    try {
      const r = await sendPromotion({
        title: title.trim(),
        text: text.trim(),
        code: code.trim(),
        customerIds: [...picked],
      })
      setResult(r)
      setConfirming(false)
      loadHistory()
    } catch (e) {
      setError(ERRORS[e.code] ?? 'No hemos podido enviar la promoción. Inténtalo de nuevo.')
      setConfirming(false)
    } finally {
      setSending(false)
    }
  }

  const preview = code.trim() ? `${text.trim()}\n\nCódigo: ${code.trim()}` : text.trim()

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Promocionar</h1>
        <p className="text-text-muted">
          Envía un mensaje con notificación a la tarjeta de Google Wallet de tus clientes. Solo lo
          reciben quienes tienen la tarjeta guardada en Wallet.
        </p>
      </div>

      <section aria-labelledby="h-to" className="space-y-3">
        <h2 id="h-to" className="text-lg font-semibold">
          1. ¿A quién?
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="pq" className="mb-1.5 block text-sm font-medium">
              Buscar
            </label>
            <input
              id="pq"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-[48px] w-full rounded-control border-[1.5px] border-border bg-surface px-3 text-base"
            />
          </div>
          <div>
            <label htmlFor="pv" className="mb-1.5 block text-sm font-medium">
              Última visita
            </label>
            <select
              id="pv"
              value={visit}
              onChange={(e) => setVisit(e.target.value)}
              className={selectCls}
            >
              {VISIT_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ps" className="mb-1.5 block text-sm font-medium">
              Registrados
            </label>
            <select
              id="ps"
              value={signup}
              onChange={(e) => setSignup(e.target.value)}
              className={selectCls}
            >
              {SIGNUP_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {list.status === 'error' && (
          <Alert tone="error">No hemos podido cargar los clientes.</Alert>
        )}
        {list.status === 'ready' && rows.length === 0 && (
          <p className="rounded-card border border-border-subtle p-4 text-center text-text-muted">
            Ningún cliente coincide con estos filtros.
          </p>
        )}
        {rows.length > 0 && (
          <div className="rounded-card border border-border-subtle">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle p-3">
              <label className="flex min-h-[44px] items-center gap-3 font-medium">
                <input
                  type="checkbox"
                  checked={allPicked}
                  onChange={toggleAll}
                  className="h-6 w-6 accent-[var(--primary)]"
                />
                Seleccionar todos ({rows.length})
              </label>
              <p role="status" className="text-sm text-text-muted">
                {picked.size} seleccionados
              </p>
            </div>
            <ul className="max-h-80 divide-y divide-border-subtle overflow-y-auto">
              {rows.map((r) => (
                <li key={r.id}>
                  <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={picked.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="h-6 w-6 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-sm text-text-muted">
                        Última visita: {fmtVisit(r.lastVisitAt)}
                        {r.marketing ? '' : ' · sin consentimiento de marketing'}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {picked.size > MAX && (
          <Alert tone="error">Puedes enviar a un máximo de {MAX} clientes cada vez.</Alert>
        )}
      </section>

      <section aria-labelledby="h-msg" className="space-y-4">
        <h2 id="h-msg" className="text-lg font-semibold">
          2. Mensaje
        </h2>
        <TextField
          label="Título"
          required
          maxLength={60}
          placeholder="¡Te echamos de menos!"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={title && errs.title}
        />
        <div>
          <label htmlFor="ptext" className="mb-1.5 block text-sm font-medium">
            Texto <span className="font-normal text-text-muted">(obligatorio)</span>
          </label>
          <textarea
            id="ptext"
            rows={4}
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hace mucho que no vienes. Te hacemos un 20% en tu próxima compra."
            className="w-full rounded-control border-[1.5px] border-border bg-surface p-3 text-base"
          />
          <p className="mt-1 text-sm text-text-muted">{text.length}/300</p>
        </div>
        <TextField
          label="Código (opcional)"
          maxLength={30}
          placeholder="VUELVE20"
          help="Se añade al final del mensaje. El cliente lo dice en caja."
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={errs.code}
        />
        {(title.trim() || text.trim()) && (
          <div
            className="rounded-card border border-border-subtle bg-bg-muted p-4"
            aria-label="Vista previa"
          >
            <p className="text-sm text-text-muted">Vista previa en la tarjeta</p>
            <p className="font-semibold">{title.trim()}</p>
            <p className="whitespace-pre-line">{preview}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="h-send" className="space-y-3">
        <h2 id="h-send" className="text-lg font-semibold">
          3. Enviar
        </h2>
        {error && <Alert tone="error">{error}</Alert>}
        {result && (
          <Alert tone={result.failed ? 'info' : 'success'}>
            Enviado a {result.sent} de {result.total} clientes.
            {result.failed > 0 &&
              ` ${result.failed} no se han podido entregar (por ejemplo, por no tener la tarjeta en Wallet).`}
            {result.skipped > 0 && ` ${result.skipped} omitidos.`}
          </Alert>
        )}
        {!confirming ? (
          <Button onClick={() => setConfirming(true)} disabled={!valid}>
            Revisar y enviar a {picked.size} {picked.size === 1 ? 'cliente' : 'clientes'}
          </Button>
        ) : (
          <div className="space-y-3 rounded-card border-2 border-border p-4">
            <p className="font-medium">
              Vas a enviar «{title.trim()}» a {picked.size}{' '}
              {picked.size === 1 ? 'cliente' : 'clientes'}. No se puede deshacer.
            </p>
            {noMarketing > 0 && (
              <Alert tone="info">
                {noMarketing} de ellos no aceptaron recibir promociones. Asegúrate de que puedes
                contactarles.
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={send} loading={sending}>
                Enviar ahora
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={sending}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="h-hist">
        <h2 id="h-hist" className="mb-2 text-lg font-semibold">
          Envíos anteriores
        </h2>
        {history.length === 0 ? (
          <p className="rounded-card border border-border-subtle p-4 text-center text-text-muted">
            Aún no has enviado ninguna promoción.
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((p) => (
              <li key={p.id} className="rounded-card border border-border-subtle p-3">
                <p className="font-semibold">{p.title}</p>
                <p className="whitespace-pre-line text-sm">
                  {p.body}
                  {p.code ? `\nCódigo: ${p.code}` : ''}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {fmt(p.created_at)} · Enviado a {p.sent} de {p.total}
                  {p.failed ? ` · ${p.failed} fallidos` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
