import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { ToastContext, type ToastApi, type ToastTone } from './toastContext'
import styles from './Toast.module.css'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

const TONE_ICON: Record<ToastTone, IconName> = {
  info: 'bulb',
  success: 'check-circle',
  error: 'alert',
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++
    setItems((prev) => [...prev, { id, message, tone }])
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 3600)
  }, [])

  const api = useMemo<ToastApi>(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={[styles.toast, styles[t.tone]].join(' ')}>
            <Icon name={TONE_ICON[t.tone]} size={18} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
