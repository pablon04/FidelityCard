// Mapeo PURO de resultados de la RPC enroll_customer al contrato HTTP.

/**
 * Error de la RPC (mensaje = codigo de excepcion en enroll_customer) -> HTTP.
 * @param {{ message?: string, code?: string } | null | undefined} err
 * @returns {{ status: number, code: string, fields?: Record<string,string> }}
 */
export function mapRpcError(err) {
  const msg = (err && err.message) || ''
  switch (msg) {
    case 'merchant_not_found':
      return { status: 404, code: 'card_not_found' }
    case 'invalid_terms_version':
    case 'invalid_marketing_version':
    case 'terms_required':
      return { status: 409, code: 'consent_outdated' }
    case 'invalid_name':
      return { status: 400, code: 'validation_error', fields: { full_name: 'Nombre no valido.' } }
    case 'invalid_email':
      return { status: 400, code: 'validation_error', fields: { email: 'Email no valido.' } }
    case 'invalid_phone':
      return { status: 400, code: 'validation_error', fields: { phone: 'Telefono no valido.' } }
    default:
      return { status: 500, code: 'internal' } // nunca se filtra el detalle
  }
}

/** URL publica de un logo del bucket publico merchant-logos. */
export function logoUrl(supabaseUrl, logoPath) {
  if (!logoPath || !supabaseUrl) return null
  const base = supabaseUrl.replace(/\/+$/, '')
  const path = logoPath.split('/').map(encodeURIComponent).join('/')
  return `${base}/storage/v1/object/public/merchant-logos/${path}`
}

export const ALREADY_REGISTERED_MESSAGE =
  'Ya existe un registro con estos datos en este comercio. Si es tuyo, usa el enlace de tu tarjeta; si lo has perdido, pidelo en el comercio.'

/**
 * @param {any} data  jsonb devuelto por enroll_customer
 * @param {{ publicBaseUrl: string, supabaseUrl: string, googleWalletEnabled: boolean }} env
 * @returns {{ status: number, body: object } | null}  null si la forma es inesperada
 */
export function mapRpcSuccess(data, env) {
  if (!data || typeof data !== 'object') return null
  if (data.status === 'already_registered') {
    return { status: 200, body: { status: 'already_registered', message: ALREADY_REGISTERED_MESSAGE } }
  }
  if ((data.status !== 'created' && data.status !== 'existing') || !data.card_public_id) return null
  const token = String(data.card_public_id)
  const card = data.card ?? {}
  const base = env.publicBaseUrl.replace(/\/+$/, '')
  const wallet = { web_url: `${base}/p/${token}` }
  if (env.googleWalletEnabled) {
    wallet.google_url_endpoint = `${env.supabaseUrl.replace(/\/+$/, '')}/functions/v1/wallet-google?t=${token}`
  }
  return {
    status: 200,
    body: {
      status: data.status === 'created' ? 'created' : 'existing_reissued',
      pass_token: token,
      card: {
        merchant_name: card.merchant_name ?? null,
        color: card.brand_color ?? null,
        logo_url: logoUrl(env.supabaseUrl, card.logo_path),
      },
      wallet,
    },
  }
}
