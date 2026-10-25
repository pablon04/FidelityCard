import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { PassCard } from '../../components/ui/PassCard.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { env } from '../../lib/env.js'
import { logoUrl } from '../../lib/format.js'
import { ApiError, cardAction, getPublicMerchant } from '../../services/publicApi.js'
import { GoogleWalletButton } from '../enroll/GoogleWalletButton.jsx'
import { RecoverCardForm } from './RecoverCardForm.jsx'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const storeKey = (slug) => `fc:pass:${slug}`

function readToken(slug, param) {
  if (param && UUID.test(param)) return param
  try {
    const t = localStorage.getItem(storeKey(slug))
    return t && UUID.test(t) ? t : null
  } catch {
    return null
  }
}

const ERRORS = {
  not_found: 'No encontramos tu tarjeta de este comercio. Revisa que escaneas el código correcto.',
  rate_limited: 'Demasiados intentos seguidos. Espera un momento e inténtalo de nuevo.',
  network: 'No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.',
  timeout: 'No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.',
}

function describe(r) {
  const left = Math.max(r.threshold - r.balance, 0)
  const points = r.type === 'points'
  switch (r.result) {
    case 'visit_added':
      return {
        tone: 'success',
        title: points ? `¡+${r.gained} ${r.gained === 1 ? 'punto' : 'puntos'}!` : '¡Visita sumada!',
        text: points
          ? `Llevas ${r.balance} de ${r.threshold} puntos. Te ${left === 1 ? 'falta 1 punto' : `faltan ${left} puntos`} para tu premio.`
          : `Llevas ${r.balance} de ${r.threshold}. Te ${left === 1 ? 'falta 1 visita' : `faltan ${left} visitas`} para tu premio.`,
      }
    case 'reward_earned':
      return {
        tone: 'success',
        title: '¡Premio conseguido!',
        text: points
          ? `${r.reward}. Enseña esta pantalla en caja. Te quedan ${r.balance} de ${r.threshold} puntos.`
          : `${r.reward}. Enseña esta pantalla en caja. Tu tarjeta vuelve a empezar (${r.balance} de ${r.threshold}).`,
        reward: true,
      }
    case 'cooldown':
      return {
        tone: 'info',
        title: 'Visita ya registrada',
        text: 'Ya hemos sumado tu visita hace poco. Vuelve más tarde.',
      }
    case 'not_supported':
      return {
        tone: 'info',
        title: 'No disponible',
        text: 'Esta tarjeta todavía no admite esta acción.',
      }
    default:
      return { tone: 'error', title: 'Algo ha fallado', text: ERRORS.network }
  }
}

/** /v/:slug: suma visita y, al completar la tarjeta, da el premio. Sin login: usa el token del pase. */
export default function CardActionPage() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const [token, setToken] = useState(() => readToken(slug, params.get('t')))
  const [state, setState] = useState({ status: token ? 'loading' : 'notoken' })
  const [merchant, setMerchant] = useState(null)
  const [recovered, setRecovered] = useState(false)
  const sent = useRef(false)

  const run = (t = token) => {
    setState({ status: 'loading' })
    cardAction(slug, t)
      .then((result) => setState({ status: 'done', result }))
      .catch((e) => setState({ status: 'error', code: e instanceof ApiError ? e.code : 'network' }))
  }

  useEffect(() => {
    document.title = 'Sumar visita'
    getPublicMerchant(slug)
      .then(setMerchant)
      .catch(() => {})
    if (token && !sent.current) {
      sent.current = true // un solo envio por carga (evita doble visita en StrictMode)
      run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tarjeta recuperada con email + telefono: se guarda en este movil y se suma la visita.
  const onRecovered = (t) => {
    try {
      localStorage.setItem(storeKey(slug), t)
    } catch {
      /* ignorar */
    }
    setToken(t)
    setRecovered(true)
    run(t)
  }

  const canRecover =
    state.status === 'notoken' || (state.status === 'error' && state.code === 'not_found')
  const r = state.result
  const card = merchant?.card
  const cardTitle = state.result?.card_name ?? merchant?.card?.card_name ?? merchant?.name
  const info = state.status === 'done' ? describe(state.result) : null
  return (
    <main
      className="mx-auto flex min-h-screen max-w-landing flex-col items-center gap-4 px-4 py-10 text-center"
      aria-busy={state.status === 'loading'}
    >
      {cardTitle && <p className="text-lg font-semibold">{cardTitle}</p>}
      <h1 className="text-2xl font-bold">{info?.title ?? 'Sumando tu visita…'}</h1>
      {state.status === 'loading' && <Skeleton className="h-16 w-full max-w-sm" />}
      {info && (
        <Alert tone={info.tone} className="w-full max-w-sm">
          {info.text}
        </Alert>
      )}
      {info?.reward && (
        <p className="w-full max-w-sm rounded-card border-2 border-success p-4 text-lg font-bold">
          🎁 {new Date().toLocaleString('es-ES')}
        </p>
      )}
      {state.status === 'error' && (
        <div className="w-full max-w-sm space-y-3">
          <Alert tone="error">
            {ERRORS[state.code] ?? 'No hemos podido completar la acción. Inténtalo de nuevo.'}
          </Alert>
          {state.code !== 'not_found' && <Button onClick={() => run()}>Reintentar</Button>}
        </div>
      )}
      {state.status === 'notoken' && (
        <Alert tone="info" className="w-full max-w-sm">
          No encontramos tu tarjeta en este móvil.
        </Alert>
      )}
      {canRecover && (
        <div className="w-full max-w-sm space-y-4">
          <div className="rounded-card border border-border-subtle p-4">
            <RecoverCardForm slug={slug} onRecovered={onRecovered} />
          </div>
          <p className="text-sm text-text-muted">¿Es tu primera vez?</p>
          <Link
            to={`/c/${slug}`}
            className="flex min-h-[52px] w-full items-center justify-center rounded-control border-[1.5px] border-border px-5 text-lg font-semibold"
          >
            Conseguir mi tarjeta
          </Link>
        </div>
      )}
      {recovered && state.status === 'done' && card && (
        <div className="w-full max-w-sm space-y-3">
          <PassCard
            name={card.card_name || merchant.name}
            logoUrl={logoUrl(card.logo_path, env.supabaseUrl)}
            color={card.brand_color}
            type={r.type ?? card.type}
            threshold={r.threshold ?? card.threshold}
            balance={r.balance}
            reward={card.reward_description}
            qrValue={token}
            qrAlt={`Código QR de tu tarjeta de ${card.card_name || merchant.name}`}
          />
          {env.googleWalletEnabled && <GoogleWalletButton token={token} primary />}
        </div>
      )}
      {token && state.status !== 'loading' && (
        <Link
          to={`/p/${token}`}
          className="flex min-h-[52px] w-full max-w-sm items-center justify-center rounded-control border-[1.5px] border-border px-5 text-lg font-semibold"
        >
          Ver mi tarjeta
        </Link>
      )}
    </main>
  )
}
