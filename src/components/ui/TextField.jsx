import { useId } from 'react'
import { cn } from '../../lib/cn.js'

export function ErrorText({ id, children }) {
  if (!children) return null
  return (
    <p id={id} className="mt-1 flex gap-1.5 text-sm font-medium text-danger">
      <span aria-hidden="true">⚠</span>
      <span>{children}</span>
    </p>
  )
}

/** Campo con label visible, ayuda y error asociados (WCAG 3.3). */
export function TextField({
  label,
  error,
  help,
  required,
  prefix,
  className,
  inputRef,
  children,
  ...input
}) {
  const id = useId()
  const errId = `${id}-err`
  const helpId = `${id}-help`
  const describedBy = [error && errId, help && helpId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('scroll-mt-24', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text">
        {label}
        {required && <span className="ml-1 font-normal text-text-muted">(obligatorio)</span>}
      </label>
      <div className="flex">
        {prefix && (
          <span className="flex min-h-[48px] items-center whitespace-nowrap rounded-l-control border-[1.5px] border-r-0 border-border bg-bg-muted px-3 text-base text-text">
            {prefix}
          </span>
        )}
        <input
          id={id}
          ref={inputRef}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className={cn(
            'min-h-[48px] w-full min-w-0 border-[1.5px] bg-surface px-3 text-base text-text placeholder:text-text-muted read-only:bg-bg-muted',
            prefix ? 'rounded-r-control' : 'rounded-control',
            error ? 'border-2 border-danger' : 'border-border',
          )}
          {...input}
        />
      </div>
      {help && !error && (
        <p id={helpId} className="mt-1 text-sm text-text-muted">
          {help}
        </p>
      )}
      <ErrorText id={errId}>{error}</ErrorText>
      {children}
    </div>
  )
}
