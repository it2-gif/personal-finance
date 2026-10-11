import { forwardRef } from 'react'
import './Button.css'

const Button = forwardRef(function Button({
  children,
  variant = 'primary',
  size = 'medium',
  loading = false,
  className = '',
  disabled = false,
  type = 'button',
  ...props
}, ref) {
  const classes = ['ui-button', `ui-button-${variant}`, `ui-button-${size}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="ui-button-spinner" aria-hidden="true" />}
      {children}
    </button>
  )
})

export default Button
