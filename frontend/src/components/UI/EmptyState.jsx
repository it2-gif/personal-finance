import './EmptyState.css'

export default function EmptyState({ title, description, action, icon = '—' }) {
  return (
    <div className="ui-empty-state">
      <span className="ui-empty-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}
