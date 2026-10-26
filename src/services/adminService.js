/**
 * Panel /admin (solo equipo). Todo via RPC admin_* (SQL 0013): SECURITY DEFINER y exigen
 * que el usuario este en platform_admins; para cualquier otro devuelven 'forbidden'.
 */
import { supabase } from '../lib/supabase.js'

async function call(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

export const amIAdmin = () => call('am_i_admin')
export const getOverview = () => call('admin_overview')
export const listMerchants = () => call('admin_list_merchants')
export const getMerchant = (id) => call('admin_get_merchant', { p_id: id })
export const setApproval = (id, status) =>
  call('admin_set_approval', { p_id: id, p_status: status })
export const setPlan = (id, plan) => call('admin_set_plan', { p_id: id, p_plan: plan })
/** Genera un codigo temporal (10 min) para que el propietario cambie su contraseña. */
export const createPasswordReset = (id) =>
  call('admin_create_password_reset', { p_merchant_id: id })
export const listRequests = () => call('admin_list_requests')
export const updateRequest = (id, status, note) =>
  call('admin_update_request', { p_id: id, p_status: status, p_note: note ?? null })

export const APPROVAL = {
  pending: 'Pendiente de autorizar',
  approved: 'Autorizado',
  rejected: 'Rechazado',
}
export const REQUEST_STATUS = {
  pending: 'Pendiente de contactar',
  contacted: 'Contactado',
  done: 'Hecho',
  cancelled: 'Cancelada',
}
