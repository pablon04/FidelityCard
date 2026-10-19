import { assertEquals } from 'jsr:@std/assert@1'
import { logoUrl, mapRpcError, mapRpcSuccess } from './enroll-map.js'
import { corsFor, parseAllowedOrigins } from './cors.js'
import { enrollLimits } from './rate-limit.js'

const env = { publicBaseUrl: 'https://app.vercel.app/', supabaseUrl: 'https://abc.supabase.co', googleWalletEnabled: false }
const tok = '11111111-1111-4111-8111-111111111111'
const row = (status) => ({
  status, card_id: 'x', card_public_id: tok, balance: 0, program_id: 'p',
  card: { merchant_name: 'Cafe Luna', brand_color: '#7a3b1e', logo_path: 'm1/logo 1.png' },
})

Deno.test('created / existing -> existing_reissued', () => {
  const c = mapRpcSuccess(row('created'), env)
  assertEquals(c.status, 200)
  assertEquals(c.body.status, 'created')
  assertEquals(c.body.pass_token, tok)
  assertEquals(c.body.wallet, { web_url: `https://app.vercel.app/p/${tok}` })
  assertEquals(c.body.card.logo_url, 'https://abc.supabase.co/storage/v1/object/public/merchant-logos/m1/logo%201.png')
  assertEquals(mapRpcSuccess(row('existing'), env).body.status, 'existing_reissued')
})
Deno.test('google endpoint solo con flag', () => {
  const r = mapRpcSuccess(row('created'), { ...env, googleWalletEnabled: true })
  assertEquals(r.body.wallet.google_url_endpoint, `https://abc.supabase.co/functions/v1/wallet-google?t=${tok}`)
})
Deno.test('already_registered no lleva datos', () => {
  const r = mapRpcSuccess({ status: 'already_registered' }, env)
  assertEquals(Object.keys(r.body).sort(), ['message', 'status'])
})
Deno.test('forma inesperada -> null', () => {
  assertEquals(mapRpcSuccess(null, env), null)
  assertEquals(mapRpcSuccess({ status: 'created' }, env), null)
  assertEquals(mapRpcSuccess({ status: 'otro', card_public_id: tok }, env), null)
})
Deno.test('errores RPC', () => {
  assertEquals(mapRpcError({ message: 'merchant_not_found' }).status, 404)
  assertEquals(mapRpcError({ message: 'invalid_terms_version' }).code, 'consent_outdated')
  assertEquals(mapRpcError({ message: 'invalid_phone' }).fields, { phone: 'Telefono no valido.' })
  assertEquals(mapRpcError({ message: 'connection refused at 10.0.0.1' }), { status: 500, code: 'internal' })
  assertEquals(mapRpcError(null).code, 'internal')
})
Deno.test('logoUrl', () => {
  assertEquals(logoUrl('https://abc.supabase.co', null), null)
})
Deno.test('CORS', () => {
  const allowed = parseAllowedOrigins('https://a.vercel.app/, http://localhost:5173')
  assertEquals(allowed, ['https://a.vercel.app', 'http://localhost:5173'])
  assertEquals(corsFor('https://a.vercel.app', allowed).headers['access-control-allow-origin'], 'https://a.vercel.app')
  assertEquals(corsFor('https://evil.com', allowed).allowed, false)
  assertEquals(corsFor(null, allowed).allowed, true)
  assertEquals(corsFor('https://a.vercel.app', []).allowed, false)
})
Deno.test('reglas de rate limit (ADR-007)', () => {
  const r = enrollLimits({ ipHash: 'i', slug: 's', emailHash: 'e', phoneHash: 'p' })
  assertEquals(r.map((x) => [x.key, x.window, x.max]), [
    ['enroll:ip:i', 3600, 10], ['enroll:merchant:s', 3600, 300], ['enroll:email:e', 86400, 3], ['enroll:phone:p', 86400, 3],
  ])
})
