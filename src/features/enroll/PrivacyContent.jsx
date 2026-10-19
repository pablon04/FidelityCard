/** Segunda capa de privacidad (UX.md 3.4). TEXTO BORRADOR: pendiente de revision legal. */
export function PrivacyContent({ merchant }) {
  const name = merchant.legal_name || merchant.name
  const contact = merchant.privacy_email
  return (
    <div className="space-y-4 text-sm text-text">
      <p className="rounded-control border border-warning bg-warning-bg p-2 text-warning">
        Texto en borrador, pendiente de revisión legal.
      </p>
      <section>
        <h3 className="font-semibold">¿Quién es el responsable de tus datos?</h3>
        <p>
          {name}
          {contact ? `, ${contact}` : ''}.
        </p>
      </section>
      <section>
        <h3 className="font-semibold">¿Quién más accede a ellos?</h3>
        <p>
          FidelityCard presta el servicio técnico (encargado del tratamiento) y no usa tus datos
          para fines propios. Los datos se alojan en servidores dentro de la Unión Europea. Si
          eliges Google Wallet, Google recibe los datos mínimos necesarios para mostrar tu tarjeta,
          conforme a sus propias políticas.
        </p>
      </section>
      <section>
        <h3 className="font-semibold">¿Para qué usamos tus datos?</h3>
        <p>Para crear y gestionar tu tarjeta de fidelidad y tus recompensas en este comercio.</p>
      </section>
      <section>
        <h3 className="font-semibold">¿Cuánto tiempo los guardamos?</h3>
        <p>
          Mientras mantengas tu tarjeta activa o hasta que retires tu consentimiento. Después se
          conservan bloqueados solo el tiempo que exija la ley.
        </p>
      </section>
      <section>
        <h3 className="font-semibold">¿Cómo ejercer tus derechos o darte de baja?</h3>
        <p>
          {contact ? `Escribe a ${contact}.` : 'Contacta con el comercio.'} También puedes reclamar
          ante la Agencia Española de Protección de Datos (aepd.es).
        </p>
      </section>
    </div>
  )
}
