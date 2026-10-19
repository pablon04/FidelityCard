import { useId } from 'react'
import { ErrorText } from './TextField.jsx'

export function Checkbox({ label, error, inputRef, className = '', ...input }) {
  const id = useId()
  const errId = `${id}-err`
  return (
    <div className={`scroll-mt-24 ${className}`}>
      <div className="flex min-h-[48px] items-start gap-3">
        <input
          id={id}
          ref={inputRef}
          type="checkbox"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errId : undefined}
          className={`mt-0.5 h-6 w-6 shrink-0 accent-[var(--primary)] ${error ? 'outline outline-2 outline-danger' : ''}`}
          {...input}
        />
        <label htmlFor={id} className="py-0.5 text-sm text-text">
          {label}
        </label>
      </div>
      <ErrorText id={errId}>{error}</ErrorText>
    </div>
  )
}
