import { useState } from 'react'

const fmtDay = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

/** Visitas por dia (30 dias). Una serie: color primario, tooltip por barra y tabla accesible. */
export function VisitsChart({ daily, title = 'Visitas de los últimos 30 días' }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...daily.map((d) => d.visits))
  const total = daily.reduce((n, d) => n + d.visits, 0)
  const h = 160
  const gap = 2
  const w = 100 / daily.length
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i)
  const tip = hover != null ? daily[hover] : null

  return (
    <section
      aria-labelledby="h-chart"
      className="rounded-card border border-border-subtle bg-surface p-4"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="h-chart" className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm text-text-muted">{total} en total</p>
      </div>
      <div className="relative flex gap-2">
        <div
          aria-hidden="true"
          className="flex flex-col justify-between text-right text-xs tabular-nums text-text-muted"
          style={{ height: h }}
        >
          {[...ticks].reverse().map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg
            role="img"
            aria-label={`Gráfico de barras: ${total} visitas en los últimos 30 días. Detalle en la tabla.`}
            viewBox={`0 0 100 ${h}`}
            preserveAspectRatio="none"
            className="block w-full"
            style={{ height: h }}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <line
                key={t}
                x1="0"
                x2="100"
                y1={h - (t / max) * h}
                y2={h - (t / max) * h}
                stroke="var(--border-subtle)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {daily.map((d, i) => {
              const bh = (d.visits / max) * h
              return (
                <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}>
                  {/* zona de hover mas grande que la barra */}
                  <rect x={i * w} y="0" width={w} height={h} fill="transparent" />
                  {d.visits > 0 && (
                    <rect
                      x={i * w + gap / 4}
                      y={h - bh}
                      width={Math.max(w - gap / 2, 0.5)}
                      height={bh}
                      rx="0.6"
                      fill="var(--primary)"
                      opacity={hover == null || hover === i ? 1 : 0.45}
                    />
                  )}
                </g>
              )
            })}
          </svg>
          {tip && (
            <div
              role="status"
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-control border border-border bg-surface px-2 py-1 text-sm shadow-card"
              style={{ left: `${(hover + 0.5) * w}%` }}
            >
              <span className="font-semibold tabular-nums">{tip.visits}</span>{' '}
              <span className="text-text-muted">
                {tip.visits === 1 ? 'visita' : 'visitas'} · {fmtDay(tip.day)}
              </span>
            </div>
          )}
          <div aria-hidden="true" className="mt-1 flex justify-between text-xs text-text-muted">
            <span>{fmtDay(daily[0].day)}</span>
            <span>Hoy</span>
          </div>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="min-h-[44px] cursor-pointer py-2 font-medium">Ver como tabla</summary>
        <table className="w-full text-left">
          <caption className="sr-only">Visitas por día</caption>
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th scope="col" className="py-1 pr-3">
                Día
              </th>
              <th scope="col" className="py-1">
                Visitas
              </th>
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.day} className="border-b border-border-subtle">
                <td className="py-1 pr-3">{fmtDay(d.day)}</td>
                <td className="py-1 tabular-nums">{d.visits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
