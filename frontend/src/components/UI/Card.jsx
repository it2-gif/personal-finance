import './Card.css'

export default function Card({ children, className = '', as: Element = 'section', ...props }) {
  return <Element {...props} className={`ui-card ${className}`.trim()}>{children}</Element>
}
