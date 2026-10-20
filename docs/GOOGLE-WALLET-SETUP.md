# Google Wallet: puesta en marcha (pasos del dueño)

Edge Function: `google-wallet-link`. Crea la clase (una por comercio) y el objeto (uno por cliente) en la API de Google Wallet y devuelve el enlace "Añadir a Google Wallet". Hasta que hagas esto, déjala con `GOOGLE_WALLET_ENABLED=false` (responde 503 `wallet_disabled` y el front muestra solo el pase web).

**Nunca pegues la clave privada ni el JSON de la cuenta de servicio en un chat, en el repo ni en Vercel.** Solo en `supabase secrets set` desde tu terminal.

## 1. Proyecto de Google Cloud y API
1. https://console.cloud.google.com > selector de proyecto > **Proyecto nuevo** (p. ej. `fidelitycard-wallet`).
2. Menú **APIs y servicios > Biblioteca** > busca **Google Wallet API** > **Habilitar**.

## 2. Cuenta de servicio y clave
1. **IAM y administración > Cuentas de servicio > Crear cuenta de servicio** (nombre `wallet-issuer`). No necesita roles de proyecto.
2. Entra en la cuenta > pestaña **Claves > Agregar clave > Crear clave nueva > JSON**. Se descarga un `.json`: guárdalo en tu gestor de contraseñas.
3. Del JSON necesitas dos campos: `client_email` (= `GOOGLE_WALLET_SA_EMAIL`) y `private_key` (= `GOOGLE_WALLET_SA_PRIVATE_KEY`, empieza por `-----BEGIN PRIVATE KEY-----`).

## 3. Cuenta de emisor (Issuer ID)
1. https://pay.google.com/business/console (Google Pay & Wallet Console). Crea el perfil de empresa si te lo pide.
2. Ve a **Google Wallet API** (menú izquierdo). Si es la primera vez, **Crear cuenta de emisor** / aceptar condiciones.
3. Copia el **Issuer ID** (número largo) = `GOOGLE_WALLET_ISSUER_ID`.

## 4. Dar acceso a la cuenta de servicio
En la consola: **Usuarios** (o **Users**) > **Invitar a un usuario** > pega el `client_email` de la cuenta de servicio > rol **Desarrollador** (o Administrador) > Invitar. Sin esto la API devuelve 401/403 al crear clases.

## 5. Modo demo vs. publicación
- Al principio el emisor está en **modo demo**: solo pueden guardar pases los **usuarios de prueba**. Alta en la consola: **Google Wallet API > Gestionar > Configuración > Usuarios de prueba** (Test users) > añade los emails de las cuentas Google de los móviles Android con los que probarás.
- Para abrirlo a clientes reales: en **Google Wallet API > Gestionar > Solicitar acceso de publicación** (Request publishing access) rellena el formulario (caso de uso, capturas de la tarjeta). Google revisa; hasta la aprobación sigue en demo. Las clases se crean con `reviewStatus: UNDER_REVIEW`.
- Mientras estés en demo, prueba solo con usuarios de prueba y verifica en el móvil que el pase aparece con nombre, color y logo.

## 6. Secrets en Supabase
Desde tu terminal (sustituye valores; para la clave usa el fichero para no exponerla en el historial):
```
supabase secrets set GOOGLE_WALLET_ISSUER_ID="<issuer id>" GOOGLE_WALLET_SA_EMAIL="<client_email>" --project-ref <ref>
supabase secrets set GOOGLE_WALLET_SA_PRIVATE_KEY="$(jq -r .private_key ruta/al/clave.json)" --project-ref <ref>
supabase secrets set GOOGLE_WALLET_ENABLED=true --project-ref <ref>
```
También deben existir `ALLOWED_ORIGINS`, `PUBLIC_BASE_URL` e `IP_HASH_SALT` (ver enroll-customer). Opcional: `GOOGLE_WALLET_FALLBACK_LOGO_URL` = URL pública (png/jpg) usada si el comercio no sube logo; si no se define se usa `<PUBLIC_BASE_URL>/wallet-logo.png` (el front debe publicar ese fichero, ≥ 660x660 recomendado). La clave tolera `\n` escapados.

## 7. Desplegar y probar
```
supabase functions deploy google-wallet-link --no-verify-jwt --project-ref <ref>
```
Prueba: alta de un cliente con una cuenta de test user, abrir `/p/<token>` en Android y pulsar "Añadir a Google Wallet". Si falla, mira los logs de la función (Dashboard > Edge Functions > google-wallet-link > Logs): el campo `reason` indica el paso y el código HTTP de Google (`google_http_403` en `class` = falta el paso 4; `oauth_http_400` = clave/email mal copiados).

## 8. Rotación y caducidad
La clave de la cuenta de servicio puede rotarse (crear otra, `secrets set`, borrar la antigua) sin afectar a los pases ya guardados.
