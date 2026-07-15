import type { HTMLAttributes, ReactNode } from 'react'
import styles from './ui.module.css'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean
  children: ReactNode
}

export function Card({ padded = true, children, className, ...rest }: CardProps): JSX.Element {
  const classes = [styles.card, padded ? styles.cardPad : '', className].filter(Boolean).join(' ')
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}
