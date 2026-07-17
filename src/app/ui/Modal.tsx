import type { ReactNode } from 'react'
import styles from './Modal.module.css'

/**
 * Minimal in-app decision dialog. Used for choices that must stay INSIDE the
 * app (native message boxes cannot carry testids, custom layouts, or the
 * product's visual language). Rendered only while `open`.
 */
export function Modal({
  open,
  title,
  children,
  testId,
}: {
  open: boolean
  title: string
  children: ReactNode
  testId?: string
}): JSX.Element | null {
  if (!open) return null
  return (
    <div className={styles.backdrop} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
      >
        <h3 className={styles.title}>{title}</h3>
        {children}
      </div>
    </div>
  )
}
