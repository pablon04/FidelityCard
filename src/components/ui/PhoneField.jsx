import { COUNTRIES } from '../../lib/phone.js'
import { TextField } from './TextField.jsx'

/**
 * Telefono con selector de prefijo de pais delante. El <select> nativo va invisible encima de
 * "🇪🇸 +34 ▾" (compacto en movil, lista completa al abrir y accesible por teclado).
 * `country` = codigo de COUNTRIES (ES por defecto en los formularios).
 */
export function PhoneField({ country, onCountryChange, disabled, ...field }) {
  const c = COUNTRIES.find((x) => x.code === country) ?? COUNTRIES[0]
  return (
    <TextField
      type="tel"
      inputMode="tel"
      prefix={
        <span className="relative -mx-3 flex min-h-[44px] items-center px-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2">
          <span aria-hidden="true">
            {c.flag} +{c.dial} ▾
          </span>
          <select
            aria-label="Prefijo del país"
            value={c.code}
            onChange={(e) => onCountryChange(e.target.value)}
            disabled={disabled || field.readOnly}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {COUNTRIES.map((x) => (
              <option key={x.code} value={x.code}>
                {x.flag} {x.name} (+{x.dial})
              </option>
            ))}
          </select>
        </span>
      }
      disabled={disabled}
      {...field}
    />
  )
}
