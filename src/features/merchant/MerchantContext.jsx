import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button.jsx'
import { Alert } from '../../components/ui/Alert.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { PLANS, getMyMerchant, getMyPrograms } from '../../services/merchantService.js'

import { Ctx } from './merchantCtx.js'

export function MerchantProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', merchant: null, programs: [] })

  const refresh = useCallback(async () => {
    try {
      const merchant = await getMyMerchant()
      const programs = merchant ? await getMyPrograms(merchant.id) : []
      setState({ status: 'ready', merchant, programs })
    } catch {
      setState({ status: 'error', merchant: null, programs: [] })
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  if (state.status === 'loading')
    return (
      <main aria-busy="true" className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <span className="sr-only">Cargando…</span>
      </main>
    )
  if (state.status === 'error')
    return (
      <main className="mx-auto max-w-md space-y-4 p-6">
        <Alert tone="error">No hemos podido cargar tu panel. Inténtalo de nuevo.</Alert>
        <Button
          onClick={() => {
            setState({ status: 'loading', merchant: null, programs: [] })
            refresh()
          }}
        >
          Reintentar
        </Button>
      </main>
    )
  // cards: no archivadas (cuentan para el plan). program: la principal (primera activa).
  const cards = state.programs.filter((p) => p.status !== 'archived')
  const activeCards = cards.filter((p) => p.status === 'active')
  const plan = PLANS[state.merchant?.plan] ?? PLANS.basic
  const value = {
    ...state,
    cards,
    activeCards,
    program: activeCards[0] ?? cards[0] ?? null,
    plan,
    canAddCard: cards.length < plan.cards,
    refresh,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
