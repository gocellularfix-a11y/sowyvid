import { Icon, type IconName, SowyvidMark } from '../ui/Icon'
import { MediaThumb } from '../ui/MediaThumb'
import { copy } from '../content/copy'
import styles from './Sidebar.module.css'

export type NavKey = 'home' | 'myCommercials' | 'material'

interface NavItem {
  key: NavKey
  label: string
  icon: IconName
}

const NAV: NavItem[] = [
  { key: 'home', label: copy.nav.home, icon: 'home' },
  { key: 'myCommercials', label: copy.nav.myCommercials, icon: 'folder' },
  { key: 'material', label: copy.nav.material, icon: 'image' },
]

interface SidebarProps {
  active: NavKey
  onNavigate: (key: NavKey) => void
}

export function Sidebar({ active, onNavigate }: SidebarProps): JSX.Element {
  return (
    <nav className={styles.sidebar} aria-label="Navegación principal">
      <ul className={styles.navList}>
        {NAV.map((item) => {
          const isActive = item.key === active
          return (
            <li key={item.key}>
              <button
                type="button"
                className={[styles.navItem, isActive ? styles.active : ''].filter(Boolean).join(' ')}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigate(item.key)}
              >
                <Icon name={item.icon} size={20} />
                <span>{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className={styles.promo}>
        <div className={styles.promoHead}>
          <SowyvidMark size={22} />
          <span className={styles.promoTitle}>{copy.promo.title}</span>
        </div>
        <p className={styles.promoBody}>{copy.promo.body}</p>
        <MediaThumb kind="storefront" overlayText={copy.promo.shopSign} ratio="16:9" />
      </div>
    </nav>
  )
}
