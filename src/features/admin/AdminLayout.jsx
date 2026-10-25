import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, LayoutDashboard, LogOut, Store } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { getOverview } from '../../services/adminService.js'
import { signOut } from '../../services/authService.js'

const linkCls = ({ isActive }) =>
  `flex min-h-[44px] items-center gap-3 rounded-control px-3 text-base font-medium ${
    isActive ? 'bg-bg-muted text-primary' : 'text-text hover:bg-bg-muted'
  }`
const tabCls = ({ isActive }) =>
  `relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium ${
    isActive ? 'text-primary' : 'text-text-muted'
  }`

function Badge({ n }) {
  if (!n) return null
  return (
    <span className="ml-auto rounded-chip bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">
      {n}
    </span>
  )
}

/** Panel /admin (solo equipo). Pasa a las paginas los contadores y `reload` via Outlet context. */
export default function AdminLayout() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState({ pending: 0, requests: 0 })

  const reload = useCallback(() => {
    getOverview()
      .then((o) => setCounts({ pending: o.merchants.pending, requests: o.open_requests }))
      .catch(() => {})
  }, [])
  useEffect(() => {
    reload()
  }, [reload])

  const out = async () => {
    await signOut()
    navigate('/app/login', { replace: true })
  }

  const NAV = [
    { to: '/admin', label: 'Resumen', icon: LayoutDashboard, end: true },
    { to: '/admin/comercios', label: 'Comercios', icon: Store, n: counts.pending },
    { to: '/admin/solicitudes', label: 'Solicitudes', icon: ClipboardList, n: counts.requests },
  ]

  return (
    <div className="min-h-screen bg-bg md:flex">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border-subtle bg-surface p-4 md:flex">
        <p className="text-lg font-bold text-primary">FidelityCard</p>
        <p className="mb-4 text-sm text-text-muted">Administración</p>
        <nav aria-label="Administración" className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end, n }) => (
            <NavLink key={to} to={to} end={end} className={linkCls}>
              <Icon aria-hidden="true" size={20} />
              {label}
              <Badge n={n} />
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={out}
          className="mt-auto flex min-h-[44px] w-full items-center justify-center gap-2 rounded-control border-[1.5px] border-border font-medium"
        >
          <LogOut aria-hidden="true" size={18} /> Salir
        </button>
      </aside>
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <header className="flex items-center justify-between border-b border-border-subtle bg-surface px-4 py-3 md:hidden">
          <p className="font-semibold">FidelityCard · Admin</p>
          <button
            type="button"
            onClick={out}
            className="flex min-h-[44px] items-center gap-1.5 px-2 font-medium text-primary"
          >
            <LogOut aria-hidden="true" size={18} /> Salir
          </button>
        </header>
        <Outlet context={{ counts, reload }} />
      </div>
      <nav
        aria-label="Administración"
        className="fixed inset-x-0 bottom-0 grid grid-cols-3 border-t border-border-subtle bg-surface md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon, end, n }) => (
          <NavLink key={to} to={to} end={end} className={tabCls}>
            <Icon aria-hidden="true" size={22} />
            {label}
            {n > 0 && (
              <span className="absolute right-[calc(50%-22px)] top-1.5 rounded-chip bg-primary px-1.5 text-[10px] font-semibold text-on-primary">
                {n}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
