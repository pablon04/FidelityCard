import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { toCsv } from '../../lib/csv.js'
import {
  SIGNUP_FILTERS,
  VISIT_FILTERS,
  listAllCustomers,
  listCustomers,
} from '../../services/customersService.js'
import { useMerchant } from '../merchant/merchantCtx.js'

const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-ES')
const fmtVisit = (iso) => (iso ? fmtDate(iso) : 'Nunca')

export default function ClientsPage() {
  const { merchant, programs } = useMerchant()
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [asc, setAsc] = useState(false)
  const [signup, setSignup] = useState('all')
  const [visit, setVisit] = useState('all')
  const [sort, setSort] = useState('created')
  const [state, setState] = useState({ status: 'loading', rows: [], total: 0 })
  const [more, setMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)
  const seq = useRef(0)
  const opts = { search, ascending: asc, signup, visit, sort }

  useEffect(() => {
    document.title = 'Clientes · FidelityCard'
  }, [])

  // Busqueda con debounce de 300 ms
  useEffect(() => {
    const t = setTimeout(() => setSearch(input), 300)
    return () => clearTimeout(t)
  }, [input])

  const load = useCallback(() => {
    const id = ++seq.current
    setState((s) => ({ ...s, status: 'loading' }))
    listCustomers(merchant.id, { search, ascending: asc, signup, visit, sort })
      .then(({ rows, total }) => id === seq.current && setState({ status: 'ready', rows, total }))
      .catch(() => id === seq.current && setState({ status: 'error', rows: [], total: 0 }))
  }, [merchant.id, search, asc, signup, visit, sort])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const loadMore = async () => {
    setMore(true)
    try {
      const { rows } = await listCustomers(merchant.id, opts, state.rows.length)
      setState((s) => ({ ...s, rows: [...s.rows, ...rows] }))
    } catch {
      setState((s) => ({ ...s, status: 'error' }))
    } finally {
      setMore(false)
    }
  }

  const exportCsv = async () => {
    setExporting(true)
    setExportError(false)
    try {
      const all = await listAllCustomers(merchant.id, opts)
      const csv = toCsv(
        ['Nombre', 'Email', 'Teléfono', 'Fecha de alta', 'Última visita', 'Marketing', 'Saldo'],
        all.map((c) => [
          c.name,
          c.email,
          c.phone,
          fmtDate(c.createdAt),
          c.lastVisitAt ? fmtDate(c.lastVisitAt) : '',
          c.marketing ? 'Sí' : 'No',
          progress(c),
        ]),
      )
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `clientes-${merchant.slug}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  // Progreso en cada tarjeta en la que esta apuntado; con varias, con el nombre de la tarjeta.
  const progress = (c) => {
    if (!c.cards.length) return '—'
    return c.cards
      .map((k) => {
        const p = programs.find((x) => x.id === k.programId)
        if (!p) return String(k.balance)
        const txt = `${k.balance} / ${p.threshold} ${p.type === 'points' ? 'puntos' : 'visitas'}`
        return programs.length > 1 ? `${p.card_name}: ${txt}` : txt
      })
      .join(' · ')
  }

  const { status, rows, total } = state
  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          Clientes <span className="text-lg font-normal text-text-muted">({total})</span>
        </h1>
        <Button variant="secondary" onClick={exportCsv} loading={exporting} disabled={!total}>
          Exportar CSV
        </Button>
      </div>
      {exportError && (
        <Alert tone="error" className="mb-3">
          No hemos podido exportar los clientes. Inténtalo de nuevo.
        </Alert>
      )}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="q" className="mb-1.5 block text-sm font-medium">
            Buscar por nombre, email o teléfono
          </label>
          <input
            id="q"
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-h-[48px] w-full rounded-control border-[1.5px] border-border bg-surface px-3 text-base"
          />
        </div>
        <div>
          <label htmlFor="signup" className="mb-1.5 block text-sm font-medium">
            Registrados
          </label>
          <select
            id="signup"
            value={signup}
            onChange={(e) => setSignup(e.target.value)}
            className="min-h-[48px] rounded-control border-[1.5px] border-border bg-surface px-3 text-base"
          >
            {SIGNUP_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="visit" className="mb-1.5 block text-sm font-medium">
            Última visita
          </label>
          <select
            id="visit"
            value={visit}
            onChange={(e) => setVisit(e.target.value)}
            className="min-h-[48px] rounded-control border-[1.5px] border-border bg-surface px-3 text-base"
          >
            {VISIT_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sort" className="mb-1.5 block text-sm font-medium">
            Ordenar por
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="min-h-[48px] rounded-control border-[1.5px] border-border bg-surface px-3 text-base"
          >
            <option value="created">Fecha de alta</option>
            <option value="visit">Última visita</option>
          </select>
        </div>
        <Button variant="secondary" onClick={() => setAsc((a) => !a)} aria-pressed={asc}>
          {sort === 'visit'
            ? asc
              ? 'Más tiempo sin venir primero'
              : 'Visitas más recientes primero'
            : asc
              ? 'Más antiguos primero'
              : 'Más recientes primero'}
        </Button>
      </div>

      <div aria-busy={status === 'loading'}>
        {status === 'error' && (
          <div className="space-y-3">
            <Alert tone="error">No hemos podido cargar tus clientes. Inténtalo de nuevo.</Alert>
            <Button onClick={load}>Reintentar</Button>
          </div>
        )}
        {status === 'loading' && rows.length === 0 && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <span className="sr-only">Cargando…</span>
          </div>
        )}
        {status === 'ready' && rows.length === 0 && (
          <p className="rounded-card border border-border-subtle p-6 text-center text-text-muted">
            {search || signup !== 'all' || visit !== 'all'
              ? 'No hay clientes que coincidan con tu búsqueda.'
              : 'Aún no tienes clientes. Comparte tu QR o tu etiqueta NFC para empezar.'}
          </p>
        )}
        {rows.length > 0 && (
          <>
            <table className="hidden w-full text-left text-sm md:table">
              <caption className="sr-only">Clientes del comercio</caption>
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th scope="col" className="py-2 pr-3">
                    Nombre
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Email
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Teléfono
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Alta
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Última visita
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Marketing
                  </th>
                  <th scope="col" className="py-2">
                    Progreso
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/app/clientes/${c.id}`)}
                    className="cursor-pointer border-b border-border-subtle hover:bg-bg-muted"
                  >
                    <td className="py-2 pr-3 font-medium">
                      <Link
                        to={`/app/clientes/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="break-all py-2 pr-3">{c.email}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{c.phone}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{fmtDate(c.createdAt)}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{fmtVisit(c.lastVisitAt)}</td>
                    <td className="py-2 pr-3">{c.marketing ? 'Sí' : 'No'}</td>
                    <td className="whitespace-nowrap py-2">{progress(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="space-y-3 md:hidden">
              {rows.map((c) => (
                <li key={c.id} className="rounded-card border border-border-subtle p-3">
                  <Link
                    to={`/app/clientes/${c.id}`}
                    className="inline-flex min-h-[44px] items-center font-semibold text-primary"
                  >
                    {c.name}
                  </Link>
                  <p className="break-all text-sm">{c.email}</p>
                  <p className="text-sm">{c.phone}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    Alta {fmtDate(c.createdAt)} · Última visita {fmtVisit(c.lastVisitAt)} ·
                    Marketing: {c.marketing ? 'Sí' : 'No'} · {progress(c)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-text-muted" role="status">
              Mostrando {rows.length} de {total}
            </p>
            {rows.length < total && (
              <Button variant="secondary" className="mt-2" onClick={loadMore} loading={more}>
                Cargar más
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  )
}
