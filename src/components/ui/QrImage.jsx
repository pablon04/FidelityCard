import { useEffect, useState } from 'react'

/** QR generado en el cliente (lib `qrcode` cargada bajo demanda, sin servicios externos). */
export default function QrImage({ value, size = 192, alt, className = '' }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let alive = true
    import('qrcode').then(({ default: QR }) =>
      QR.toDataURL(value, { errorCorrectionLevel: 'M', margin: 4, width: size * 2 }).then((url) => {
        if (alive) setSrc(url)
      }),
    )
    return () => {
      alive = false
    }
  }, [value, size])
  return (
    <div style={{ width: size, height: size }} className={`bg-white ${className}`}>
      {src && <img src={src} width={size} height={size} alt={alt} />}
    </div>
  )
}
