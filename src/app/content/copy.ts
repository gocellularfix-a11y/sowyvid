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
  audio: {
    title: 'Sonido de tu comercial',
    musicLabel: 'Música del comercial',
    noMusic: 'Sin música',
    musicVolume: 'Volumen de música',
    noMusicImported: 'No agregaste música de fondo.',
    sourceAudioTitle: 'Audio original del video',
    sourceAudioEnable: 'Usar audio original',
    sourceAudioVolume: 'Volumen del audio original',
    sourceAudioHint: 'Apagado por defecto — actívalo si quieres oír el sonido de tu video.',
    videoNoSound: 'Este video no contiene sonido.',
    silentWarning: 'Este comercial no tiene audio.',
  },
  home: {
    currentLabel: 'Comercial actual:',
    newCommercial: 'Nuevo comercial',
    unnamed: 'Sin nombre',
  },
  library: {
    title: 'Mis comerciales',
    empty: 'Aún no tienes comerciales. Crea el primero desde Inicio.',
    open: 'Abrir',
    rename: 'Renombrar',
    duplicate: 'Duplicar',
    remove: 'Eliminar',
    openLastVideo: 'Abrir último video',
    openFolder: 'Abrir carpeta',
    videosTitle: 'Videos creados',
    noVideos: 'Este comercial aún no tiene videos exportados.',
    fileMissing: 'Archivo no encontrado',
    play: 'Reproducir',
    anotherVersion: 'Crear otra versión',
    status: { draft: 'Borrador', ready: 'Listo', exported: 'Exportado' },
    deleteTitle: 'Eliminar comercial',
    deleteBody:
      'Se eliminará el proyecto y su material administrado. Esta acción no se puede deshacer.',
    deleteKeepExports: 'Conservar los videos ya exportados en mi computadora',
    deleteConfirm: 'Eliminar el proyecto y su material administrado',
    cancel: 'Cancelar',
  },
  mediaRemove: {
    title: 'Este archivo se está usando en tu comercial.',
    replace: 'Reemplazar archivo',
    removeAndDelete: 'Quitar del comercial y eliminar',
    cancel: 'Cancelar',
  },
  common: {
    unavailable: 'Disponible pronto',
    unavailableHint: 'Esta función estará disponible en una próxima versión.',
  },
} as const

export type StyleOption = (typeof copy.step3.styles)[number]
