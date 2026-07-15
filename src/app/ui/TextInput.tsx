import type { TextareaHTMLAttributes, InputHTMLAttributes } from 'react'
import { useId } from 'react'
import styles from './ui.module.css'

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function TextArea({ label, id, className, ...rest }: TextAreaProps): JSX.Element {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <textarea
        id={fieldId}
        className={[styles.textarea, className].filter(Boolean).join(' ')}
        {...rest}
      />
    </div>
  )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function TextInput({ label, id, className, ...rest }: TextInputProps): JSX.Element {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <input id={fieldId} className={[styles.input, className].filter(Boolean).join(' ')} {...rest} />
    </div>
  )
}
