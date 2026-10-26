/** Contenido de la web comercial. Precios y limites: ver tabla de planes (merchants.plan). */

export const REGISTER_URL = '/app/login?modo=registro'
export const LOGIN_URL = '/app/login'

export const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    monthly: 25,
    yearly: 250,
    tagline: 'Para empezar con un solo programa de fidelidad.',
    cards: '1 tarjeta activa',
    dashboard: 'Dashboard básico',
    promos: '2 envíos al mes',
    segmentation: false,
    kit: 'Kit físico aparte',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 39,
    yearly: 390,
    featured: true,
    tagline: 'El favorito: varias tarjetas y promociones segmentadas.',
    cards: '3 tarjetas activas',
    dashboard: 'Dashboard completo',
    promos: '8 envíos al mes',
    segmentation: true,
    kit: '1 kit físico incluido',
  },
  {
    id: 'premium',
    name: 'Premium',
    monthly: 69,
    yearly: 690,
    tagline: 'Para negocios con varios programas o locales.',
    cards: '10 tarjetas activas',
    dashboard: 'Dashboard completo',
    promos: 'Envíos ilimitados*',
    segmentation: true,
    kit: '3 kits físicos incluidos',
  },
]

export const PROBLEMS = [
  {
    icon: 'CreditCard',
    title: 'Tarjetas de cartón que se pierden',
    text: 'El cliente la deja en casa, en otro bolso o en la basura. Tu programa de fidelidad no sirve si no la lleva encima.',
  },
  {
    icon: 'EyeOff',
    title: 'No sabes quién vuelve',
    text: 'Con cartulina no tienes nombre, contacto ni historial. No puedes avisar, premiar ni medir nada.',
  },
  {
    icon: 'Smartphone',
    title: 'Las apps no las instala nadie',
    text: 'Pedir una descarga y un registro largo frena al cliente en el mostrador. Aquí basta con acercar el móvil.',
  },
  {
    icon: 'ShieldAlert',
    title: 'Sellos falsos y visitas duplicadas',
    text: 'Un tiempo mínimo entre visitas y un código de caja evitan abusos sin complicar el día a día del equipo.',
  },
]

export const STEPS = [
  {
    title: 'Configura tu tarjeta',
    text: 'Elige visitas o puntos, el umbral, la recompensa, tu logo y tu color. Ves la vista previa en directo.',
  },
  {
    title: 'Comparte con NFC o QR',
    text: 'Obtienes un enlace, un QR descargable y un enlace NFC para grabar en una pegatina. Un solo enlace para todo.',
  },
  {
    title: 'El cliente la guarda en su móvil',
    text: 'Entra, deja nombre, email y teléfono, y recibe su pase. Sin app y sin cuenta. Lo añade a su wallet si quiere.',
  },
]

export const FEATURES = [
  {
    id: 'editor',
    title: 'Diseña tu tarjeta en un minuto',
    text: 'Nombre, logo, color, tipo de tarjeta, umbral y recompensa. El contraste del texto se ajusta solo para que siempre se lea bien.',
    bullets: ['Visitas o puntos', 'Logo y color propios', 'Vista previa en tiempo real'],
  },
  {
    id: 'share',
    title: 'NFC y QR, un solo enlace',
    text: 'Pon una pegatina NFC junto a la caja o imprime el QR. Descarga el QR en PNG o SVG y usa el código de caja para validar visitas.',
    bullets: ['QR en PNG y SVG', 'Enlace NFC listo para grabar', 'Código de caja'],
  },
  {
    id: 'wallet',
    title: 'En el móvil del cliente, sin fricción',
    text: 'Cada cliente recibe un pase web que funciona en cualquier móvil, y puede añadirlo a Google Wallet. Apple Wallet llegará próximamente.',
    bullets: ['Pase web sin instalar nada', 'Google Wallet', 'Apple Wallet (próximamente)'],
  },
  {
    id: 'clients',
    title: 'Conoce a tus clientes',
    text: 'Cada cliente tiene su ficha con historial de visitas. Exporta la lista a CSV cuando la necesites.',
    bullets: ['Ficha e historial', 'Exportación CSV', 'Clientes ilimitados en todos los planes'],
  },
  {
    id: 'dashboard',
    title: 'Métricas de un vistazo',
    text: 'Nuevos clientes, visitas y recompensas en un panel claro. El plan Pro y Premium añaden el dashboard completo.',
    bullets: [
      'Dashboard básico o completo',
      'Evolución de visitas',
      'Pensado para móvil y escritorio',
    ],
  },
  {
    id: 'promos',
    title: 'Promociones directas al Wallet',
    text: 'Envía una oferta a la tarjeta de tus clientes, en Android e iPhone. Con segmentación (Pro y Premium) la mandas solo a quien te interesa.',
    bullets: ['Envíos mensuales según plan', 'Segmentación de clientes', 'Sin depender del email'],
  },
]

export const FAQ = [
  {
    q: '¿Mis clientes tienen que instalar una app?',
    a: 'No. Entran desde el móvil acercándolo a la pegatina NFC o escaneando el QR, se dan de alta en unos segundos y reciben un pase web. Si quieren, lo añaden a Google Wallet.',
  },
  {
    q: '¿Necesitan crear una cuenta o una contraseña?',
    a: 'No. Los clientes no tienen cuenta ni login. Su pase se identifica con un enlace y un QR únicos.',
  },
  {
    q: '¿Qué diferencia hay entre tarjeta por visitas y por puntos?',
    a: 'Por visitas, el cliente completa un número de visitas (por ejemplo 8) y obtiene la recompensa. Por puntos, acumula puntos hasta el umbral que definas. Puedes elegir el tipo en cada tarjeta.',
  },
  {
    q: '¿Cómo funciona el NFC?',
    a: 'Te damos un enlace NFC para grabar en una pegatina. Al acercar el móvil, se abre tu tarjeta. El QR y el NFC apuntan al mismo enlace, así que puedes usar ambos.',
  },
  {
    q: '¿Cómo evitáis el fraude?',
    a: 'Hay un tiempo mínimo entre visitas del mismo cliente y un código de caja para validar, así no se pueden sumar visitas seguidas.',
  },
  {
    q: '¿Cumplís con el RGPD?',
    a: 'Sí, está diseñado para ello: el consentimiento de privacidad es obligatorio y el de marketing es opcional y se guarda por separado. Los datos se alojan en la Unión Europea.',
  },
  {
    q: '¿Puedo cambiar de plan o tener varias tarjetas?',
    a: 'Sí. Cada plan incluye un número de tarjetas activas (1, 3 o 10) y puedes cambiar de plan desde tu cuenta. Los clientes son ilimitados en todos.',
  },
  {
    q: '¿Qué incluye el kit físico?',
    a: 'Una pegatina NFC más un QR impreso listo para colocar en el mostrador. Pro incluye 1 y Premium 3. En Basic se pide aparte.',
  },
]
