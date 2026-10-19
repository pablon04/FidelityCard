import { useEffect, useRef } from 'react'

/** Hoja inferior / dialogo sobre <dialog> nativo: foco atrapado y Esc de serie. */
export function Sheet({ open, onClose, title, children, variant = 'sheet' }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  const cls =
    variant === 'sheet'
      ? 'fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[85vh] w-full max-w-landing overflow-y-auto rounded-b-none rounded-t-card'
      : 'm-auto w-[calc(100%-32px)] max-w-md rounded-card'
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="sheet-title"
      className={`${cls} border border-border-subtle bg-surface p-5 text-text backdrop:bg-black/50`}
    >
      {open && (
        <>
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 id="sheet-title" className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-control text-xl"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {children}
        </>
      )}
    </dialog>
  )
}
