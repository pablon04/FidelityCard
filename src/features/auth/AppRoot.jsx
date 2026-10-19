import { Outlet } from 'react-router'
import { AuthProvider } from './AuthContext.jsx'

/** Raiz de /app: aqui (y solo aqui) se carga supabase-js, fuera del bundle de la landing. */
export default function AppRoot() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}
