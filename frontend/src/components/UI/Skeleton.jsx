import './Skeleton.css'

export default function Skeleton({ lines = 3, cards = 0, label = 'Loading content' }) {
  return (
    <div className="ui-skeleton" role="status" aria-label={label}>
      {cards > 0 && <div className="ui-skeleton-cards">{Array.from({ length: cards }, (_, index) => <span className="ui-skeleton-card" key={index} />)}</div>}
      {Array.from({ length: lines }, (_, index) => <span className="ui-skeleton-line" key={index} />)}
    </div>
  )
}
