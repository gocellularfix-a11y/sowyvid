import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import styles from './ui.module.css'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
  leftIcon?: IconName
  rightIcon?: IconName
  children: ReactNode
}

const sizeClass = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
} satisfies Record<Size, string | undefined>

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  leftIcon,
  rightIcon,
  children,
  className,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = [styles.btn, styles[variant], sizeClass[size], block ? styles.block : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button className={classes} {...rest}>
      {leftIcon && <Icon name={leftIcon} size={18} />}
      <span>{children}</span>
      {rightIcon && <Icon name={rightIcon} size={18} />}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
}

export function IconButton({ icon, label, className, ...rest }: IconButtonProps): JSX.Element {
  return (
    <button
      className={[styles.iconBtn, className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={20} />
    </button>
  )
}
