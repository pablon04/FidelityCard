import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getPublicMerchant } from '../../services/publicApi.js'
import { PrivacyContent } from './PrivacyContent.jsx'
import { brandVars } from '../../lib/contrast.js'

export default function PrivacyPage() {
  const { slug } = useParams()
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    document.title = 'Cómo tratamos tus datos'
    getPublicMerchant(slug)
      .then((m) => setState(m ? { status: 'ok', m } : { status: 'none' }))
      .catch(() => setState({ status: 'error' }))
  }, [slug])
  return (
    <main
      className="mx-auto min-h-screen max-w-landing px-4 py-6 sm:px-5"
      aria-busy={state.status === 'loading'}
    >
      {state.status === 'ok' && (
        <div
          style={brandVars(state.m.card.brand_color)}
          className="-mx-4 mb-4 h-1.5 bg-brand sm:-mx-5"
        />
      )}
      <h1 className="mb-4 text-xl font-semibold">Cómo tratamos tus datos</h1>
      {state.status === 'ok' && <PrivacyContent merchant={state.m} />}
      {state.status === 'none' && <p>No encontramos esta tarjeta.</p>}
      {state.status === 'error' && (
        <p role="alert">No hemos podido cargar la información. Inténtalo de nuevo.</p>
      )}
      <p className="mt-6">
        <Link to={`/c/${slug}`} className="text-primary underline underline-offset-2">
          Volver al alta
        </Link>
      </p>
    </main>
  )
}
