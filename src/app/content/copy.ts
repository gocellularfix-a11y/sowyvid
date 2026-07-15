/**
 * All user-facing text lives here in Spanish (the mockup's language). Centralized
 * so copy stays consistent and the product could be localized later. Product
 * name is always "SowyVid".
 */
export const copy = {
  brand: 'SowyVid',
  header: {
    help: 'Ayuda',
    settings: 'Ajustes',
  },
  nav: {
    home: 'Inicio',
    myCommercials: 'Mis comerciales',
    material: 'Material',
  },
  promo: {
    title: 'Comerciales que venden por ti',
    body: 'Rápido, fácil y hecho para negocios como el tuyo.',
    shopSign: 'TU NEGOCIO',
  },
  step1: {
    n: 1,
    title: 'Cuéntanos qué quieres promocionar',
    subtitle: 'Escribe en pocas palabras qué quieres comunicar.',
    placeholder: 'Ejemplo: Reparación de pantallas de iPhone el mismo día',
    continue: 'Continuar',
  },
  step2: {
    n: 2,
    title: 'Agrega tu material',
    subtitle: 'Sube fotos y videos. Entre más real, mejores resultados.',
    dropzone: 'Arrastra aquí o selecciona',
    sources: {
      thisDevice: 'Este equipo',
      myPhone: 'Mi teléfono',
      saved: 'Material guardado',
    },
    tipLabel: 'Consejo:',
    tip: 'Incluye fotos de tu negocio, productos, equipo y resultados.',
  },
  step3: {
    n: 3,
    title: 'Elige tu estilo',
    subtitle: 'Creamos 3 versiones diferentes para ti.',
    seeAll: 'Ver las 3 versiones',
    styles: [
      {
        id: 'direct',
        name: 'Directo y rápido',
        description: 'Enfocado en velocidad y resultados.',
      },
      {
        id: 'trust',
        name: 'Confianza y calidad',
        description: 'Transmite profesionalismo y confianza.',
      },
      {
        id: 'before-after',
        name: 'Antes y después',
        description: 'Muestra la transformación que obtienes.',
      },
    ],
  },
  step4: {
    n: 4,
    title: 'Tu comercial está listo',
    subtitle: 'Descarga, comparte y haz crecer tu negocio.',
    download: 'Descargar video',
    createAnother: 'Crear otra versión',
    notReadyTitle: 'Aún no está listo',
    notReadyBody: 'Completa los pasos anteriores y crearemos tu comercial.',
  },
  trust: [
    {
      icon: 'image' as const,
      title: 'Hecho con tu material',
      body: 'Usamos tus fotos y videos reales.',
    },
    {
      icon: 'phone' as const,
      title: 'Listo para redes sociales',
      body: 'Formato vertical optimizado.',
    },
    {
      icon: 'check-circle' as const,
      title: 'Sin experiencia necesaria',
      body: 'Nosotros hacemos el trabajo por ti.',
    },
  ],
  common: {
    unavailable: 'Disponible pronto',
    unavailableHint: 'Esta función estará disponible en una próxima versión.',
  },
} as const

export type StyleOption = (typeof copy.step3.styles)[number]
