import './MetricCard.css'

export default function MetricCard({ label, value, icon, tone = 'primary', hint }) {
  return (
    <div className={`metric-card metric-card-${tone}`}>
      <div className="metric-card-top"><span>{label}</span><span className="metric-icon" aria-hidden="true">{icon}</span></div>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  )
}
