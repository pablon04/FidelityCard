/**
 * Lectura de clientes del comercio (RLS: solo el owner ve customers, customer_cards y consents).
 * Columnas usadas: customers(id, full_name, email, phone_e164, created_at),
 * customer_cards(balance, status), consents(purpose, revoked_at).
 */
import { supabase } from '../lib/supabase.js'

const COLS =
  'id, full_name, email, phone_e164, created_at, customer_cards(balance, status), consents(purpose, revoked_at)'
export const PAGE_SIZE = 25

/** Quita caracteres con significado en filtros PostgREST / LIKE. */
const clean = (q) => q.replace(/[,()%*_\\"']/g, ' ').trim()

function build(merchantId, { search = '', ascending = false } = {}) {
  let q = supabase
    .from('customers')
    .select(COLS, { count: 'exact' })
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending })
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
