/**
 * Promociones (Promocionar). Envio via Edge Function send-promotion (sesion del comercio);
 * historial por RLS (solo owner). Contrato: POST {title, text, code?, customer_ids[]}
 * -> 200 {promotion_id, total, sent, failed, skipped}.
 */
import { env } from '../lib/env.js'
import { supabase } from '../lib/supabase.js'

export class PromoError extends Error {
  constructor(code, retryAfter) {
    super(code)
    this.code = code
    this.retryAfter = retryAfter
  }
}

export async function sendPromotion({ title, text, code, customerIds }) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new PromoError('unauthorized')
  let res
  try {
    res = await fetch(`${env.supabaseUrl}/functions/v1/send-promotion`, {
      method: 'POST',
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, text, code: code || undefined, customer_ids: customerIds }),
    })
  } catch {
    throw new PromoError('network')
  }
  let body = null
  try {
    body = await res.json()
  } catch {
    /* no JSON */
  }
  if (res.ok && body?.promotion_id) return body
  const err = body?.error ?? {}
  throw new PromoError(err.code || 'internal', err.retry_after)
}

/** Ultimos envios del comercio (mas recientes primero). */
export async function listPromotions(merchantId) {
  const { data, error } = await supabase
    .from('promotions')
    .select('id, title, body, code, total, sent, failed, created_at')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data
}
