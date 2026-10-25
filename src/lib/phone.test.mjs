// Ejecutar con: node --test src/lib/phone.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { dialOf, normalizePhone, splitE164, stripDialPrefix, stripSpanishPrefix } from './phone.js'

const OK = '+34634513012'
test('normaliza con o sin prefijo, sin duplicar', () => {
  for (const v of [
    '634513012',
    '634 51 30 12',
    '+34634513012',
    '+34 634 51 30 12',
    '0034634513012',
    '34634513012',
    '634-513-012',
  ])
    assert.equal(normalizePhone(v), OK, v)
})
test('stripSpanishPrefix quita el +34 escrito dentro del campo', () => {
  assert.equal(stripSpanishPrefix('+34634513012'), '634513012')
  assert.equal(stripSpanishPrefix('0034 634 51 30 12'), '634 51 30 12'.replace(/ /g, ''))
  assert.equal(stripSpanishPrefix('634513012'), '634513012')
  assert.equal(stripSpanishPrefix('+44 7700 900123'), '+44 7700 900123')
})
test('rechaza invalidos y acepta internacionales', () => {
  for (const v of ['', '12345', '+3463451301', '512345678', '+34534513012'])
    assert.equal(normalizePhone(v), null, v)
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123')
  assert.equal(normalizePhone('0044 7700 900123'), '+447700900123')
})
test('prefijo de otro pais', () => {
  assert.equal(normalizePhone('07700 900123', '44'), '+447700900123')
  assert.equal(normalizePhone('7700 900123', '44'), '+447700900123')
  assert.equal(normalizePhone('06 12 34 56 78', '33'), '+33612345678')
  assert.equal(normalizePhone('312 345 6789', '39'), '+393123456789')
  assert.equal(normalizePhone('+34634513012', '44'), OK) // "+" escrito manda
  assert.equal(normalizePhone('12', '44'), null)
  assert.equal(stripDialPrefix('+44 7700 900123', '44'), '7700900123')
  assert.equal(dialOf('XX'), '34')
})
test('splitE164 para editar', () => {
  assert.deepEqual(splitE164(OK), { country: 'ES', number: '634513012' })
  assert.deepEqual(splitE164('+351912345678'), { country: 'PT', number: '912345678' })
  assert.deepEqual(splitE164('+12025550123'), { country: 'US', number: '2025550123' })
  assert.deepEqual(splitE164('+999123456789'), { country: 'ES', number: '+999123456789' })
})
