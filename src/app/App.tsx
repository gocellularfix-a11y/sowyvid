import { useEffect, useState } from 'react'
import { AppHeader } from './shell/AppHeader'
import { Sidebar, type NavKey } from './shell/Sidebar'
import { HomeWorkspace } from './features/home/HomeWorkspace'
import { MyCommercials } from './features/library/MyCommercials'
import { MusicCenter } from './features/music/MusicCenter'
import { Icon, type IconName } from './ui/Icon'
import { useToast } from './ui/toastContext'
import { getBridge, isBrowserPreview } from './bridge'
import { copy } from './content/copy'
import styles from './App.module.css'

/**
 * App owns WHICH commercial is current. The three ways it changes all live here
 * so the rules stay in one place (§5):
 *   - startup: restore the most recently updated commercial, if any
 *   - library "Abrir": load the chosen commercial
 *   - "Nuevo comercial": clear to a blank slate, no project row until the owner acts
 *
 * HomeWorkspace is remounted (via `key`) whenever the current commercial
 * changes, so its internal state can never bleed between commercials.
 */
export function App(): JSX.Element {
  const [nav, setNav] = useState<NavKey>('home')
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [currentName, setCurrentName] = useState<string | null>(null)
  const [restored, setRestored] = useState(isBrowserPreview)
  // Bumped to force a fresh HomeWorkspace when starting a new commercial.
  const [homeEpoch, setHomeEpoch] = useState(0)
  const toast = useToast()

  // Startup restore: the repository lists by last update, so the first row is
  // the owner's current work. Restoring ONE commercial never implies the others
  // are gone — they remain in "Mis comerciales".
  useEffect(() => {
    if (isBrowserPreview) return
    let cancelled = false
    void (async () => {
      const projects = await getBridge().projects.list()
      if (cancelled) return
      if (projects.ok && projects.value.length > 0) {
        setCurrentId(projects.value[0]!.id)
        setCurrentName(projects.value[0]!.name)
      }
      setRestored(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const openCommercial = (projectId: string, name: string): void => {
    setCurrentId(projectId)
    setCurrentName(name)
    setHomeEpoch((n) => n + 1)
    setNav('home')
  }

  const newCommercial = (): void => {
    // A brand-new commercial does NOT overwrite the current one and does not
    // reuse its id — HomeWorkspace starts blank and only persists once the
    // owner writes something or imports material.
    setCurrentId(null)
    setCurrentName(null)
    setHomeEpoch((n) => n + 1)
    setNav('home')
  }

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
          {nav === 'home' &&
            (restored ? (
              <HomeWorkspace
                key={`home-${homeEpoch}`}
                initialProjectId={currentId}
                onProjectChanged={(id, name) => {
                  setCurrentId(id)
                  setCurrentName(name)
                }}
                onNewCommercial={newCommercial}
              />
            ) : (
              <div className={styles.placeholder} data-testid="restoring">
                <span className={styles.placeholderBody}>Cargando…</span>
              </div>
            ))}
          {nav === 'myCommercials' && <MyCommercials onOpen={openCommercial} />}
          {nav === 'music' && (
            <MusicCenter currentProjectId={currentId} currentProjectName={currentName} />
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
