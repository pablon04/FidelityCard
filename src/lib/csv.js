/** Escapa una celda CSV y neutraliza inyeccion de formulas (=, +, -, @, tab, CR). */
export function csvCell(v) {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (header, rows) =>
  '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
