import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import styles from './ui.module.css'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  small?: boolean
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  small = false,
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  const classes = [styles.button, styles[variant], small ? styles.small : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <button type="button" className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className={styles.spinner} aria-hidden /> : null}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
}

export function IconButton({ label, className, children, ...rest }: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={[styles.iconButton, className ?? ''].filter(Boolean).join(' ')}
      title={label}
      aria-label={label}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  error,
  children
}: {
  label?: string
  hint?: string
  error?: string | null
  children: ReactNode
}): React.JSX.Element {
  return (
    <label className={styles.field}>
      {label ? <span className={styles.label}>{label}</span> : null}
      {children}
      {error ? <span className={styles.errorText}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input {...props} className={[styles.input, props.className ?? ''].filter(Boolean).join(' ')} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return <textarea {...props} className={[styles.textarea, props.className ?? ''].filter(Boolean).join(' ')} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select {...props} className={[styles.select, props.className ?? ''].filter(Boolean).join(' ')} />
}

export function Switch({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <label className={styles.switch}>
      <input
        type="checkbox"
        className={styles.switchInput}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.switchTrack}>
        <span className={styles.switchThumb} />
      </span>
      <span>{label}</span>
    </label>
  )
}

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export function Badge({
  children,
  tone = 'neutral'
}: {
  children: ReactNode
  tone?: BadgeTone
}): React.JSX.Element {
  const toneClass =
    tone === 'accent'
      ? styles.badgeAccent
      : tone === 'success'
        ? styles.badgeSuccess
        : tone === 'warning'
          ? styles.badgeWarning
          : tone === 'danger'
            ? styles.badgeDanger
            : ''
  return <span className={[styles.badge, toneClass].filter(Boolean).join(' ')}>{children}</span>
}

export function Spinner(): React.JSX.Element {
  return <span className={styles.spinner} role="status" aria-label="Loading" />
}

export function EmptyState({
  title,
  body,
  action
}: {
  title: string
  body?: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyTitle}>{title}</div>
      {body ? <div className={styles.emptyBody}>{body}</div> : null}
      {action}
    </div>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}): React.JSX.Element | null {
  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className={[styles.modal, wide ? styles.modalWide : ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{title}</span>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className={styles.modalBody}>{children}</div>
        {footer ? <div className={styles.modalFooter}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}
