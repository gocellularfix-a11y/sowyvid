import { useState } from 'react'
import { AppHeader } from './shell/AppHeader'
import { Sidebar, type NavKey } from './shell/Sidebar'
import { HomeWorkspace } from './features/home/HomeWorkspace'
import { Icon, type IconName } from './ui/Icon'
import { useToast } from './ui/toastContext'
import { isBrowserPreview } from './bridge'
import { copy } from './content/copy'
import styles from './App.module.css'

export function App(): JSX.Element {
  const [nav, setNav] = useState<NavKey>('home')
  const toast = useToast()

  return (
    <div className={styles.app}>
      {isBrowserPreview && (
        <div className={styles.previewBanner}>
          <Icon name="alert" size={14} />
          Modo vista previa (navegador) — sin acceso a archivos ni render real
        </div>
      )}
      <AppHeader
        onHelp={() => toast.show('El centro de ayuda estará disponible pronto.', 'info')}
        onSettings={() => toast.show('Los ajustes estarán disponibles pronto.', 'info')}
      />
      <div className={styles.body}>
        <Sidebar active={nav} onNavigate={setNav} />
        <main className={styles.main}>
          {nav === 'home' && <HomeWorkspace />}
          {nav === 'myCommercials' && (
            <Placeholder
              icon="folder"
              title={copy.nav.myCommercials}
              body="Aquí aparecerán los comerciales que crees. Empieza uno nuevo desde Inicio."
            />
          )}
          {nav === 'material' && (
            <Placeholder
              icon="image"
              title={copy.nav.material}
              body="Tus fotos, videos y música aparecerán aquí una vez que agregues material."
            />
          )}
        </main>
      </div>
    </div>
  )
}

function Placeholder({
  icon,
  title,
  body,
}: {
  icon: IconName
  title: string
  body: string
}): JSX.Element {
  return (
    <div className={styles.placeholder}>
      <span className={styles.placeholderIcon}>
        <Icon name={icon} size={28} />
      </span>
      <h2 className={styles.placeholderTitle}>{title}</h2>
      <p className={styles.placeholderBody}>{body}</p>
    </div>
  )
}
