import './ActionMenu.css'

export default function ActionMenu({ children, label = 'More actions' }) {
  return (
    <details className="ui-action-menu">
      <summary aria-label={label}>•••</summary>
      <div className="ui-action-menu-popover">{children}</div>
    </details>
  )
}
