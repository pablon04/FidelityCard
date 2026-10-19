import { Navigate } from 'react-router'
import { useMerchant } from '../merchant/merchantCtx.js'

export default function PanelHome() {
  const { merchant, program } = useMerchant()
  if (!merchant) return <Navigate to="/app/onboarding" replace />
  return <Navigate to={program?.status === 'active' ? '/app/share' : '/app/card'} replace />
}
