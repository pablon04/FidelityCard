import { cn } from '../../lib/cn.js'

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold text-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
const variants = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border-[1.5px] border-border bg-surface text-text hover:bg-bg-muted',
  link: 'text-primary underline underline-offset-2 text-base font-medium min-h-0',
  brand: 'bg-brand-ui text-on-brand',
}
const sizes = {
  lg: 'min-h-[52px] px-5 w-full',
  md: 'min-h-[44px] px-4',
  sm: 'min-h-[44px] px-3 text-base',
}

export function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], variant !== 'link' && sizes[size], className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
