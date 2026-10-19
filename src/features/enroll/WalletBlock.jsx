import { Suspense, lazy, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/ui/Button.jsx'
import { detectPlatform } from '../../lib/platform.js'
import { env, publicBase } from '../../lib/env.js'

const QrImage = lazy(() => import('../../components/ui/QrImage.jsx'))

/**
 * Bloque de pase segun plataforma (UX.md 2.1 estado 4).
 * Google Wallet: oculto tras flag (Fase 4). Apple: flag apagado, sin UI en el MVP.
 */
export function WalletBlock({ token, merchantName }) {
  const platform = detectPlatform()
  const [googleError, setGoogleError] = useState(false)
  const passPath = `/p/${token}`
  const showGoogle = env.googleWalletEnabled
  // env.appleWalletEnabled: sin boton hasta Fase D.

  const openGoogle = async () => {
    // Fase 4: GET wallet-google?t=<token>&redirect=1. Hoy el flag esta apagado.
    setGoogleError(true)
  }

  return (
    <div className="space-y-3">
      {platform === 'other' && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-base font-medium">Añade tu tarjeta desde el móvil</p>
          <Suspense fallback={<div className="h-[160px] w-[160px]" />}>
            <QrImage
              value={`${publicBase()}${passPath}`}
              size={160}
              alt={`Código QR que abre la tarjeta de ${merchantName}`}
              className="rounded-control border border-border-subtle"
            />
          </Suspense>
          <p className="text-sm text-text-muted">Escanea este código con tu cámara.</p>
        </div>
      )}
      {showGoogle && platform === 'android' && (
        <Button size="lg" onClick={openGoogle}>
          Añadir a Google Wallet
        </Button>
      )}
      {googleError && (
        <p role="alert" className="text-sm text-danger">
          No hemos podido abrir tu Wallet. Usa el enlace de abajo para ver tu tarjeta.
        </p>
      )}
      <Link
        to={passPath}
        className={`flex min-h-[52px] w-full items-center justify-center rounded-control px-5 text-lg font-semibold ${
          showGoogle && platform === 'android'
            ? 'border-[1.5px] border-border text-text'
            : 'bg-primary text-on-primary hover:bg-primary-hover'
        }`}
      >
        Guardar tarjeta
      </Link>
      <p className="text-center text-sm text-text-muted">
        {showGoogle && platform === 'android'
          ? 'Cuando la veas en Wallet, ya puedes cerrar esta página.'
          : 'Tu tarjeta está lista. Guarda este enlace para tenerla siempre a mano.'}
      </p>
    </div>
  )
}
