/** Textos de la landing del cliente (UX.md 3.1-3.3). Un unico archivo para facilitar otros idiomas. */
export const es = {
  landing: {
    subtitle: 'Consigue tu tarjeta de fidelidad en tu móvil',
    notFoundTitle: 'No encontramos esta tarjeta',
    notFoundText:
      'El enlace puede estar desactivado o mal escrito. Pregunta en el mostrador por un código nuevo.',
    loadError: 'No hemos podido cargar la tarjeta. Revisa tu conexión e inténtalo de nuevo.',
    retry: 'Reintentar',
    successTitle: (name) => `¡Listo, ${name}!`,
    existingTitle: 'Ya tienes tu tarjeta',
    existingText: (shop) => `Ya estabas registrado en ${shop}. No hace falta crear otra.`,
    createdText: (shop) =>
      `Tu tarjeta de ${shop} está creada. Guárdala para tenerla siempre a mano.`,
  },
  form: {
    submit: 'Obtener mi tarjeta',
    submitting: 'Creando tu tarjeta…',
    slow: 'Seguimos con tu tarjeta, un momento…',
    wait: (n) => `Espera ${n} s`,
    privacyLink: 'Cómo tratamos tus datos',
  },
  errors: {
    nameEmpty: 'Escribe tu nombre y apellido.',
    nameShort: 'Escribe tu nombre completo, con apellido.',
    emailEmpty: 'Escribe tu email.',
    emailBad: 'Revisa el email: parece que falta algo, como "@correo.com".',
    phoneEmpty: 'Escribe tu móvil.',
    phoneBad: 'Revisa el móvil: debe tener 9 cifras (por ejemplo, 612 34 56 78).',
    phoneBadIntl: 'Revisa el móvil y el prefijo del país.',
    terms: 'Necesitamos tu aceptación para crear la tarjeta.',
    summary: (n) => `Hay ${n} ${n === 1 ? 'campo' : 'campos'} por revisar.`,
    offline: 'Sin conexión. Conéctate a internet y vuelve a intentarlo.',
    rate: (n) => `Has hecho demasiados intentos. Espera ${n} segundos y prueba otra vez.`,
    partial:
      'No hemos podido completar el alta. Si ya tenías tarjeta, usa los mismos datos o consulta con el comercio.',
    outdated: 'Hemos actualizado el texto de consentimiento. Revísalo y vuelve a pulsar el botón.',
    captcha:
      'No hemos podido verificar que eres una persona. Recarga la página e inténtalo de nuevo.',
    server:
      'No hemos podido crear tu tarjeta. Revisa tu conexión e inténtalo de nuevo. No has perdido nada de lo escrito.',
  },
}
