/**
 * Acceso del panel a Supabase (RLS). Aisla aqui los contratos con el backend:
 * SQL 0001 (create_merchant, loyalty_programs) y ARCHITECTURE 3.6.
 * Contrato: docs/API-CONTRACT.md (activate_card, create_merchant, logo_path = '<merchant_id>/...').
 */
import { env } from '../lib/env.js'
import { supabase } from '../lib/supabase.js'
import { randomSuffix, slugify } from '../lib/format.js'

const MERCHANT_COLS =
  'id, slug, name, legal_name, tax_id, privacy_email, address, latitude, longitude, plan, approval_status, contact_phone'

export async function getMyMerchant() {
  const { data, error } = await supabase
    .from('merchants')
    .select(MERCHANT_COLS)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Planes (SQL 0012: plan_card_limit). Lo cambia el equipo cuando el comercio paga. */
export const PLANS = {
  basic: { name: 'Básico', cards: 1 },
  pro: { name: 'Pro', cards: 3 },
  premium: { name: 'Premium', cards: 10 },
}

/** Todas las tarjetas del comercio (incluidas archivadas), de la mas antigua a la mas nueva. */
export async function getMyPrograms(merchantId) {
  const { data, error } = await supabase
    .from('loyalty_programs')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

/** Solicitud de cambio de plan abierta (pending/contacted) o null. */
export async function getOpenPlanRequest(merchantId) {
  const { data, error } = await supabase
    .from('plan_requests')
    .select('id, requested_plan, status, created_at')
    .eq('merchant_id', merchantId)
    .in('status', ['pending', 'contacted'])
    .maybeSingle()
  if (error) throw error
  return data
}

/** "Contratar este plan": deja la solicitud para que el equipo contacte (RPC request_plan_change). */
export async function requestPlanChange(plan) {
  const { data, error } = await supabase.rpc('request_plan_change', { p_plan: plan })
  if (error) throw error
  return data
}

/** Metricas del Inicio (RPC merchant_dashboard, solo owner). */
export async function getDashboard(merchantId) {
  const { data, error } = await supabase.rpc('merchant_dashboard', { p_merchant_id: merchantId })
  if (error) throw error
  return data
}

/** Archiva una tarjeta: deja de admitir altas y visitas y libera hueco del plan. */
export async function archiveProgram(programId) {
  const { error } = await supabase
    .from('loyalty_programs')
    .update({ status: 'archived' })
    .eq('id', programId)
  if (error) throw error
}

/** Recupera una tarjeta archivada como borrador (cuenta para el limite del plan). */
export async function restoreProgram(programId) {
  const { error } = await supabase
    .from('loyalty_programs')
    .update({ status: 'draft' })
    .eq('id', programId)
  if (error) throw Object.assign(error, { code: programError(error) })
}

/** Codigo de error de negocio a partir del mensaje de Postgres. */
function programError(error) {
  const msg = error?.message || ''
  if (/plan_limit/.test(msg)) return 'plan_limit'
  if (/programs_merchant_code_uidx/.test(msg)) return 'code_taken'
  if (/code_locked/.test(msg)) return 'code_locked'
  if (/forbidden_or_not_found/.test(msg)) return 'forbidden'
  return 'unknown'
}

export async function countProgramCards(programId) {
  const { count, error } = await supabase
    .from('customer_cards')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId)
  if (error) throw error
  return count ?? 0
}

/** Crea comercio con slug `nombre-xxxx` (reintenta si colisiona). */
export async function createMerchant({
  name,
  contactPhone = null,
  legalName = null,
  privacyEmail = null,
}) {
  for (let i = 0; i < 5; i++) {
    const slug = `${slugify(name)}-${randomSuffix(4)}`
    const { error } = await supabase.rpc('create_merchant', {
      p_name: name.trim(),
      p_slug: slug,
      p_legal_name: legalName,
      p_privacy_email: privacyEmail,
    })
    if (!error) {
      // El owner puede actualizar su contact_phone (grant de 0013); el comercio ya existe.
      if (contactPhone) {
        const { error: e2 } = await supabase
          .from('merchants')
          .update({ contact_phone: contactPhone })
          .eq('slug', slug)
        if (e2) throw e2
      }
      return slug
    }
    if (error.code !== '23505' || /merchant_already_exists/.test(error.message)) throw error
  }
  throw new Error('slug_collision')
}

/**
 * Datos de Cuenta: nombre comercial, legales (responsable RGPD) y ubicacion. Valen para todas
 * las tarjetas. Coordenadas: ambas o ninguna (SQL 0009).
 */
export async function updateMerchantAccount(merchantId, v) {
  const hasCoords = Number.isFinite(v.latitude) && Number.isFinite(v.longitude)
  const { error } = await supabase
    .from('merchants')
    .update({
      name: v.name.trim(),
      legal_name: v.legal_name?.trim() || null,
      tax_id: v.tax_id?.trim() || null,
      contact_phone: v.contact_phone || null,
      privacy_email: v.privacy_email?.trim() || null,
      address: v.address?.trim() || null,
      latitude: hasCoords ? v.latitude : null,
      longitude: hasCoords ? v.longitude : null,
    })
    .eq('id', merchantId)
  if (error) throw error
}

/**
 * Busca coordenadas de una direccion con Nominatim (OpenStreetMap, gratis, max 1 peticion/s).
 * @returns {Promise<{latitude:number, longitude:number, label:string}|null>}
 */
export async function geocodeAddress(address) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({
    q: address.trim(),
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'es',
    'accept-language': 'es',
  })
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('geocode_failed')
  const [hit] = await res.json()
  if (!hit) return null
  return { latitude: Number(hit.lat), longitude: Number(hit.lon), label: hit.display_name }
}

/** Inserta o actualiza el programa. `values` ya validado. */
export async function saveProgram(merchantId, existing, values) {
  const row = {
    type: values.type,
    threshold: values.threshold,
    points_per_visit: values.type === 'points' ? values.points_per_visit : null,
    points_per_currency: null,
    reward_description: values.reward_description.trim(),
    card_name: values.card_name.trim(),
    brand_color: values.brand_color,
    logo_path: values.logo_path || null,
    visit_cooldown_minutes: values.visit_cooldown_minutes,
  }
  // El codigo del enlace solo se fija/cambia en borrador (despues va impreso en QR/NFC).
  if (!existing || existing.status === 'draft') row.code = values.code || null
  if (existing) {
    const { data, error } = await supabase
      .from('loyalty_programs')
      .update(row)
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw Object.assign(new Error(programError(error)), { code: programError(error) })
    return data
  }
  const { data, error } = await supabase
    .from('loyalty_programs')
    .insert({ ...row, merchant_id: merchantId, status: 'draft' })
    .select('*')
    .single()
  if (error) throw Object.assign(new Error(programError(error)), { code: programError(error) })
  return data
}

/** Activa via RPC activate_card (un UPDATE directo de status falla por trigger). */
export async function activateProgram(programId) {
  const { data, error } = await supabase.rpc('activate_card', { p_card_id: programId })
  if (error) {
    const code = programError(error)
    throw Object.assign(new Error(code), { code })
  }
  return data
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
export const LOGO_TYPES = Object.keys(EXT)

/** Sube el logo a merchant-logos/<merchant_id>/ y devuelve logo_path. */
export async function uploadLogo(merchantId, file) {
  const path = `${merchantId}/logo-${Date.now()}.${EXT[file.type]}`
  const { error } = await supabase.storage
    .from('merchant-logos')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

/**
 * Empuja nombre, color y logo de la tarjeta activa a los pases ya guardados en Google Wallet
 * (Edge Function wallet-sync-class). Best effort: nunca lanza ni bloquea el guardado.
 */
export async function syncWalletCard() {
  try {
    if (!env.googleWalletEnabled) return
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) return
    await fetch(`${env.supabaseUrl}/functions/v1/wallet-sync-class`, {
      method: 'POST',
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
  } catch {
    /* ignorar: Wallet se actualizara en el siguiente guardado */
  }
}
