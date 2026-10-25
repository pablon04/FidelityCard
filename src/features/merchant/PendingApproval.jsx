import { useState } from 'react'
import { Clock, LogOut, XCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button.jsx'

/** Comercio registrado pero aun sin autorizar (o rechazado): no entra al panel (SQL 0013). */
export function PendingApproval({ merchant, onRefresh, onSignOut }) {
  const [busy, setBusy] = useState(false)
  const rejected = merchant.approval_status === 'rejected'
  const Icon = rejected ? XCircle : Clock
  const check = async () => {
    setBusy(true)
    try {
      await onRefresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-card border border-border-subtle bg-surface p-6 text-center">
        <Icon aria-hidden="true" size={44} className="mx-auto text-primary" />
        <h1 className="mt-4 text-2xl font-bold">
          {rejected ? 'Cuenta no autorizada' : 'Cuenta pendiente de autorizar'}
        </h1>
        <p className="mt-2 text-text-muted">
          {rejected
            ? `No hemos podido autorizar ${merchant.name} en FidelityCard. Si crees que es un error, escríbenos y lo revisamos.`
            : `Gracias por registrar ${merchant.name}. Estamos revisando tu alta y te avisaremos en cuanto puedas empezar a usar la plataforma.`}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          {!rejected && (
            <Button onClick={check} loading={busy}>
              Comprobar de nuevo
            </Button>
          )}
          <Button variant="secondary" onClick={onSignOut}>
            <LogOut aria-hidden="true" size={18} className="mr-2" />
            Salir
          </Button>
        </div>
      </div>
    </main>
  )
}
