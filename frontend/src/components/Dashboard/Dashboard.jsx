import { useEffect, useState } from 'react'
import { apiRequest } from '../../api'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import MetricCard from '../UI/MetricCard'
import SectionCard from '../UI/SectionCard'
import Skeleton from '../UI/Skeleton'
import './Dashboard.css'
function todayInCairo() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  )

  return `${values.year}-${values.month}-${values.day}`
}

function getRange(period) {
  const today = todayInCairo()
  const start = new Date(`${today}T00:00:00Z`)

  if (period === 'week') {
    const daysSinceSaturday = (start.getUTCDay() + 1) % 7
    start.setUTCDate(start.getUTCDate() - daysSinceSaturday)
  } else if (period === 'month') {
    start.setUTCDate(1)
  }

  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: today,
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
  }).format(Number(value))
}

const periods = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
]

export default function Dashboard({ refreshKey = 0 }) {
  const [period, setPeriod] = useState('today')
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadSummary() {
      setLoading(true)
      setError('')
      setSummary(null)

      const query = new URLSearchParams(getRange(period))

      try {
        const data = await apiRequest(`/summary?${query}`)
        if (active) setSummary(data)
      } catch {
        if (active) {
          setError('Unable to load your summary. Please reload to try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadSummary()

    return () => {
      active = false
    }
  }, [period, refreshKey])

  return (
    <SectionCard className="dashboard-summary" aria-labelledby="summary-heading">
      <div className="summary-toolbar">
        <div><h2 id="summary-heading">Cash flow</h2><p>Income and spending for the selected period.</p></div>
        <div className="period-controls" role="group" aria-label="Summary period">
        {periods.map(({ value, label }) => (
          <Button
            key={value}
            variant={period === value ? 'primary' : 'ghost'}
            size="small"
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {label}
          </Button>
        ))}
        </div>
      </div>

      {loading && <Skeleton cards={3} lines={0} label="Loading cash flow" />}
      <Toast message={error} type="error" onClose={() => setError('')} />

      {!loading && summary && (
        <>
          <p className="summary-date">
            {summary.start_date} – {summary.end_date}
          </p>

          <div className="summary-grid">
            <MetricCard label="Money in" value={formatMoney(summary.income)} icon="↓" tone="in" hint="Income recorded" />
            <MetricCard label="Money out" value={formatMoney(summary.expenses)} icon="↑" tone="out" hint="Expenses recorded" />
            <MetricCard label="Net cash flow" value={formatMoney(summary.surplus)} icon="≈" tone="balance" hint="Money in minus money out" />
          </div>
          <div className="cashflow-chart" aria-label="Income and expense comparison">
            <div><span>Income</span><div><i style={{ width: `${Math.max(2, Number(summary.income) / Math.max(Number(summary.income), Number(summary.expenses), 1) * 100)}%` }} /></div></div>
            <div><span>Expenses</span><div><i className="expense-bar" style={{ width: `${Math.max(2, Number(summary.expenses) / Math.max(Number(summary.income), Number(summary.expenses), 1) * 100)}%` }} /></div></div>
          </div>
        </>
      )}
    </SectionCard>
  )
}
