import { createContext, useContext } from 'react'

export const Ctx = createContext({ session: null, loading: true })
export const useAuth = () => useContext(Ctx)
