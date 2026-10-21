import { assertEquals } from 'jsr:@std/assert@1'
import { isHoneypotTripped, validateEnrollBody } from './validate.js'

const good = {
  slug: 'Cafe-Luna-x7k2',
  full_name: '  Ana   Perez Ruiz ',
  email: ' Ana@Example.COM ',
  phone: '600 11 22 33',
  consent: true,
  consent_version: '2026-10-v1',
  captcha_token: 'tok',
  source: 'nfc',
}

Deno.test('body valido se normaliza', () => {
  const r = validateEnrollBody(good)
  assertEquals(r.ok, true)
  assertEquals(r.value, {
    slug: 'cafe-luna-x7k2',
    full_name: 'Ana Perez Ruiz',
    email: 'ana@example.com',
    phone_e164: '+34600112233',
    terms_version: '2026-10-v1',
    marketing_opt_in: false,
    marketing_version: null,
    captcha_token: 'tok',
    source: 'nfc',
  })
})
Deno.test('source por defecto link; marketing exige version', () => {
  const { source: _s, ...rest } = good
  assertEquals(validateEnrollBody(rest).value.source, 'link')
  const r = validateEnrollBody({ ...good, marketing_opt_in: true })
  assertEquals(r.ok, false)
  assertEquals(Object.keys(r.fields), ['marketing_version'])
  const ok = validateEnrollBody({
    ...good,
    marketing_opt_in: true,
    marketing_version: '2026-10-v1',
  })
  assertEquals(ok.value.marketing_version, '2026-10-v1')
})
Deno.test('campos invalidos', () => {
  const r = validateEnrollBody({
    ...good,
    full_name: 'A',
    email: 'x@y',
    phone: '12',
    consent: false,
    slug: 'A_',
    source: 'tv',
    captcha_token: '',
  })
  assertEquals(r.ok, false)
  assertEquals(Object.keys(r.fields).sort(), [
    'captcha_token',
    'consent',
    'email',
    'full_name',
    'phone',
    'slug',
    'source',
  ])
})
Deno.test('consent debe ser true estricto y body no objeto', () => {
  assertEquals(validateEnrollBody({ ...good, consent: 'true' }).ok, false)
  assertEquals(validateEnrollBody(null).ok, false)
  assertEquals(validateEnrollBody([]).ok, false)
})
Deno.test('honeypot', () => {
  assertEquals(isHoneypotTripped({ website: 'http://spam' }), true)
  assertEquals(isHoneypotTripped({ website: '  ' }), false)
  assertEquals(isHoneypotTripped({}), false)
})
