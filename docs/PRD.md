# PRD: FidelityCard (MVP)
**Estado**: Borrador para revisión | **Autor**: Alex (PM) | **Fecha**: 2026-10-19 | **Versión**: 0.1
**Stakeholders**: Pablo (dueño), Arquitectura, Legal/RGPD (consulta externa)

> Nota de evidencia: este documento nace de la idea del cliente. **No hay entrevistas ni datos de mercado todavía.** Todo lo marcado como *supuesto* debe validarse (ver sección 6).

---

## 0. "Nota de prensa" (una frase)
FidelityCard permite a un comercio dar una tarjeta de fidelidad en la wallet del móvil de sus clientes en 15 segundos, acercando el móvil a una pieza NFC en caja, sin app, sin tarjetas de cartón y sin que el cajero pierda tiempo.

---

## 1. Visión, problema y usuarios

### Problema
El pequeño comercio quiere fidelizar pero las tarjetas de cartón se pierden, no dan datos de contacto y requieren que el cliente "se acuerde". Las apps propias son inviables para un comercio pequeño y el cliente no se baja una app por cada tienda. *(Supuesto: no verificado con comercios reales.)*

### Visión
Ser la forma más rápida de que un comercio local tenga un programa de fidelidad funcionando (alta en minutos, hardware incluido), y de que el cliente lleve la tarjeta donde ya mira: su wallet.

### Personas
| Persona | Contexto | Necesita | Frustración |
|---|---|---|---|
| **Dueño del comercio** (comprador y administrador) | Negocio pequeño/mediano, poco tiempo, poca pericia técnica | Configurar la tarjeta sin ayuda; ver si funciona (altas, visitas, canjes); recuperar clientes | Soluciones caras o complejas; no saber si el programa da resultados |
| **Cajero/empleado** | En caja con cola, usa el móvil/tablet/TPV del local | Sumar visita/punto y canjear en menos de 5 s sin errores | Procesos lentos, fraudes, dudas sobre si el cliente ya tiene premio |
| **Cliente final** | Está pagando, con prisa, móvil en mano | Entrar en el programa con el mínimo de campos; ver su progreso; saber cuándo tiene premio | Formularios largos, instalar apps, desconfianza con sus datos |

---

## 2. Objetivos y no-objetivos

### Objetivos del MVP
1. Un comercio puede darse de alta, configurar su tarjeta y empezar a captar clientes **el mismo día**.
2. Un cliente nuevo completa el alta y añade la tarjeta a su wallet en **menos de 60 s**.
3. El comercio puede sumar visitas/puntos y entregar la recompensa **sin salir del flujo de caja**.

### No-objetivos (MVP)
- Sin app nativa. Sin integración con TPV/POS. Sin pagos online ni facturación automática (cobro manual/Stripe link fuera del producto).
- Sin multi-sucursal, sin campañas de marketing/email/SMS, sin niveles/VIP, sin referidos, sin analítica avanzada.
- Sin personalización avanzada del diseño del pase (solo logo + color + nombre).
- Sin soporte de tarjetas con tipos de recompensa múltiples.

---

## 3. Alcance MVP vs. backlog (MoSCoW)

### MUST (sin esto no se vende)
| # | Funcionalidad | Notas de recorte |
|---|---|---|
| M1 | Alta de comercio (registro + login) y panel básico | Un comercio = un local = un usuario dueño |
| M2 | Configuración de **una** tarjeta activa: tipo VISITAS **o** PUNTOS, umbral X, descripción de la recompensa, logo, color | Tipo fijo una vez hay clientes (cambiarlo = nueva tarjeta) |
| M3 | URL única por comercio (NFC) + landing de alta (nombre, email, teléfono, consentimiento) | Comercio identificado por token en URL |
| M4 | Emisión de pase en **Google Wallet y Apple Wallet** (botón según dispositivo) | Ver riesgos: Apple es el camino crítico |
| M5 | Sumar visita/punto desde la vista de caja (cajero) con anti-duplicado | Opción recomendada en 4.3 |
| M6 | Canjear recompensa y reiniciar/descontar saldo | Con registro de canje |
| M7 | Actualización del pase en la wallet tras cada movimiento (progreso visible) | Sin esto la tarjeta "parece muerta" |
| M8 | Lista de clientes del comercio + KPIs mínimos (altas, visitas, canjes) | Solo tabla y 3 contadores |
| M9 | RGPD básico: consentimiento explícito, política de privacidad, borrado a petición | Obligatorio por ley, no negociable |

### SHOULD (primeras 4-6 semanas post-MVP)
- S1 Empleados con rol (cajero sin acceso a clientes/configuración) y PIN.
- S2 Modo "re-toque NFC" para clientes recurrentes (check-in autónomo con cooldown).
- S3 Exportar clientes a CSV.
- S4 Plantilla/preview del pase editable con más personalización.

### COULD
- C1 Notificaciones push de wallet (mensaje de cambio) y recordatorios de caducidad.
- C2 Multi-sucursal / varias piezas NFC por comercio.
- C3 Caducidad de puntos/visitas; recompensas escalonadas.
- C4 Campañas segmentadas (email/SMS), cumpleaños.
- C5 Facturación/suscripción integrada (Stripe).

### WON'T (por ahora)
- App nativa, integración POS, programa de referidos, gamificación, marketplace multi-comercio, IA/analítica predictiva.

> **Priorización RICE ligera (para el desempate)**: sin datos de Reach reales no se calcula RICE numérico. Criterio usado: *¿el comercio puede cobrar la suscripción sin esto?* Si no, es MUST.

---

## 4. Flujos clave

### 4.1 Cliente final en caja (alta)
1. Cliente acerca el móvil a la pieza NFC → se abre `https://<dominio>/c/<token-comercio>`.
2. Landing con nombre/logo del comercio, 3 campos (nombre completo, email, teléfono), casilla de consentimiento y enlace a privacidad.
3. Envía → el sistema crea el cliente + su tarjeta (saldo 0) en el comercio.
4. Aparece el botón "Añadir a Apple Wallet" (iOS) o "Añadir a Google Wallet" (Android). Respaldo: QR/enlace del pase por si falla el botón.
5. (Opcional según config) Se suma la primera visita/puntos de bienvenida.

Casos borde: el cliente ya existe (mismo email o teléfono en ese comercio) → no crear duplicado, reofrecer su pase; el móvil no lee NFC (QR impreso en la pieza como alternativa); fallo de wallet → mostrar el pase como página web con QR.

### 4.2 Alta de comercio y configuración (dueño)
1. Registro (email + contraseña) → datos del negocio (nombre, logo, color).
2. Asistente de tarjeta: elige VISITAS o PUNTOS.
   - **VISITAS**: "Cada N visitas, recompensa R".
   - **PUNTOS**: "Cada 1 € gastado = P puntos; con X puntos, recompensa R". (Requiere que el cajero introduzca el importe.)
3. Vista previa del pase → guardar → el panel muestra la URL/QR del NFC (para grabar la pieza) y el enlace del modo caja.
4. Se activa la tarjeta; el comercio ya puede captar clientes.

### 4.3 Cómo se suma una visita/punto y se canjea (la idea original no lo define)

**Opciones evaluadas**

| Opción | Cómo funciona | Pros | Contras |
|---|---|---|---|
| **A. El cajero escanea el QR del pase** (cliente muestra la wallet) con la cámara del móvil/tablet en la web de caja | El pase lleva un QR/código con el id de la tarjeta; el cajero escanea y elige "sumar visita" / "sumar importe X" / "canjear" | Control total del comercio; sirve para puntos (importe) y visitas; sirve para canje; sin app; antifraude natural | Requiere un dispositivo con cámara en caja; 1 paso más |
| **B. Re-toque NFC del cliente** (auto check-in) | El cliente vuelve a tocar la pieza; el sistema lo reconoce (cookie/token del pase) y suma visita | Mínima fricción; aprovecha el NFC | El cliente puede tocar sin comprar; no sirve para puntos por importe; reconocer al cliente de forma fiable es frágil (cookies, navegadores) |
| **C. El cajero busca por teléfono/email** | Introduce teléfono en el panel | No requiere cámara ni wallet | Lento, error humano, mala experiencia con cola |
| **D. Híbrida: toque NFC + aprobación del cajero** | El cliente toca, el cajero recibe aviso/aprueba | Combina sencillez y control | Complejidad (tiempo real, dos dispositivos); no es MVP |

**Recomendación MVP: Opción A** (cajero escanea el QR del pase) con C como respaldo manual. Motivo: es la única que cubre VISITAS y PUNTOS, y el canje con una sola mecánica, y deja el control en el comercio. El NFC queda para el **alta** (lo que lo hace vendible y diferencial). Opción B se añade como SHOULD (S2) solo para tarjetas de VISITAS, con cooldown, una vez validado el abuso real.

**Reglas de negocio MVP**
- **Antifraude doble toque**: un mismo cliente no puede sumar más de 1 visita en una ventana configurable (por defecto **30 min**, editable por el comercio). Los puntos sí pueden sumarse varias veces por importe, pero el cajero ve el último movimiento. Idempotencia: cada acción lleva un id; reintentos de red no duplican.
- **Canje**: cuando el saldo ≥ umbral, el pase muestra "Recompensa disponible". El cajero escanea → botón "Canjear" → se descuenta el umbral (puntos) o se reinicia el contador (visitas) → se registra canje con fecha y usuario. El excedente se conserva.
- **Anulación**: el dueño puede revertir el último movimiento (errores del cajero). Todo movimiento queda en un log inmutable.

### 4.4 Cajero (diario)
Abrir la web de caja en su móvil/tablet (sesión persistente) → escanear el pase → ver nombre, saldo y si hay premio → tocar "+1 visita" / introducir importe / "Canjear" → confirmación en pantalla (<5 s).

---

## 5. Historias de usuario con criterios de aceptación (MVP)

**H1. Alta de comercio** — Como dueño, quiero registrarme y crear mi negocio para empezar a usar el servicio.
- [ ] Dado un email válido y contraseña, cuando me registro, entonces puedo entrar al panel y completar nombre, logo y color.
- [ ] Dado un email ya registrado, entonces se muestra un error claro sin revelar datos.
- [ ] Un comercio no puede ver datos de otro (aislamiento por comercio a nivel de base de datos).

**H2. Configurar tarjeta** — Como dueño, quiero definir si mi tarjeta es por visitas o por puntos, el umbral y la recompensa.
- [ ] Puedo elegir VISITAS (N visitas) o PUNTOS (puntos por € + umbral) y escribir la recompensa.
- [ ] Veo una vista previa del pase antes de activar.
- [ ] Una vez hay clientes inscritos no puedo cambiar el tipo; sí el texto de la recompensa y el diseño.
- [ ] Al activar se genera la URL/QR de la pieza NFC.

**H3. Alta del cliente por NFC** — Como cliente, quiero registrarme en segundos para tener mi tarjeta.
- [ ] Dada la URL del NFC, la landing muestra el comercio correcto sin que lo introduzca.
- [ ] Nombre, email y teléfono son obligatorios y validados; el consentimiento no está premarcado y bloquea el envío si no se acepta.
- [ ] Al enviar, veo el botón de wallet adecuado a mi dispositivo en menos de 3 s.
- [ ] Si ya existía (mismo email/teléfono en ese comercio), no se duplica y recupero mi pase.
- [ ] La landing carga en <2 s en 4G y es usable a 360 px de ancho.

**H4. Tarjeta en la wallet** — Como cliente, quiero guardar la tarjeta en mi wallet.
- [ ] Android abre Google Wallet; iPhone abre Apple Wallet con el pase firmado y válido.
- [ ] El pase muestra nombre del comercio, progreso (X/N visitas o puntos) y un código escaneable.
- [ ] Si la wallet falla, hay una alternativa con enlace/QR.

**H5. Sumar visita/punto** — Como cajero, quiero sumar visita o puntos rápidamente.
- [ ] Al escanear un pase válido veo nombre y saldo actual en <2 s.
- [ ] En VISITAS: "+1 visita"; en PUNTOS: introduzco el importe y se calculan los puntos.
- [ ] Si repito la acción dentro de la ventana antifraude (VISITAS), el sistema la rechaza con mensaje claro.
- [ ] Tras confirmar, el pase en la wallet del cliente refleja el nuevo saldo (objetivo <1 min).
- [ ] Un pase de otro comercio se rechaza.

**H6. Canjear recompensa** — Como cajero, quiero canjear el premio al llegar al umbral.
- [ ] El botón "Canjear" solo aparece si saldo ≥ umbral.
- [ ] Al canjear se descuenta/reinicia el saldo y queda registro con fecha y usuario.
- [ ] No se puede canjear dos veces la misma recompensa (idempotencia).
- [ ] El pase refleja el nuevo saldo.

**H7. Panel de resultados** — Como dueño, quiero ver cómo va mi programa.
- [ ] Veo total de clientes, visitas/puntos del periodo y canjes.
- [ ] Veo una tabla de clientes (nombre, email, teléfono, saldo, última visita).
- [ ] Puedo revertir el último movimiento de un cliente.

**H8. Privacidad (RGPD)** — Como cliente, quiero control sobre mis datos.
- [ ] Veo quién es el responsable/encargado, para qué se usan mis datos y cómo darme de baja antes de aceptar.
- [ ] El dueño puede borrar a un cliente (borrado real, y se invalida su pase).
- [ ] Se guarda la prueba del consentimiento (fecha, versión del texto, comercio).

---

## 6. Riesgos y supuestos

### Riesgos
| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| **Apple Wallet**: requiere Apple Developer Program (cuota anual), Pass Type ID, certificado de firma y servicio web + APNs para actualizar pases. Plazo de alta de cuenta incierto | Alta | Alto | Iniciar el trámite ya; modelo de certificados a decidir (uno de la plataforma firmando por todos los comercios, recomendado). Plan B: lanzar con Google Wallet + pase web (QR) si Apple se retrasa |
| **Google Wallet**: requiere cuenta de emisor (Issuer ID) y activar la API; pasa por revisión/modo demo hasta producción | Media | Alto | Solicitar acceso temprano; usar modo de pruebas para desarrollo |
| **RGPD**: recogemos datos personales (nombre, email, teléfono) en nombre del comercio (responsable) con nosotros como encargados | Alta | Alto | Consentimiento explícito y registrable, contrato de encargo de tratamiento con cada comercio, política de privacidad, minimización de datos, borrado a petición, alojar datos en UE (región de Supabase UE). Revisión legal antes del primer cliente real |
| **Fraude / doble suma** por doble toque NFC o cajero | Media | Medio | Ventana anti-duplicado, idempotencia, log inmutable, reversión por el dueño |
| **NFC**: compatibilidad desigual (iPhone con lectura en segundo plano solo de modelos recientes; Android depende del ajuste NFC activo) | Media | Medio | QR impreso en la pieza como alternativa obligatoria; probar en varios modelos |
| **Actualización de pases** retrasada por la wallet (sobre todo en Apple) | Media | Medio | Mostrar saldo real en la web de caja (fuente de verdad = base de datos, no el pase) |
| **Adopción del cajero**: si frena la cola, el comercio abandona | Media | Alto | Flujo de caja <5 s; pruebas con 3 comercios piloto |
| **Demanda no validada**: el comercio podría no pagar | Media | Alto | Piloto con 3-5 comercios antes de construir de más; precio de prueba |
| **Piezas NFC físicas**: logística y coste unitario | Baja | Medio | Pieza genérica (etiqueta NTAG programada con la URL); decidir proveedor |

### Supuestos (a validar)
1. Hay comercios dispuestos a pagar una suscripción por esto *(sin validar)*.
2. Los clientes aceptan dar 3 datos a cambio de la tarjeta *(sin validar)*.
3. Un comercio = un local = una pieza NFC en el MVP.
4. El cajero dispone de un móvil/tablet con cámara en caja.
5. La plataforma (no cada comercio) es la titular de las cuentas Apple/Google y firma los pases.
6. Supabase en región UE es suficiente para cumplir con el alojamiento de datos.

---

## 7. Preguntas abiertas para el dueño (ordenadas por impacto)

1. **¿Cómo se suma la visita/punto en visitas posteriores?** Recomendación: el cajero escanea el QR del pase (Opción A de 4.3); el re-toque NFC autónomo queda para después, solo en tarjetas de visitas.
2. **¿Lanzamos con Apple y Google Wallet a la vez o con Google primero?** Recomendación: ambos objetivo del MVP, pero empezar el trámite de Apple Developer **ya** y, si se retrasa, lanzar con Google + pase web con QR.
3. **¿Quién cobra y cuánto? (precio, cuota mensual, coste de la pieza NFC, alta)** Recomendación: cuota mensual única por local + pieza incluida; cobro manual (enlace de pago) los primeros pilotos, sin facturación integrada.
4. **¿Tenemos ya 3-5 comercios piloto identificados?** Recomendación: conseguir al menos 3 cartas de intención antes de invertir en funcionalidades más allá del MVP; entrevistar 5 comercios esta semana.
5. **¿Quién es responsable de los datos (RGPD): el comercio o nosotros?** Recomendación: el comercio es responsable y nosotros encargados, con contrato de encargo y texto de consentimiento estándar revisado por un abogado antes de lanzar.
6. **¿Las recompensas son solo "al llegar a X" una vez, o la tarjeta se reinicia y puede repetirse?** Recomendación: se reinicia y se repite (visitas: contador a cero; puntos: se descuentan y se conserva el excedente).
7. **¿Cuántos puntos por compra: importe en € o cantidad fija por visita?** Recomendación: puntos = importe × factor que fija el comercio; el cajero introduce el importe manualmente (sin integrar TPV).
8. **¿Se permite más de un local/pieza NFC o varios cajeros por comercio desde el día 1?** Recomendación: no; un local, un dueño y cajero compartido por enlace; roles con PIN en SHOULD (S1).

---

## 8. Métricas de éxito del MVP

*(Objetivos propuestos como punto de partida; sin línea base disponible, se confirmarán con los pilotos.)*

| Objetivo | Métrica | Objetivo propuesto | Ventana |
|---|---|---|---|
| Activación del comercio | % de comercios registrados que activan tarjeta y obtienen 1ª alta de cliente en 24 h | ≥ 70% | Primer mes |
| Captación | % de personas que abren la landing y completan alta + añaden a la wallet | ≥ 50% | Primer mes |
| Rapidez de alta | Tiempo mediano landing → pase añadido | < 60 s | Primer mes |
| Uso | Visitas/puntos sumados por cliente activo y semana; % de clientes con ≥ 2 visitas | ≥ 30% con 2ª visita | 60 días |
| Recompensas | Nº de canjes completados por comercio | ≥ 1 por comercio | 60 días |
| Fiabilidad | Pases emitidos correctamente / intentados; errores de duplicado | ≥ 98% | Continuo |
| Retención del comercio | Comercios piloto activos y que renuevan | ≥ 3 de 5 | 90 días |
| Satisfacción de caja | Tiempo mediano de sumar visita en caja | < 5 s | Piloto |

**North Star propuesta**: *clientes que vuelven a visitar el comercio y suman al menos 2 visitas*, por comercio y mes.

---

## 9. Plan de lanzamiento (resumen)
| Fase | Audiencia | Puerta de salida |
|---|---|---|
| Alfa interna | Pablo + 1 comercio amigo | Flujo completo alta → wallet → suma → canje funcionando en iOS y Android |
| Piloto cerrado | 3-5 comercios | Sin errores P0, tiempo en caja < 5 s, consentimiento y política revisados |
| Apertura | Comercios con lista de espera | Métricas de la sección 8 en objetivo en el piloto |

**Criterio de parada/rollback**: si más del 5% de pases fallan o hay un incidente de datos, se pausa la captación y se avisa a los comercios.

## 10. Siguiente paso
Aprobar o ajustar este alcance, responder las preguntas 1-4, y pasar a Arquitectura para validar el stack (React JS + Vite + Tailwind + Supabase + Vercel), en particular la emisión y firma de pases Apple/Google (probablemente Edge Functions de Supabase) y el modelo de seguridad multi-comercio (RLS).
