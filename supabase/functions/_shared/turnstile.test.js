import { assertEquals } from 'jsr:@std/assert@1'
import { validRemoteIp, verifyTurnstile } from './turnstile.js'

const mk = (impl) => (url, init) => impl(url, init)
const base = { secret: 'S', token: 'T', ip: '1.2.3.4' }

Deno.test('sin secret', async () => {
  assertEquals(await verifyTurnstile({ ...base, secret: undefined }), { result: 'unavailable', reason: 'no_secret' })
  assertEquals((await verifyTurnstile({ ...base, secret: '  \n' })).reason, 'no_secret')
})
Deno.test('ok / rejected', async () => {
  const ok = mk(async () => new Response(JSON.stringify({ success: true })))
  assertEquals(await verifyTurnstile({ ...base, fetchImpl: ok }), { result: 'ok', reason: 'ok' })
  const no = mk(async () => new Response(JSON.stringify({ success: false })))
  assertEquals(await verifyTurnstile({ ...base, fetchImpl: no }), { result: 'failed', reason: 'rejected' })
})
Deno.test('motivos de unavailable', async () => {
  assertEquals((await verifyTurnstile({ ...base, fetchImpl: mk(async () => new Response('x', { status: 503 })) })).reason, 'http_503')
  assertEquals((await verifyTurnstile({ ...base, fetchImpl: mk(async () => new Response('<html>')) })).reason, 'bad_json')
  const boom = mk(async () => { throw new TypeError('x') })
  assertEquals((await verifyTurnstile({ ...base, fetchImpl: boom })).reason, 'fetch_error:TypeError')
  const hang = mk((_u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))))
  assertEquals((await verifyTurnstile({ ...base, fetchImpl: hang, timeoutMs: 10 })).reason, 'timeout')
})
Deno.test('remoteip solo si valida; secret y token en body, no en razon', async () => {
  let body
  const spy = mk(async (_u, init) => { body = init.body; return new Response('{"success":true}') })
  await verifyTurnstile({ ...base, ip: 'garbage', fetchImpl: spy })
  assertEquals(body.includes('remoteip'), false)
  await verifyTurnstile({ ...base, ip: '2001:db8::1', fetchImpl: spy })
  assertEquals(body.includes('remoteip=2001'), true)
  assertEquals(validRemoteIp('999.1.1.1'), false)
  assertEquals(validRemoteIp(null), false)
})
