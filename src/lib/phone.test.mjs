// Ejecutar con: node --test src/lib/phone.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone, stripSpanishPrefix } from './phone.js'

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
