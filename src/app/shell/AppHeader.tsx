import { SowyvidMark, Icon } from '../ui/Icon'
import { copy } from '../content/copy'
import styles from './AppHeader.module.css'

interface AppHeaderProps {
  onHelp?: () => void
  onSettings?: () => void
}

export function AppHeader({ onHelp, onSettings }: AppHeaderProps): JSX.Element {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <SowyvidMark size={30} />
        <span className={styles.wordmark}>{copy.brand}</span>
      </div>
      <div className={styles.actions}>
        <button className={styles.textAction} onClick={onHelp} type="button">
          <Icon name="help" size={18} />
          <span>{copy.header.help}</span>
        </button>
        <button className={styles.textAction} onClick={onSettings} type="button">
          <Icon name="settings" size={18} />
          <span>{copy.header.settings}</span>
        </button>
        <div className={styles.avatar} title="Cuenta" aria-label="Cuenta">
          JO
        </div>
      </div>
    </header>
  )
}
