import './StatusBadge.css'

export default function StatusBadge({ children, tone = 'neutral', className = '' }) {
  return <span className={`ui-status ui-status-${tone} ${className}`.trim()}>{children}</span>
}
