import { lazy, Suspense } from 'react'
import { brandVars } from '../../lib/contrast.js'
import { initials, rewardChip } from '../../lib/format.js'

const QrImage = lazy(() => import('./QrImage.jsx'))

/**
 * Tarjeta visual compartida: landing (exito), pase web y vista previa del panel.
 * Decorativa respecto al formulario; el texto equivalente va fuera (aria-label opcional).
 */
export function PassCard({
  name,
  logoUrl,
  color,
  type = 'visits',
  threshold = 8,
  balance = 0,
  reward,
  qrValue,
  qrAlt,
  className = '',
}) {
  const t = Math.max(1, Number(threshold) || 1)
  const b = Math.min(Math.max(0, Number(balance) || 0), t)
  const unit = type === 'points' ? 'puntos' : 'visitas'
  const showDots = type === 'visits' && t <= 12
  return (
    <div
      style={brandVars(color)}
      className={`w-full max-w-sm rounded-card bg-brand p-4 text-on-brand shadow-card ${className}`}
    >
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            width="44"
            height="44"
            className="h-11 w-11 rounded-full bg-white object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-current text-base font-bold"
          >
            {initials(name)}
          </span>
        )}
        <p className="min-w-0 truncate text-lg font-semibold">{name || 'Tu negocio'}</p>
      </div>
      <p className="mt-4 text-base font-medium">
        {rewardChip({ type, threshold: t, reward_description: reward })}
      </p>
      <div className="mt-3">
        {showDots ? (
          <ul className="flex flex-wrap gap-1.5" aria-hidden="true">
            {Array.from({ length: t }, (_, i) => (
              <li
                key={i}
                className={`h-5 w-5 rounded-full border-2 border-current ${i < b ? 'bg-current' : ''}`}
              />
            ))}
          </ul>
        ) : (
          <div
            className="h-3 overflow-hidden rounded-chip border-2 border-current"
            aria-hidden="true"
          >
            <div className="h-full bg-current" style={{ width: `${(b / t) * 100}%` }} />
          </div>
        )}
        <p className="mt-1.5 text-sm font-medium">
          {b} / {t} {unit}
        </p>
      </div>
      {qrValue && (
        <div className="mt-4 flex justify-center">
          <Suspense fallback={<div className="h-[176px] w-[176px] rounded-control bg-white" />}>
            <QrImage value={qrValue} size={176} alt={qrAlt} className="rounded-control" />
          </Suspense>
        </div>
      )}
    </div>
  )
}
