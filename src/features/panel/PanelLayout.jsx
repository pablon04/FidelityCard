import { useEffect, useState } from 'react'
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

const linkCls = ({ isActive }) =>
  `flex min-h-[44px] items-center rounded-control px-3 text-base font-medium ${
    isActive ? 'bg-bg-muted text-primary' : 'text-text hover:bg-bg-muted'
  }`

export default function PanelLayout() {
  const { merchant } = useMerchant()
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
        <p className="mb-4 text-lg font-bold text-primary">FidelityCard</p>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          <NavLink to="/app/card" className={linkCls}>
            Tarjeta
          </NavLink>
          <NavLink to="/app/share" className={linkCls}>
            Compartir
          </NavLink>
          <NavLink to="/app/clientes" className={linkCls}>
            Clientes
          </NavLink>
          <NavLink to="/app/promocionar" className={linkCls}>
            Promocionar
          </NavLink>
        </nav>
        <div className="mt-auto space-y-3">
          {themeSelect}
          <button
            type="button"
            onClick={out}
            className="min-h-[44px] w-full rounded-control border-[1.5px] border-border font-medium"
          >
            Salir
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <header className="flex items-center justify-between border-b border-border-subtle bg-surface px-4 py-3 md:hidden">
          <p className="truncate font-semibold">{merchant.name}</p>
          <button
            type="button"
            onClick={out}
            className="min-h-[44px] px-2 font-medium text-primary underline"
          >
            Salir
          </button>
        </header>
        <Outlet />
        <div className="mx-4 mb-6 mt-8 md:hidden">{themeSelect}</div>
      </div>
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-border-subtle bg-surface md:hidden"
      >
        <NavLink
          to="/app/card"
          className={({ isActive }) => `${linkCls({ isActive })} justify-center rounded-none`}
        >
          Tarjeta
        </NavLink>
        <NavLink
          to="/app/share"
          className={({ isActive }) => `${linkCls({ isActive })} justify-center rounded-none`}
        >
          Compartir
        </NavLink>
        <NavLink
          to="/app/clientes"
          className={({ isActive }) => `${linkCls({ isActive })} justify-center rounded-none`}
        >
          Clientes
        </NavLink>
        <NavLink
          to="/app/promocionar"
          className={({ isActive }) => `${linkCls({ isActive })} justify-center rounded-none`}
        >
          Promocionar
        </NavLink>
      </nav>
    </div>
  )
}
