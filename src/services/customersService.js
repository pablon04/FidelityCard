/**
 * Lectura de clientes del comercio (RLS: solo el owner ve customers, customer_cards y consents).
 * Columnas usadas: customers(id, full_name, email, phone_e164, created_at),
 * customer_cards(balance, status), consents(purpose, revoked_at).
 */
import { supabase } from '../lib/supabase.js'

const COLS =
  'id, full_name, email, phone_e164, created_at, last_visit_at, customer_cards(balance, status), consents(purpose, revoked_at)'
export const PAGE_SIZE = 25

/** Quita caracteres con significado en filtros PostgREST / LIKE. */
const clean = (q) => q.replace(/[,()%*_\\"']/g, ' ').trim()

/** Filtros de fecha de registro: dias hacia atras desde hoy. */
export const SIGNUP_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'last7', label: 'Últimos 7 días' },
  { value: 'last30', label: 'Últimos 30 días' },
  { value: 'last90', label: 'Últimos 90 días' },
  { value: 'older90', label: 'Hace más de 90 días' },
]

/** Filtros de ultima visita (last_visit_at). */
export const VISIT_FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'last7', label: 'Últimos 7 días' },
  { value: 'last30', label: 'Últimos 30 días' },
  { value: 'away30', label: 'Sin venir hace más de 30 días' },
  { value: 'away60', label: 'Sin venir hace más de 60 días' },
  { value: 'away90', label: 'Sin venir hace más de 90 días' },
  { value: 'never', label: 'Nunca han venido' },
]

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

function build(
  merchantId,
  { search = '', ascending = false, signup = 'all', visit = 'all', sort = 'created' } = {},
) {
  let q = supabase.from('customers').select(COLS, { count: 'exact' }).eq('merchant_id', merchantId)
  if (sort === 'visit') q = q.order('last_visit_at', { ascending, nullsFirst: false })
  else q = q.order('created_at', { ascending })
  if (signup === 'last7') q = q.gte('created_at', daysAgo(7))
  else if (signup === 'last30') q = q.gte('created_at', daysAgo(30))
  else if (signup === 'last90') q = q.gte('created_at', daysAgo(90))
  else if (signup === 'older90') q = q.lt('created_at', daysAgo(90))
  // Ultima visita: 'away*' = su ultima visita es anterior al corte o aun no ha venido.
  if (visit === 'last7') q = q.gte('last_visit_at', daysAgo(7))
  else if (visit === 'last30') q = q.gte('last_visit_at', daysAgo(30))
  else if (visit === 'never') q = q.is('last_visit_at', null)
  else if (visit.startsWith('away')) {
    const cut = daysAgo(Number(visit.slice(4)))
    q = q.not('last_visit_at', 'is', null).lt('last_visit_at', cut)
  }
  const t = clean(search)
  if (t) q = q.or(`full_name.ilike.%${t}%,email.ilike.%${t}%,phone_e164.ilike.%${t}%`)
  return q
}

const shape = (r) => ({
  id: r.id,
  name: r.full_name,
  email: r.email,
  phone: r.phone_e164,
  createdAt: r.created_at,
  lastVisitAt: r.last_visit_at,
  marketing: (r.consents ?? []).some((c) => c.purpose === 'marketing' && !c.revoked_at),
  balance: r.customer_cards?.[0]?.balance ?? null,
})

/** @returns {Promise<{rows:object[], total:number}>} */
export async function listCustomers(merchantId, opts, from = 0) {
  const { data, count, error } = await build(merchantId, opts).range(from, from + PAGE_SIZE - 1)
  if (error) throw error
  return { rows: data.map(shape), total: count ?? 0 }
}

/** Todos los clientes que cumplen el filtro, en lotes de 1000 (para CSV). */
export async function listAllCustomers(merchantId, opts) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(merchantId, opts).range(from, from + 999)
    if (error) throw error
    out.push(...data.map(shape))
    if (data.length < 1000) return out
  }
}

/**
 * Ficha de un cliente: datos, tarjeta y movimientos (libro, mas recientes primero).
 * RLS limita todo a los comercios del owner. Devuelve null si no existe / no es suyo.
 */
export async function getCustomerDetail(merchantId, customerId) {
  const { data: c, error } = await supabase
    .from('customers')
    .select(
      'id, full_name, email, phone_e164, created_at, last_visit_at, customer_cards(id, balance, status, created_at), consents(purpose, revoked_at)',
    )
    .eq('merchant_id', merchantId)
    .eq('id', customerId)
    .maybeSingle()
  if (error) throw error
  if (!c) return null
  const card = c.customer_cards?.[0] ?? null
  let movements = []
  if (card) {
    const { data, error: e2 } = await supabase
      .from('loyalty_ledger')
      .select('id, kind, delta, balance_after, created_at')
      .eq('merchant_id', merchantId)
      .eq('card_id', card.id)
      .order('created_at', { ascending: false })
      .limit(500)
    if (e2) throw e2
    movements = data
  }
  return {
    ...shape(c),
    cardStatus: card?.status ?? null,
    movements: movements.map((m) => ({
      id: m.id,
      kind: m.kind,
      delta: m.delta,
      balanceAfter: m.balance_after,
      at: m.created_at,
    })),
  }
}
