import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../api'
import Skeleton from '../UI/Skeleton'
import StatusBadge from '../UI/StatusBadge'
import Toast from '../UI/Toast'
import './DashboardInsights.css'

const money = (value) => new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(Number(value || 0))

export default function DashboardInsights({ refreshKey = 0 }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest('/accounts/balances'),
      apiRequest('/transactions?limit=5&offset=0'),
      apiRequest('/statements'),
    ]).then(([accounts, transactions, statements]) => {
      if (active) setData({ accounts, transactions, statements })
    }).catch((requestError) => {
      if (active) setError(requestError.message || 'Could not load dashboard details.')
    })
    return () => { active = false }
  }, [refreshKey])

  const overview = useMemo(() => {
    if (!data) return null
    const available = data.accounts.filter((account) => account.account_type !== 'credit').reduce((sum, account) => sum + Number(account.balance || 0), 0)
    const debt = data.accounts.filter((account) => account.account_type === 'credit').reduce((sum, account) => sum + Number(account.amount_owed || 0), 0)
    const openStatements = data.statements.filter((statement) => Number(statement.remaining_amount || 0) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date))
    return { available, debt, nextStatement: openStatements[0] }
  }, [data])

  if (!data && !error) return <Skeleton cards={3} lines={3} label="Loading dashboard details" />

  return (
    <section className="dashboard-insights" aria-labelledby="insights-heading">
      <Toast message={error} type="error" onClose={() => setError('')} />
      {overview && (
        <>
          <h2 id="insights-heading">Financial position</h2>
          <div className="position-grid">
            <div><span>Cash and bank</span><strong>{money(overview.available)}</strong><small>Available outside credit cards</small></div>
            <div><span>Card debt</span><strong>{money(overview.debt)}</strong><small>Total currently owed</small></div>
            <div><span>Next card payment</span><strong>{overview.nextStatement ? money(overview.nextStatement.remaining_amount) : 'Nothing due'}</strong><small>{overview.nextStatement ? `Due ${overview.nextStatement.due_date}` : 'No open statements'}</small></div>
          </div>

          <div className="recent-block">
            <div className="recent-heading"><div><h2>Recent activity</h2><p>Your five newest entries.</p></div><StatusBadge tone="info">{data.transactions.length} shown</StatusBadge></div>
            {data.transactions.length === 0 ? <p className="recent-empty">No activity recorded yet.</p> : (
              <ul>{data.transactions.map((entry) => (
                <li key={entry.id}>
                  <div><strong>{entry.category}</strong><small>{entry.date}{entry.description ? ` · ${entry.description}` : ''}</small></div>
                  <div className="recent-amount"><StatusBadge tone={entry.reversed_at ? 'neutral' : entry.type === 'income' ? 'success' : 'danger'}>{entry.reversed_at ? 'Reversed' : entry.type}</StatusBadge><strong className={entry.type}>{entry.type === 'income' ? '+' : '−'}{money(entry.amount)}</strong></div>
                </li>
              ))}</ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}
