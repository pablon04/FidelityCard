import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { PassCard } from '../../components/ui/PassCard.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { env } from '../../lib/env.js'
import { logoUrl, mapsUrl, passKey } from '../../lib/format.js'
import { GoogleWalletButton } from '../enroll/GoogleWalletButton.jsx'
import { detectPlatform } from '../../lib/platform.js'
import { getPublicPass } from '../../services/publicApi.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function PassPage() {
  const { token } = useParams()
  const [state, setState] = useState({ status: UUID.test(token) ? 'loading' : 'none' })

  const load = useCallback(() => {
    if (!UUID.test(token)) return setState({ status: 'none' })
    setState({ status: 'loading' })
    getPublicPass(token)
      .then((p) => {
        if (p?.slug) {
          try {
            localStorage.setItem(passKey(p.slug, p.card?.code), token) // para /v sin volver a registrarse
          } catch {
            /* ignorar */
          }
        }
        setState(p ? { status: 'ok', pass: p } : { status: 'none' })
      })
      .catch(() => setState({ status: 'error' }))
  }, [token])

  useEffect(() => {
    document.title = 'Tu tarjeta de fidelidad'
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  return (
    <main
      className="mx-auto flex min-h-screen max-w-landing flex-col items-center px-4 py-6 sm:px-5"
      aria-busy={state.status === 'loading'}
    >
      {state.status === 'loading' && <Skeleton className="h-80 w-full max-w-sm" />}
      {state.status === 'none' && (
        <div className="mt-16 text-center">
          <h1 className="text-xl font-semibold">No encontramos esta tarjeta</h1>
          <p className="mt-2 text-text-muted">
            El enlace puede estar mal escrito o la tarjeta ya no existe. Pregunta en el mostrador.
          </p>
        </div>
      )}
      {state.status === 'error' && (
        <div className="mt-16 w-full space-y-4">
          <Alert tone="error">
            No hemos podido cargar tu tarjeta. Revisa tu conexión e inténtalo de nuevo.
          </Alert>
          <Button size="lg" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}
      {state.status === 'ok' && <PassView pass={state.pass} />}
    </main>
  )
}

function PassView({ pass }) {
  const c = pass.card
  const blocked = pass.status === 'blocked'
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">
        Tu tarjeta de {c.card_name || pass.merchant_name}
      </h1>
      <PassCard
        name={c.card_name || pass.merchant_name}
        logoUrl={logoUrl(c.logo_path, env.supabaseUrl)}
        color={c.brand_color}
        type={c.type}
        threshold={c.threshold}
        balance={pass.balance}
        reward={c.reward_description}
        qrValue={pass.token}
        qrAlt={`Código QR de tu tarjeta de ${c.card_name || pass.merchant_name}`}
      />
      {blocked && (
        <Alert tone="warning" className="mt-4 w-full max-w-sm">
          Esta tarjeta está bloqueada. Consulta con el comercio.
        </Alert>
      )}
      {env.googleWalletEnabled && !blocked && (
        <div className="mt-4 w-full max-w-sm space-y-2">
          <GoogleWalletButton token={pass.token} primary={detectPlatform() === 'android'} />
          {detectPlatform() === 'ios' && (
            <p className="text-center text-sm text-text-muted">Apple Wallet llegará pronto.</p>
          )}
        </div>
      )}
      {pass.location?.address && (
        <div className="mt-4 w-full max-w-sm rounded-card border border-border-subtle p-3 text-sm">
          <p className="font-medium">Dónde estamos</p>
          <p className="text-text-muted">{pass.location.address}</p>
          <a
            href={mapsUrl(pass.location)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex min-h-[44px] items-center font-semibold text-primary"
          >
            Cómo llegar
          </a>
        </div>
      )}
      <p className="mt-4 max-w-sm text-center text-sm text-text-muted">
        Enseña este código en caja. Guarda este enlace o añade la página a tu pantalla de inicio
        para tenerla siempre a mano.
      </p>
    </>
  )
}
