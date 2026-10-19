import { assertEquals } from 'jsr:@std/assert@1'
import { normalizePhone } from './phone.js'

Deno.test('ES por defecto: movil sin prefijo', () => {
  assertEquals(normalizePhone('600 11 22 33'), { ok: true, e164: '+34600112233' })
  assertEquals(normalizePhone('600112233'), { ok: true, e164: '+34600112233' })
  assertEquals(normalizePhone('912 34 56 78'), { ok: true, e164: '+34912345678' })
})
Deno.test('prefijo internacional se respeta', () => {
  assertEquals(normalizePhone('+34 600 11 22 33'), { ok: true, e164: '+34600112233' })
  assertEquals(normalizePhone('0034600112233'), { ok: true, e164: '+34600112233' })
  assertEquals(normalizePhone('+44 7911 123456'), { ok: true, e164: '+447911123456' })
})
Deno.test('invalidos', () => {
  for (const bad of ['', 'abc', '123', '+34 123', '600 11 22', 12345678, null, undefined, '6001122334455667788990']) {
    assertEquals(normalizePhone(bad).ok, false, String(bad))
  }
})
