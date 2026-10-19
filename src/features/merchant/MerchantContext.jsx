import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button.jsx'
import { Alert } from '../../components/ui/Alert.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { getMyMerchant, getMyProgram } from '../../services/merchantService.js'

import { Ctx } from './merchantCtx.js'

export function MerchantProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', merchant: null, program: null })

  const refresh = useCallback(async () => {
    try {
      const merchant = await getMyMerchant()
      const program = merchant ? await getMyProgram(merchant.id) : null
      setState({ status: 'ready', merchant, program })
    } catch {
      setState({ status: 'error', merchant: null, program: null })
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
            setState({ status: 'loading', merchant: null, program: null })
            refresh()
          }}
        >
          Reintentar
        </Button>
      </main>
    )
  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>
}
