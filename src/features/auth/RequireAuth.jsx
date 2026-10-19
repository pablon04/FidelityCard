import { Navigate, Outlet, useLocation } from 'react-router'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { MerchantProvider } from '../merchant/MerchantContext.jsx'
import { useAuth } from './authCtx.js'

export default function RequireAuth() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading)
    return (
      <main aria-busy="true" className="p-6">
        <Skeleton className="h-8 w-48" />
        <span className="sr-only">Cargando…</span>
      </main>
    )
  if (!session) return <Navigate to="/app/login" replace state={{ from: loc.pathname }} />
  return (
    <MerchantProvider>
      <Outlet />
    </MerchantProvider>
  )
}
