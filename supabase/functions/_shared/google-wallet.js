// Google Wallet (Loyalty): construccion de clase/objeto, firma RS256 con WebCrypto,
// OAuth2 de service account y llamadas REST idempotentes. Sin dependencias.
// Nada aqui loguea claves, tokens ni PII.

const API = 'https://walletobjects.googleapis.com/walletobjects/v1'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------- base64url / PEM / firma ----------
export function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Acepta PEM con saltos reales, "\n" escapados, comillas envolventes o sin cabeceras. */
export function pemToDer(pem) {
  let p = String(pem ?? '').trim()
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'")))
    p = p.slice(1, -1)
  p = p.replace(/\\r/g, '').replace(/\\n/g, '\n')
  const body = p.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
  if (!body) throw new Error('empty_key')
  const bin = atob(body)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

export async function importPrivateKey(pem) {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/** JWT RS256 compacto. */
export async function signJwt(payload, key) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${head}.${body}`),
  )
  return `${head}.${body}.${b64url(sig)}`
}

// ---------- ids y modelos ----------
export const classId = (issuerId, merchantId) =>
  `${issuerId}.merchant_${String(merchantId).replace(/-/g, '')}`
export const objectId = (issuerId, publicId) => `${issuerId}.${publicId}`

const text = (value) => ({ defaultValue: { language: 'es', value } })
const image = (uri, alt) => ({ sourceUri: { uri }, contentDescription: text(alt) })

/**
 * @param {{issuerId:string, merchantId:string, merchantName:string, cardName:string, color:string, logoUrl:string}} p
 */
export function buildLoyaltyClass(p) {
  return {
    id: classId(p.issuerId, p.merchantId),
    issuerName: p.merchantName,
    programName: p.cardName,
    programLogo: image(p.logoUrl, `Logo de ${p.merchantName}`),
    hexBackgroundColor: p.color,
    reviewStatus: 'UNDER_REVIEW',
    countryCode: 'ES',
  }
}

/**
 * @param {{issuerId:string, merchantId:string, token:string, customerName:string, type:'visits'|'points',
 *   balance:number, threshold:number, reward:string, publicBaseUrl:string}} p
 */
export function buildLoyaltyObject(p) {
  const base = p.publicBaseUrl.replace(/\/+$/, '')
  return {
    id: objectId(p.issuerId, p.token),
    classId: classId(p.issuerId, p.merchantId),
    state: 'ACTIVE',
    accountId: p.token,
    accountName: p.customerName,
    loyaltyPoints: {
      label: p.type === 'visits' ? 'Visitas' : 'Puntos',
      balance: { string: `${p.balance}/${p.threshold}` },
    },
    textModulesData: [{ id: 'reward', header: 'Recompensa', body: p.reward }],
    barcode: { type: 'QR_CODE', value: `${base}/p/${p.token}` },
  }
}

/**
 * Campos del objeto que cambian con cada visita/canje (saldo y estado). Se usan en PATCH.
 * @param {{type:'visits'|'points', balance:number, threshold:number, reward:string, earned?:boolean}} p
 */
export function loyaltyUpdate(p) {
  const left = p.threshold - p.balance
  const unit = p.type === 'points' ? ['punto', 'puntos'] : ['visita', 'visitas']
  let status =
    left === 1
      ? `Te falta 1 ${unit[0]} para tu premio.`
      : `Te faltan ${left} ${unit[1]} para tu premio.`
  if (p.earned)
    status =
      p.type === 'points'
        ? '¡Premio conseguido en tu última visita! Se han descontado los puntos.'
        : '¡Premio conseguido en tu última visita! Se te ha reiniciado la tarjeta.'
  return {
    loyaltyPoints: {
      label: p.type === 'visits' ? 'Visitas' : 'Puntos',
      balance: { string: `${p.balance}/${p.threshold}` },
    },
    textModulesData: [
      { id: 'reward', header: 'Recompensa', body: p.reward },
      { id: 'status', header: 'Estado', body: status },
    ],
  }
}

/** Motivo de un fallo de Google + su mensaje (texto de error de la API, sin datos personales). */
async function googleFailure(res) {
  let detail
  try {
    detail = String(JSON.parse(await res.text())?.error?.message ?? '').slice(0, 300)
  } catch {
    /* cuerpo no JSON */
  }
  return detail
    ? { ok: false, reason: `google_http_${res.status}`, detail }
    : { ok: false, reason: `google_http_${res.status}` }
}

/**
 * Actualiza saldo/estado del pase ya guardado en Wallet (PATCH). Best effort: el llamador
 * no debe fallar si esto falla. 404 = el cliente aun no guardo el pase en Wallet (normal).
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function patchLoyaltyObject({ id, update, token, fetchImpl, timeoutMs = 4000 }) {
  try {
    const res = await fetchImpl(`${API}/loyaltyObject/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(update),
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok ? { ok: true } : await googleFailure(res)
  } catch (e) {
    return { ok: false, reason: `fetch_error:${String(e?.name ?? 'unknown').slice(0, 40)}` }
  }
}

/**
 * Actualiza la clase (nombre, color, logo) => cambia en TODOS los pases de ese comercio a la vez.
 * Best effort. 404 = aun nadie guardo un pase de este comercio (normal).
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function patchLoyaltyClass({ cls, token, fetchImpl, timeoutMs = 5000 }) {
  // Una clase ya APROBADA solo se puede modificar reenviandola con reviewStatus UNDER_REVIEW
  // (Google responde 400 si falta). En modo Demo se vuelve a aprobar sola.
  const { id, countryCode: _c, ...update } = cls
  try {
    const res = await fetchImpl(`${API}/loyaltyClass/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(update),
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok ? { ok: true } : await googleFailure(res)
  } catch (e) {
    return { ok: false, reason: `fetch_error:${String(e?.name ?? 'unknown').slice(0, 40)}` }
  }
}

/** JWT "save to wallet" que referencia un objeto ya creado por la API. */
export async function buildSaveUrl({
  saEmail,
  key,
  objectId: oid,
  now = Math.floor(Date.now() / 1000),
}) {
  const jwt = await signJwt(
    {
      iss: saEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: now,
      payload: { loyaltyObjects: [{ id: oid }] },
    },
    key,
  )
  return `https://pay.google.com/gp/v/save/${jwt}`
}

// ---------- OAuth2 + REST ----------
let cached = { token: '', exp: 0 }

/** @returns {Promise<{ok:true,token:string}|{ok:false,reason:string}>} */
export async function getAccessToken({
  saEmail,
  key,
  fetchImpl,
  now = () => Math.floor(Date.now() / 1000),
}) {
  const t = now()
  if (cached.token && cached.exp - 60 > t) return { ok: true, token: cached.token }
  const assertion = await signJwt(
    { iss: saEmail, scope: SCOPE, aud: TOKEN_URL, iat: t, exp: t + 3600 },
    key,
  )
  try {
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    })
    if (!res.ok) return { ok: false, reason: `oauth_http_${res.status}` }
    const data = JSON.parse(await res.text())
    if (!data?.access_token) return { ok: false, reason: 'oauth_bad_response' }
    cached = { token: data.access_token, exp: t + (Number(data.expires_in) || 3000) }
    return { ok: true, token: data.access_token }
  } catch (e) {
    return { ok: false, reason: `oauth_fetch_error:${String(e?.name ?? 'unknown').slice(0, 40)}` }
  }
}
export function resetTokenCache() {
  cached = { token: '', exp: 0 }
}

/**
 * Crea el recurso; 409 = ya existe => se actualiza con PATCH (best effort: un fallo
 * al actualizar no impide guardar el pase). `step` = 'class' | 'object' para el log.
 * @returns {Promise<{ok:boolean, reason?:string, updated?:boolean}>}
 */
export async function ensureResource({ kind, id, body, token, fetchImpl }) {
  const url = `${API}/${kind === 'class' ? 'loyaltyClass' : 'loyaltyObject'}`
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  try {
    const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) })
    if (res.ok) return { ok: true }
    if (res.status !== 409) return { ok: false, reason: `${kind}_google_http_${res.status}` }
    const upd = await fetchImpl(`${url}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    })
    return { ok: true, updated: upd.ok }
  } catch (e) {
    return { ok: false, reason: `${kind}_fetch_error:${String(e?.name ?? 'unknown').slice(0, 40)}` }
  }
}
