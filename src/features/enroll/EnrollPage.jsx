import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { brandVars } from '../../lib/contrast.js'
import { env } from '../../lib/env.js'
import { firstName, initials, logoUrl, rewardChip } from '../../lib/format.js'
import { getPublicMerchant } from '../../services/publicApi.js'
import { es } from '../../i18n/es.js'
import { EnrollForm } from './EnrollForm.jsx'

const PassCard = lazy(() =>
  import('../../components/ui/PassCard.jsx').then((m) => ({ default: m.PassCard })),
)
const WalletBlock = lazy(() =>
  import('./WalletBlock.jsx').then((m) => ({ default: m.WalletBlock })),
)
const PrivacySheet = lazy(() => import('./PrivacySheet.jsx'))

const SOURCES = ['nfc', 'qr', 'link']
const storeKey = (slug) => `fc:pass:${slug}`

function reducer(state, a) {
  switch (a.type) {
    case 'loading':
      return { view: 'loading' }
    case 'loaded':
      return { view: 'form', merchant: a.merchant }
    case 'notfound':
      return { view: 'notfound' }
    case 'loaderror':
      return { view: 'loaderror' }
    case 'done':
      return { ...state, view: 'done', done: a.done }
    case 'again':
      return { ...state, view: 'form', done: null }
    default:
      return state
  }
}

function readStored(slug) {
  try {
    return localStorage.getItem(storeKey(slug))
  } catch {
    return null
  }
}

export default function EnrollPage() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const s = params.get('s')
  const source = SOURCES.includes(s) ? s : 'link'
  const [state, dispatch] = useReducer(reducer, { view: 'loading' })
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const h1 = useRef(null)

  const load = useCallback(() => {
    dispatch({ type: 'loading' })
    let alive = true
    const timer = setTimeout(() => alive && dispatch({ type: 'loaderror' }), 3000 + 7000)
    getPublicMerchant(slug)
      .then((m) => {
        if (!alive) return
        if (!m) return dispatch({ type: 'notfound' })
        dispatch({ type: 'loaded', merchant: m })
        const stored = readStored(slug)
        if (stored)
          dispatch({ type: 'done', done: { kind: 'existing_reissued', token: stored, name: '' } })
      })
      .catch(() => alive && dispatch({ type: 'loaderror' }))
      .finally(() => clearTimeout(timer))
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [slug])

  useEffect(() => load(), [load])

  useEffect(() => {
    if (state.view === 'done' || state.view === 'notfound') h1.current?.focus()
  }, [state.view])

  useEffect(() => {
    document.title = state.merchant
      ? `${state.merchant.name} · Tarjeta de fidelidad`
      : 'Tarjeta de fidelidad'
  }, [state.merchant])

  const onDone = (done) => {
    try {
      localStorage.setItem(storeKey(slug), done.token) // token opaco; sin datos personales
    } catch {
      /* ignorar */
    }
    dispatch({ type: 'done', done })
  }

  const forget = () => {
    try {
      localStorage.removeItem(storeKey(slug))
    } catch {
      /* ignorar */
    }
    dispatch({ type: 'again' })
  }

  if (state.view === 'loading')
    return (
      <main aria-busy="true" className="mx-auto max-w-landing px-4 pb-8 sm:px-5">
        <div className="-mx-4 h-1.5 bg-bg-muted sm:-mx-5" />
        <div className="mt-6 flex flex-col items-center gap-3">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <span className="sr-only">Cargando…</span>
      </main>
    )

  if (state.view === 'notfound')
    return (
      <main className="mx-auto flex min-h-screen max-w-landing flex-col items-center justify-center px-5 text-center">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className="text-text-muted"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <h1 ref={h1} tabIndex={-1} className="mt-4 text-xl font-semibold outline-none">
          {es.landing.notFoundTitle}
        </h1>
        <p className="mt-2 text-base text-text-muted">{es.landing.notFoundText}</p>
      </main>
    )

  if (state.view === 'loaderror')
    return (
      <main className="mx-auto flex min-h-screen max-w-landing flex-col items-center justify-center gap-4 px-5 text-center">
        <Alert tone="error" className="w-full text-left">
          {es.landing.loadError}
        </Alert>
        <Button size="lg" onClick={load}>
          Reintentar
        </Button>
      </main>
    )

  const m = state.merchant
  const card = m.card
  const logo = logoUrl(card.logo_path, env.supabaseUrl)
  const vars = brandVars(card.brand_color)

  return (
    <div style={vars}>
      <div className="h-1.5 bg-brand" aria-hidden="true" />
      <main className="mx-auto max-w-landing px-4 pb-8 pt-4 sm:px-5">
        {state.view === 'done' ? (
          <section className="text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-2xl text-success"
            >
              ✓
            </div>
            <h1 ref={h1} tabIndex={-1} className="mt-3 text-2xl font-bold outline-none">
              {state.done.kind === 'existing_reissued' && !state.done.name
                ? 'Ya tienes tu tarjeta'
                : state.done.kind === 'existing_reissued'
                  ? 'Ya tienes tu tarjeta'
                  : `¡Listo, ${firstName(state.done.name)}!`}
            </h1>
            <p className="mt-2 text-base text-text-muted">
              {state.done.kind === 'existing_reissued'
                ? `Ya estabas registrado en ${m.name}. No hace falta crear otra.`
                : `Tu tarjeta de ${m.name} está creada. Guárdala para tenerla siempre a mano.`}
            </p>
            <div className="my-4 flex justify-center">
              <Suspense fallback={<div className="h-44 w-full max-w-sm" />}>
                <PassCard
                  name={card.card_name || m.name}
                  logoUrl={logo}
                  color={card.brand_color}
                  type={card.type}
                  threshold={card.threshold}
                  reward={card.reward_description}
                />
              </Suspense>
            </div>
            <Suspense fallback={null}>
              <WalletBlock token={state.done.token} merchantName={m.name} />
            </Suspense>
            <p className="mt-4 text-sm text-text-muted">
              {m.privacy_email ? (
                <>¿Esos no son tus datos? Escribe a {m.privacy_email}.</>
              ) : (
                <>¿Esos no son tus datos? Contacta con el comercio.</>
              )}
            </p>
            {state.done.kind === 'existing_reissued' && !state.done.name && (
              <Button variant="link" className="mt-2 min-h-[44px]" onClick={forget}>
                Registrar otra tarjeta
              </Button>
            )}
          </section>
        ) : (
          <>
            <header className="flex flex-col items-center text-center">
              {logo ? (
                <img
                  src={logo}
                  alt=""
                  width="56"
                  height="56"
                  className="h-14 w-14 rounded-full border border-border-subtle object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-lg font-bold text-on-brand"
                >
                  {initials(m.name)}
                </span>
              )}
              <h1 className="mt-2 text-xl font-semibold">{m.name}</h1>
              <p className="mt-1 text-base text-text">{es.landing.subtitle}</p>
              <p className="mt-2 rounded-chip border border-border-subtle bg-bg-muted px-3 py-1.5 text-sm font-medium text-text">
                {rewardChip({
                  type: card.type,
                  threshold: card.threshold,
                  reward_description: card.reward_description,
                })}
              </p>
            </header>
            <div className="mt-4">
              <EnrollForm
                merchant={m}
                slug={slug}
                source={source}
                onDone={onDone}
                onOpenPrivacy={() => setPrivacyOpen(true)}
                onReload={load}
              />
            </div>
          </>
        )}
      </main>
      {privacyOpen && (
        <Suspense fallback={null}>
          <PrivacySheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} merchant={m} />
        </Suspense>
      )}
    </div>
  )
}
