// node --test src/lib/csv.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { csvCell } from './csv.js'

test('neutraliza formulas y escapa', () => {
  assert.equal(csvCell('=1+1'), "'=1+1")
  assert.equal(csvCell('+34600000000'), "'+34600000000")
  assert.equal(csvCell('@x'), "'@x")
  assert.equal(csvCell('a,"b"'), '"a,""b"""')
  assert.equal(csvCell(null), '')
})
