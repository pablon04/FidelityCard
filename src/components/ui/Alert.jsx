import { cn } from '../../lib/cn.js'

const tones = {
  error: 'border-danger bg-danger-bg text-danger',
  success: 'border-success bg-success-bg text-success',
  warning: 'border-warning bg-warning-bg text-warning',
  info: 'border-border-subtle bg-bg-muted text-text',
}
const icons = { error: '⚠', success: '✓', warning: '⚠', info: 'ℹ' }

export function Alert({ tone = 'info', children, className, ...rest }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-2 rounded-control border p-3 text-sm', tones[tone], className)}
      {...rest}
    >
      <span aria-hidden="true">{icons[tone]}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
