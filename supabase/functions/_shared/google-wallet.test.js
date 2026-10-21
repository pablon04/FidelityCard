import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  UUID_RE,
  b64url,
  buildLoyaltyClass,
  buildLoyaltyObject,
  buildSaveUrl,
  classId,
  ensureResource,
  getAccessToken,
  importPrivateKey,
  objectId,
  pemToDer,
  resetTokenCache,
  signJwt,
} from './google-wallet.js'

const M = '12345678-1234-4234-8234-123456789abc'
const T = '11111111-1111-4111-8111-111111111111'

async function genPem() {
  const kp = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
  let s = ''
  for (const b of der) s += String.fromCharCode(b)
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(s)
    .match(/.{1,64}/g)
    .join('\n')}\n-----END PRIVATE KEY-----\n`
  return { pem, pub: kp.publicKey }
}
const decode = (p) => JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')))

Deno.test('ids', () => {
  assertEquals(classId('3388', M), '3388.merchant_12345678123442348234123456789abc')
  assertEquals(objectId('3388', T), `3388.${T}`)
  assert(UUID_RE.test(T))
  assert(!UUID_RE.test('x'))
})
Deno.test('clase y objeto', () => {
  const c = buildLoyaltyClass({
    issuerId: '3388',
    merchantId: M,
    merchantName: 'Cafe Luna',
    cardName: 'Tarjeta',
    color: '#7a3b1e',
    logoUrl: 'https://x/l.png',
  })
  assertEquals(c.hexBackgroundColor, '#7a3b1e')
  assertEquals(c.issuerName, 'Cafe Luna')
  assertEquals(c.programLogo.sourceUri.uri, 'https://x/l.png')
  const o = buildLoyaltyObject({
    issuerId: '3388',
    merchantId: M,
    token: T,
    customerName: 'Ana',
    type: 'visits',
    balance: 3,
    threshold: 8,
    reward: 'Cafe gratis',
    publicBaseUrl: 'https://app.vercel.app/',
  })
  assertEquals(o.classId, c.id)
  assertEquals(o.accountName, 'Ana')
  assertEquals(o.loyaltyPoints, { label: 'Visitas', balance: { string: '3/8' } })
  assertEquals(o.barcode, { type: 'QR_CODE', value: `https://app.vercel.app/p/${T}` })
  assertEquals(
    buildLoyaltyObject({
      issuerId: '1',
      merchantId: M,
      token: T,
      customerName: 'A',
      type: 'points',
      balance: 1,
      threshold: 2,
      reward: 'r',
      publicBaseUrl: 'h',
    }).loyaltyPoints.label,
    'Puntos',
  )
})
Deno.test('PEM tolera \\n escapados y comillas', async () => {
  const { pem } = await genPem()
  const a = new Uint8Array(pemToDer(pem))
  assertEquals(new Uint8Array(pemToDer(pem.trim().replace(/\n/g, '\\n'))), a)
  assertEquals(new Uint8Array(pemToDer('"' + pem.trim().replace(/\n/g, '\\n') + '"')), a)
})
Deno.test('firma RS256 verificable y save url', async () => {
  const { pem, pub } = await genPem()
  const key = await importPrivateKey(pem)
  const jwt = await signJwt({ a: 1 }, key)
  const [h, p, s] = jwt.split('.')
  assertEquals(decode(h), { alg: 'RS256', typ: 'JWT' })
  const sig = Uint8Array.from(
    atob(s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)),
    (c) => c.charCodeAt(0),
  )
  assert(
    await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      pub,
      sig,
      new TextEncoder().encode(`${h}.${p}`),
    ),
  )
  const url = await buildSaveUrl({ saEmail: 'sa@x.iam', key, objectId: '3388.' + T, now: 1000 })
  assert(url.startsWith('https://pay.google.com/gp/v/save/'))
  const payload = decode(url.split('/').pop().split('.')[1])
  assertEquals(payload, {
    iss: 'sa@x.iam',
    aud: 'google',
    typ: 'savetowallet',
    iat: 1000,
    payload: { loyaltyObjects: [{ id: '3388.' + T }] },
  })
  assertEquals(b64url('ab?>'), 'YWI_Pg')
})
Deno.test('access token y errores', async () => {
  const { pem } = await genPem()
  const key = await importPrivateKey(pem)
  resetTokenCache()
  let n = 0
  const ok = async () => {
    n++
    return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }))
  }
  assertEquals(await getAccessToken({ saEmail: 'e', key, fetchImpl: ok }), {
    ok: true,
    token: 'AT',
  })
  await getAccessToken({ saEmail: 'e', key, fetchImpl: ok })
  assertEquals(n, 1) // cache
  resetTokenCache()
  assertEquals(
    (
      await getAccessToken({
        saEmail: 'e',
        key,
        fetchImpl: async () => new Response('', { status: 400 }),
      })
    ).reason,
    'oauth_http_400',
  )
  resetTokenCache()
  assertEquals(
    (
      await getAccessToken({
        saEmail: 'e',
        key,
        fetchImpl: async () => {
          throw new TypeError('x')
        },
      })
    ).reason,
    'oauth_fetch_error:TypeError',
  )
})
Deno.test('ensureResource: 200, 409->PATCH, error', async () => {
  const calls = []
  const f = (statuses) => async (url, init) => {
    calls.push(init.method)
    return new Response('{}', { status: statuses.shift() })
  }
  const base = {
    kind: 'class',
    id: 'i',
    body: { id: 'i', reviewStatus: 'UNDER_REVIEW' },
    token: 't',
  }
  assertEquals(await ensureResource({ ...base, fetchImpl: f([200]) }), { ok: true })
  assertEquals(await ensureResource({ ...base, fetchImpl: f([409, 200]) }), {
    ok: true,
    updated: true,
  })
  assertEquals(calls.slice(-2), ['POST', 'PATCH'])
  assertEquals(await ensureResource({ ...base, fetchImpl: f([409, 500]) }), {
    ok: true,
    updated: false,
  })
  assertEquals(await ensureResource({ ...base, kind: 'object', fetchImpl: f([403]) }), {
    ok: false,
    reason: 'object_google_http_403',
  })
})
