import { useState } from 'react'
import { TextField } from './TextField.jsx'

/** Ojo con trazo diagonal animado: tachado = contraseña oculta, sin tachar = visible. */
function EyeIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 transition-transform duration-200 group-active:scale-90"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path
        d="M3 3l18 18"
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset={open ? 1 : 0}
        className="transition-[stroke-dashoffset] duration-300 ease-out"
      />
    </svg>
  )
}

/** TextField de contraseña con botón de ojo para mostrar/ocultar. */
export function PasswordField(props) {
  const [show, setShow] = useState(false)
  return (
    <TextField
      {...props}
      type={show ? 'text' : 'password'}
      suffix={
        <button
          type="button"
          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={show}
          onClick={() => setShow((s) => !s)}
          className="group flex h-12 w-12 items-center justify-center rounded-control text-text-muted hover:text-text"
        >
          <EyeIcon open={show} />
        </button>
      }
    />
  )
}
