import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Skeleton } from '../../components/ui/Skeleton.jsx'
import { amIAdmin } from '../../services/adminService.js'
import { useAuth } from '../auth/authCtx.js'

/** /admin: sesion + usuario en platform_admins. La BD lo vuelve a exigir en cada RPC admin_*. */
export default function RequireAdmin() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  const [admin, setAdmin] = useState(null) // null = comprobando
  const uid = session?.user?.id

  useEffect(() => {
    if (!uid) return
    let alive = true
    amIAdmin()
      .then((ok) => alive && setAdmin(ok === true))
      .catch(() => alive && setAdmin(false))
    return () => {
      alive = false
    }
  }, [uid])

  if (!loading && !session)
    return <Navigate to="/app/login" replace state={{ from: loc.pathname }} />
  if (loading || admin === null)
    return (
      <main aria-busy="true" className="p-6">
        <Skeleton className="h-8 w-48" />
        <span className="sr-only">Cargando…</span>
      </main>
    )
  if (!admin)
    return (
      <main className="mx-auto max-w-md p-6">
        <Alert tone="error">No tienes acceso a esta sección.</Alert>
      </main>
    )
  return <Outlet />
}
