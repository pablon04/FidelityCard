import { useEffect, useState } from 'react'
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Megaphone,
  QrCode,
  Settings,
  Users,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { Navigate } from 'react-router'
import { signOut } from '../../services/authService.js'
import { useMerchant } from '../merchant/merchantCtx.js'

const THEMES = [
  ['system', 'Sistema'],
  ['light', 'Claro'],
  ['dark', 'Oscuro'],
]

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => {
    const el = document.documentElement
    if (theme === 'system') el.removeAttribute('data-theme')
    else el.setAttribute('data-theme', theme)
    try {
      if (theme === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', theme)
    } catch {
      /* ignorar */
    }
  }, [theme])
  return [theme, setTheme]
}

const NAV = [
  { to: '/app', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/app/tarjetas', label: 'Tarjetas', icon: CreditCard },
  { to: '/app/share', label: 'Compartir', icon: QrCode },
  { to: '/app/clientes', label: 'Clientes', icon: Users },
  { to: '/app/promocionar', label: 'Promocionar', icon: Megaphone },
]

const linkCls = ({ isActive }) =>
  `flex min-h-[44px] items-center gap-3 rounded-control px-3 text-base font-medium ${
    isActive ? 'bg-bg-muted text-primary' : 'text-text hover:bg-bg-muted'
  }`

const tabCls = ({ isActive }) =>
  `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium ${
    isActive ? 'text-primary' : 'text-text-muted'
  }`

export default function PanelLayout() {
  const { merchant, plan } = useMerchant()
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()
  if (!merchant) return <Navigate to="/app/onboarding" replace />

  const out = async () => {
    await signOut()
    navigate('/app/login', { replace: true })
  }

  const themeSelect = (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-text-muted">Tema</span>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        className="min-h-[44px] w-full rounded-control border-[1.5px] border-border bg-surface px-2 text-text"
      >
        {THEMES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="min-h-screen bg-bg md:flex">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border-subtle bg-surface p-4 md:flex">
        <p className="text-lg font-bold text-primary">FidelityCard</p>
        <p className="mb-4 truncate text-sm text-text-muted">
          {merchant.name} · Plan {plan.name}
        </p>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={linkCls}>
              <Icon aria-hidden="true" size={20} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <NavLink to="/app/cuenta" className={linkCls}>
            <Settings aria-hidden="true" size={20} strokeWidth={2} />
            Cuenta
          </NavLink>
          {themeSelect}
          <button
            type="button"
            onClick={out}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-control border-[1.5px] border-border font-medium"
          >
            <LogOut aria-hidden="true" size={18} />
            Salir
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <header className="flex items-center justify-between border-b border-border-subtle bg-surface px-4 py-3 md:hidden">
          <p className="truncate font-semibold">{merchant.name}</p>
          <div className="flex items-center gap-1">
            <NavLink
              to="/app/cuenta"
              className={({ isActive }) =>
                `flex min-h-[44px] items-center gap-1.5 px-2 font-medium ${isActive ? 'text-primary' : 'text-text'}`
              }
            >
              <Settings aria-hidden="true" size={18} />
              Cuenta
            </NavLink>
            <button
              type="button"
              onClick={out}
              className="flex min-h-[44px] items-center gap-1.5 px-2 font-medium text-primary"
            >
              <LogOut aria-hidden="true" size={18} />
              Salir
            </button>
          </div>
        </header>
        <Outlet />
        <div className="mx-4 mb-6 mt-8 md:hidden">{themeSelect}</div>
      </div>
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-border-subtle bg-surface md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={tabCls}>
            <Icon aria-hidden="true" size={22} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
