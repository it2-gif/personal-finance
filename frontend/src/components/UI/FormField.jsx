import './FormField.css'

export default function FormField({ label, htmlFor, hint, error, children, className = '' }) {
  return (
    <div className={`ui-field ${className}`.trim()}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <small className="ui-field-error">{error}</small>}
    </div>
  )
}
