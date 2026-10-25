import { PLANS } from '../../services/merchantService.js'

const ORDER = ['basic', 'pro', 'premium']

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES') : '—')
export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
export const planName = (p) => PLANS[p]?.name ?? p
/** 'subida' | 'bajada' entre dos planes. */
export const planDirection = (from, to) =>
  ORDER.indexOf(to) > ORDER.indexOf(from) ? 'subida' : 'bajada'
