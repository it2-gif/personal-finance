import './ProgressBar.css'

export default function ProgressBar({ value, max, label = 'Progress' }) {
  const percentage = Math.min(100, Math.max(0, Number(value) / Number(max) * 100 || 0))
  return (
    <div className="ui-progress" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(percentage)}>
      <span style={{ width: `${percentage}%` }} />
    </div>
  )
}
