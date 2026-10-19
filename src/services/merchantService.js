/**
 * Acceso del panel a Supabase (RLS). Aisla aqui los contratos con el backend:
 * SQL 0001 (create_merchant, loyalty_programs) y ARCHITECTURE 3.6.
 * Contrato: docs/API-CONTRACT.md (activate_card, create_merchant, logo_path = '<merchant_id>/...').
 */
import { supabase } from '../lib/supabase.js'
import { randomSuffix, slugify } from '../lib/format.js'

const MERCHANT_COLS = 'id, slug, name, legal_name, tax_id, privacy_email'

export async function getMyMerchant() {
  const { data, error } = await supabase
    .from('merchants')
    .select(MERCHANT_COLS)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getMyProgram(merchantId) {
  const { data, error } = await supabase
    .from('loyalty_programs')
    .select('*')
    .eq('merchant_id', merchantId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
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
export async function createMerchant({ name, legalName = null, privacyEmail = null }) {
  for (let i = 0; i < 5; i++) {
    const slug = `${slugify(name)}-${randomSuffix(4)}`
    const { error } = await supabase.rpc('create_merchant', {
      p_name: name.trim(),
      p_slug: slug,
      p_legal_name: legalName,
      p_privacy_email: privacyEmail,
    })
    if (!error) return slug
    if (error.code !== '23505' || /merchant_already_exists/.test(error.message)) throw error
  }
  throw new Error('slug_collision')
}

export async function updateMerchantLegal(merchantId, { legal_name, tax_id, privacy_email }) {
  const { error } = await supabase
    .from('merchants')
    .update({
      legal_name: legal_name?.trim() || null,
      tax_id: tax_id?.trim() || null,
      privacy_email: privacy_email?.trim() || null,
    })
    .eq('id', merchantId)
  if (error) throw error
}

/** Inserta o actualiza el programa. `values` ya validado. */
export async function saveProgram(merchantId, existing, values) {
  const row = {
    type: values.type,
    threshold: values.threshold,
    points_per_currency: values.type === 'points' ? values.points_per_currency : null,
    reward_description: values.reward_description.trim(),
    card_name: values.card_name.trim(),
    brand_color: values.brand_color,
    logo_path: values.logo_path || null,
  }
  if (existing) {
    const { data, error } = await supabase
      .from('loyalty_programs')
      .update(row)
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase
    .from('loyalty_programs')
    .insert({ ...row, merchant_id: merchantId, status: 'draft' })
    .select('*')
    .single()
  if (error) throw error
  return data
}

/** Activa via RPC activate_card (un UPDATE directo de status falla por trigger). */
export async function activateProgram(programId) {
  const { data, error } = await supabase.rpc('activate_card', { p_card_id: programId })
  if (error) {
    const msg = error.message || ''
    const code = /type_locked/.test(msg)
      ? 'type_locked'
      : /forbidden_or_not_found/.test(msg)
        ? 'forbidden'
        : 'unknown'
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
