import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Alert } from '../../components/ui/Alert.jsx'
import { Button } from '../../components/ui/Button.jsx'
import QrImage from '../../components/ui/QrImage.jsx'
import { publicBase } from '../../lib/env.js'
import { useMerchant } from '../merchant/merchantCtx.js'

function CopyButton({ text, label = 'Copiar' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <>
      <Button variant="secondary" onClick={copy}>
        {label}
      </Button>
      <span role="status" className="text-sm font-medium text-success">
        {copied ? 'Copiado' : ''}
      </span>
    </>
  )
}

function download(href, name) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
}

/** QR + enlace NFC de una accion de caja (visita o canje). */
function ActionCode({ id, title, help, url, slug, file }) {
  const urlQr = `${url}?s=qr`
  const urlNfc = `${url}?s=nfc`
  const dl = async (fmt) => {
    const { default: QR } = await import('qrcode')
    const opts = { errorCorrectionLevel: 'M', margin: 4 }
    if (fmt === 'png')
      download(await QR.toDataURL(urlQr, { ...opts, width: 1280 }), `${file}-${slug}.png`)
    else {
      const svg = await QR.toString(urlQr, { ...opts, type: 'svg' })
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
      download(url, `${file}-${slug}.svg`)
      URL.revokeObjectURL(url)
    }
  }
  return (
    <section aria-labelledby={id} className="rounded-card border border-border-subtle p-4">
      <h2 id={id} className="mb-1 text-lg font-semibold">
        {title}
      </h2>
      <p className="mb-3 text-text-muted">{help}</p>
      <div className="flex flex-wrap gap-6">
        <QrImage
          value={urlQr}
          size={160}
          alt={`Código QR: ${title}`}
          className="rounded-control border border-border-subtle"
        />
        <div className="min-w-[200px] flex-1 space-y-2">
          <p className="text-sm font-medium">Enlace para la etiqueta NFC</p>
          <p className="break-all rounded-control bg-bg-muted p-2 text-sm">{urlNfc}</p>
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={urlNfc} label="Copiar enlace NFC" />
            <Button variant="secondary" onClick={() => dl('png')}>
              Descargar QR (PNG)
            </Button>
            <Button variant="secondary" onClick={() => dl('svg')}>
              Descargar QR (SVG)
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function SharePage() {
  const { merchant, program } = useMerchant()
  const loc = useLocation()
  useEffect(() => {
    document.title = 'Compartir tu tarjeta · FidelityCard'
  }, [])

  if (program?.status !== 'active')
    return (
      <main className="mx-auto max-w-3xl p-4 md:p-6">
        <h1 className="mb-4 text-2xl font-bold">Compartir tu tarjeta</h1>
        <Alert tone="info">Activa tu tarjeta para obtener el código.</Alert>
        <Link
          to="/app/card"
          className="mt-4 inline-flex min-h-[44px] items-center rounded-control bg-primary px-4 font-semibold text-on-primary"
        >
          Ir a Tarjeta
        </Link>
      </main>
    )

  const base = `${publicBase()}/c/${merchant.slug}`
  const urlQr = `${base}?s=qr`
  const urlNfc = `${base}?s=nfc`

  const dl = async (fmt) => {
    const { default: QR } = await import('qrcode')
    const opts = { errorCorrectionLevel: 'M', margin: 4 }
    if (fmt === 'png')
      download(await QR.toDataURL(urlQr, { ...opts, width: 1280 }), `qr-${merchant.slug}.png`)
    else {
      const svg = await QR.toString(urlQr, { ...opts, type: 'svg' })
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
      download(url, `qr-${merchant.slug}.svg`)
      URL.revokeObjectURL(url)
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Compartir tu tarjeta</h1>
        <span className="rounded-chip border border-success px-3 py-1 text-sm font-medium text-success">
          ● Activa
        </span>
      </div>
      {loc.state?.justActivated && (
        <Alert tone="success">
          Tu tarjeta está activa. Ya puedes compartir el código con tus clientes.
        </Alert>
      )}

      <section aria-labelledby="h-url">
        <h2 id="h-url" className="mb-1.5 text-sm font-medium">
          Enlace de tu tarjeta
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            readOnly
            aria-labelledby="h-url"
            value={base}
            onFocus={(e) => e.target.select()}
            className="min-h-[48px] min-w-0 flex-1 rounded-control border-[1.5px] border-border bg-bg-muted px-3"
          />
          <CopyButton text={base} />
        </div>
      </section>

      <section aria-labelledby="h-qr" className="flex flex-wrap gap-6">
        <QrImage
          value={urlQr}
          size={208}
          alt={`Código QR que abre la tarjeta de ${merchant.name}`}
          className="rounded-control border border-border-subtle"
        />
        <div className="min-w-[200px] flex-1 space-y-3">
          <h2 id="h-qr" className="text-lg font-semibold">
            Código QR
          </h2>
          <p className="text-text-muted">
            Imprímelo y ponlo en caja o en tu escaparate. Tamaño mínimo recomendado: 3 x 3 cm.
          </p>
          <p className="break-all text-sm text-text-muted">Enlace del QR: {urlQr}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => dl('png')}>
              Descargar PNG
            </Button>
            <Button variant="secondary" onClick={() => dl('svg')}>
              Descargar SVG
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="h-nfc" className="rounded-card border border-border-subtle p-4">
        <h2 id="h-nfc" className="mb-2 text-lg font-semibold">
          Cómo usar una etiqueta NFC
        </h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Compra una etiqueta NFC tipo NTAG213 o superior.</li>
          <li>Instala la app gratuita &quot;NFC Tools&quot; en tu móvil.</li>
          <li>Elige Escribir, luego Añadir un registro y después URL.</li>
          <li>Pega el enlace de abajo y pulsa Escribir.</li>
          <li>Acerca el móvil a la etiqueta para comprobar que se abre tu tarjeta.</li>
          <li>Opcional: bloquea la etiqueta (solo lectura) para que nadie cambie el enlace.</li>
        </ol>
        <p className="mt-3 break-all rounded-control bg-bg-muted p-2 text-sm">{urlNfc}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CopyButton text={urlNfc} label="Copiar enlace NFC" />
        </div>
      </section>

      {(program.type === 'visits' || program.type === 'points') && (
        <>
          <h2 className="pt-2 text-xl font-bold">Código de caja</h2>
          <ActionCode
            id="h-visit"
            title={program.type === 'points' ? 'Puntos y premio' : 'Visita y premio'}
            help={
              program.type === 'points'
                ? `El cliente lo escanea o acerca el móvil cada vez que compra: suma ${program.points_per_visit ?? 1} ${(program.points_per_visit ?? 1) === 1 ? 'punto' : 'puntos'}. Cuando llega a ${program.threshold} puntos, recibe el premio automáticamente, enseña la pantalla en caja y se le descuentan esos puntos.`
                : 'El cliente lo escanea o acerca el móvil cada vez que viene: suma una visita. Cuando completa la tarjeta, recibe el premio automáticamente, enseña la pantalla en caja y su tarjeta vuelve a empezar.'
            }
            url={`${publicBase()}/v/${merchant.slug}`}
            slug={merchant.slug}
            file="visita"
          />
        </>
      )}

      <a
        href={base}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-[44px] items-center rounded-control border-[1.5px] border-border px-4 font-medium"
      >
        Probar como cliente <span className="sr-only">(se abre en una pestaña nueva)</span>
      </a>
    </main>
  )
}
