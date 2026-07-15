import type { ReactNode } from 'react'
import styles from './ui.module.css'

export function StepBadge({ n }: { n: number }): JSX.Element {
  return <span className={styles.stepBadge}>{n}</span>
}

export function Pill({
  children,
  accent = false,
}: {
  children: ReactNode
  accent?: boolean
}): JSX.Element {
  return (
    <span className={[styles.pill, accent ? styles.pillAccent : ''].filter(Boolean).join(' ')}>
      {children}
    </span>
  )
}
