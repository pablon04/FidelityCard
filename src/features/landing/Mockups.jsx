import { PassCard } from '../../components/ui/PassCard.jsx'

/** Marco de teléfono con contenido de ejemplo. Decorativo: lleva aria-hidden o texto alternativo fuera. */
export function Phone({ children, className = '' }) {
  return (
    <div
      className={`mx-auto w-[260px] rounded-[36px] border-[6px] border-text bg-bg p-3 shadow-card ${className}`}
    >
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-chip bg-border-subtle" />
      {children}
    </div>
  )
}

export function PassMockup() {
  return (
    <Phone>
      <PassCard
        name="Café Aurora"
        color="#B45309"
        type="visits"
        threshold={8}
        balance={5}
        reward="1 café gratis"
        qrValue="https://fidelitycard.example/p/demo"
        qrAlt="Código QR de ejemplo"
      />
    </Phone>
  )
}

function Window({ title, children }) {
  return (
    <div className="overflow-hidden rounded-card border border-border-subtle bg-surface shadow-card">
      <div className="flex items-center gap-1.5 border-b border-border-subtle bg-bg-muted px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-border-subtle" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-subtle" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-subtle" />
        <span className="ml-2 text-xs text-text-muted">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export function EditorMockup() {
  const colors = ['#4338CA', '#B45309', '#047857', '#BE123C', '#0E7490', '#111827']
  return (
    <Window title="Editor de tarjeta">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium">Nombre</p>
            <div className="mt-1 rounded-control border-[1.5px] border-border px-3 py-2">
              Café Aurora
            </div>
          </div>
          <div>
            <p className="font-medium">Tipo</p>
            <div className="mt-1 flex gap-2">
              <span className="rounded-control border-2 border-primary px-3 py-1.5 font-medium">
                ✓ Visitas
              </span>
              <span className="rounded-control border-[1.5px] border-border px-3 py-1.5">
                Puntos
              </span>
            </div>
          </div>
          <div>
            <p className="font-medium">Color</p>
            <div className="mt-1 flex gap-2">
              {colors.map((c, i) => (
                <span
                  key={c}
                  style={{ background: c }}
                  className={`h-7 w-7 rounded-full ${i === 1 ? 'ring-2 ring-text ring-offset-2 ring-offset-surface' : ''}`}
                />
              ))}
            </div>
          </div>
        </div>
        <PassCard
          name="Café Aurora"
          color="#B45309"
          threshold={8}
          balance={3}
          reward="1 café gratis"
        />
      </div>
    </Window>
  )
}

export function ShareMockup() {
  // Patrón de QR decorativo (no escaneable): evita cargar la librería en la landing.
  const cells = Array.from({ length: 49 }, (_, i) => ((i * 7 + (i % 5) * 3) % 3 !== 0 ? 1 : 0))
  return (
    <Window title="Compartir">
      <div className="flex items-center gap-4">
        <div className="grid grid-cols-7 gap-0.5 rounded-control bg-white p-2" aria-hidden="true">
          {cells.map((c, i) => (
            <span key={i} className={`h-3.5 w-3.5 ${c ? 'bg-black' : 'bg-white'}`} />
          ))}
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          <p className="truncate rounded-control bg-bg-muted px-3 py-2 text-text-muted">
            /c/cafe-aurora?s=nfc
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-control border-[1.5px] border-border px-3 py-1.5">PNG</span>
            <span className="rounded-control border-[1.5px] border-border px-3 py-1.5">SVG</span>
            <span className="rounded-control bg-primary px-3 py-1.5 text-on-primary">NFC</span>
          </div>
        </div>
      </div>
    </Window>
  )
}

export function ClientsMockup() {
  const rows = [
    ['Lucía M.', '5 / 8', 'Hoy'],
    ['Carlos R.', '8 / 8', 'Ayer'],
    ['Marta G.', '2 / 8', 'Hace 3 días'],
    ['Javier P.', '6 / 8', 'Hace 1 semana'],
  ]
  return (
    <Window title="Clientes">
      <ul className="divide-y divide-border-subtle text-sm">
        {rows.map(([n, p, d]) => (
          <li key={n} className="flex items-center justify-between py-2.5">
            <span className="font-medium">{n}</span>
            <span className="text-text-muted">
              {p} · {d}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-right text-sm font-medium text-primary">Exportar CSV</p>
    </Window>
  )
}

export function DashboardMockup() {
  const bars = [30, 45, 38, 60, 52, 78, 66]
  const kpis = [
    ['Clientes', '248'],
    ['Visitas (30 d)', '612'],
    ['Recompensas', '37'],
  ]
  return (
    <Window title="Inicio">
      <div className="grid grid-cols-3 gap-2">
        {kpis.map(([l, v]) => (
          <div key={l} className="rounded-control bg-bg-muted p-2.5">
            <p className="text-xs text-text-muted">{l}</p>
            <p className="text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex h-24 items-end gap-2" aria-hidden="true">
        {bars.map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} className="flex-1 rounded-t bg-primary" />
        ))}
      </div>
    </Window>
  )
}

export function PromoMockup() {
  return (
    <Window title="Promociones">
      <div className="space-y-3 text-sm">
        <div className="rounded-control border-[1.5px] border-border p-3">
          <p className="font-medium">2x1 en cafés este viernes</p>
          <p className="mt-1 text-text-muted">Se mostrará en el pase de tus clientes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-chip bg-bg-muted px-3 py-1">Android</span>
          <span className="rounded-chip bg-bg-muted px-3 py-1">iPhone</span>
          <span className="rounded-chip border-2 border-primary px-3 py-1 font-medium">
            ✓ Solo clientes con 5+ visitas
          </span>
        </div>
      </div>
    </Window>
  )
}
