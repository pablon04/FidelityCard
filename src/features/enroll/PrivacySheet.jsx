import { Button } from '../../components/ui/Button.jsx'
import { Sheet } from '../../components/ui/Sheet.jsx'
import { PrivacyContent } from './PrivacyContent.jsx'

export default function PrivacySheet({ open, onClose, merchant }) {
  return (
    <Sheet open={open} onClose={onClose} title="Cómo tratamos tus datos">
      <PrivacyContent merchant={merchant} />
      <Button size="lg" className="mt-4" onClick={onClose}>
        Entendido
      </Button>
    </Sheet>
  )
}
