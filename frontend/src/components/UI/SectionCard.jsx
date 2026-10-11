import Card from './Card'
import './SectionCard.css'

export default function SectionCard({ title, description, action, children, className = '', ...props }) {
  return (
    <Card className={`ui-section-card ${className}`.trim()} {...props}>
      {(title || description || action) && <div className="ui-section-heading"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action}</div>}
      {children}
    </Card>
  )
}
