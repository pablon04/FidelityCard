import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { PassCard } from '../../components/ui/PassCard.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { env } from '../../lib/env.js'
import { logoUrl } from '../../lib/format.js'
import { getPublicPass } from '../../services/publicApi.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function PassPage() {
  const { token } = useParams()
  const [state, setState] = useState({ status: UUID.test(token) ? 'loading' : 'none' })

  const load = useCallback(() => {
    if (!UUID.test(token)) return setState({ status: 'none' })
    setState({ status: 'loading' })
    getPublicPass(token)
      .then((p) => setState(p ? { status: 'ok', pass: p } : { status: 'none' }))
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
      <h1 className="mb-4 text-xl font-semibold">Tu tarjeta de {pass.merchant_name}</h1>
      <PassCard
        name={c.card_name || pass.merchant_name}
        logoUrl={logoUrl(c.logo_path, env.supabaseUrl)}
        color={c.brand_color}
        type={c.type}
        threshold={c.threshold}
        balance={pass.balance}
        reward={c.reward_description}
        qrValue={pass.token}
        qrAlt={`Código QR de tu tarjeta de ${pass.merchant_name}`}
      />
      {blocked && (
        <Alert tone="warning" className="mt-4 w-full max-w-sm">
          Esta tarjeta está bloqueada. Consulta con el comercio.
        </Alert>
      )}
      <p className="mt-4 max-w-sm text-center text-sm text-text-muted">
        Enseña este código en caja. Guarda este enlace o añade la página a tu pantalla de inicio
        para tenerla siempre a mano.
      </p>
    </>
  )
}
