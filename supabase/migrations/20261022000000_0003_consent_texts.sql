-- =====================================================================
-- 0003_consent_texts.sql
-- Textos de consentimiento de docs/UX.md v0.2 (sec. 3.4) como NUEVA version.
-- 0001 versiona consent_texts por (purpose, version), filas inmutables (trigger
-- forbid_mutation) y "vigente" = la de mayor published_at por purpose
-- (get_public_merchant y enroll-customer lo usan asi). Por eso NO se editan
-- las filas '2026-10-v1': se publica '2026-10-v2', que pasa a ser la vigente.
-- Idempotente: ON CONFLICT DO NOTHING. body_sha256 lo calcula el trigger.
-- Placeholders que sustituye el cliente: {{merchant_name}}, {{legal_name}},
-- {{privacy_email}} (todos salen de get_public_merchant).
-- BORRADOR SIN REVISION LEGAL (decision del dueno): revisar antes de uso real.
-- =====================================================================
begin;

insert into public.consent_texts (purpose, version, locale, body) values
 ('terms_privacy', '2026-10-v2', 'es',
  'BORRADOR SIN REVISION LEGAL. '
  || 'Acepto que {{merchant_name}} trate mis datos (nombre, email y telefono) para gestionar mi tarjeta de fidelidad.'
  || E'\n\n'
  || 'Responsable: {{legal_name}}. Finalidad: gestionar tu tarjeta de fidelidad y tus recompensas. '
  || 'Base legal: tu consentimiento. Destinatarios: FidelityCard, como proveedor tecnologico que trata los datos por cuenta del comercio. '
  || 'Derechos: acceso, rectificacion, supresion, oposicion, limitacion y portabilidad, escribiendo a {{privacy_email}}. '
  || 'Puedes retirar tu consentimiento en cualquier momento. '
  || 'Tambien puedes reclamar ante la Agencia Espanola de Proteccion de Datos (aepd.es).'),
 ('marketing', '2026-10-v2', 'es',
  'BORRADOR SIN REVISION LEGAL. '
  || 'Quiero recibir ofertas y novedades de {{merchant_name}} por email o telefono. '
  || 'Puedo retirar este consentimiento en cualquier momento escribiendo a {{privacy_email}}.')
on conflict (purpose, version) do nothing;

commit;

-- DOWN: las filas son inmutables (trigger); revertir = publicar otra version posterior.
