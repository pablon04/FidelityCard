import { useEffect, useState } from 'react'
import { getSession, onAuthChange } from '../../services/authService.js'

import { Ctx } from './authCtx.js'

export function AuthProvider({ children }) {
  const [state, setState] = useState({ session: null, loading: true })
  useEffect(() => {
    let alive = true
    getSession().then((session) => alive && setState({ session, loading: false }))
    const off = onAuthChange((session) => alive && setState({ session, loading: false }))
    return () => {
      alive = false
      off()
    }
  }, [])
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}
