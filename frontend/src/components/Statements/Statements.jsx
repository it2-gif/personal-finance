import { useEffect, useState } from 'react'
import { apiRequest } from '../../api'
import Toast from '../UI/Toast'
import ConfirmButton from '../UI/ConfirmButton'
import Button from '../UI/Button'
import EmptyState from '../UI/EmptyState'
import Skeleton from '../UI/Skeleton'
import StatusBadge from '../UI/StatusBadge'
import './Statements.css'

function money(value) {
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
  }).format(Number(value))
}

const emptyForm = {
  account_id: '',
  opening_date: '',
  closing_date: '',
  due_date: '',
  amount_due: '',
  minimum_payment: '',
}

export default function Statements({ refreshKey = 0, onChanged }) {
  const [accounts, setAccounts] = useState([])
  const [statements, setStatements] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([apiRequest('/accounts'), apiRequest('/statements')])
      .then(([accountData, statementData]) => {
        if (!active) return
        const cards = accountData.filter((item) => item.account_type === 'credit')
        setAccounts(cards)
        setStatements(statementData)
        setForm((current) => ({
          ...current,
          account_id: cards.some((item) => String(item.id) === current.account_id)
            ? current.account_id
            : cards[0]
              ? String(cards[0].id)
              : '',
        }))
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Could not load statements.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [refreshKey])

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setError('')
    setMessage('')
  }

  async function save(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await apiRequest(
        editingId ? `/statements/${editingId}` : '/statements',
        {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...form,
          account_id: Number(form.account_id),
        }),
        },
      )
      setForm((current) => ({ ...emptyForm, account_id: current.account_id }))
      setMessage(editingId ? 'Statement updated.' : 'Statement added.')
      setEditingId(null)
      onChanged?.()
    } catch (requestError) {
      setError(requestError.message || 'Could not save this statement.')
    } finally {
      setSaving(false)
    }
  }

  function editStatement(statement) {
    setEditingId(statement.id)
    setForm({
      account_id: String(statement.account_id),
      opening_date: statement.opening_date,
      closing_date: statement.closing_date,
      due_date: statement.due_date,
      amount_due: statement.amount_due,
      minimum_payment: statement.minimum_payment,
    })
    setError('')
    setMessage('Correct the statement details, then save.')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm((current) => ({ ...emptyForm, account_id: current.account_id }))
    setError('')
    setMessage('')
  }

  async function removeStatement(statement) {
    setError('')
    try {
      await apiRequest(`/statements/${statement.id}`, { method: 'DELETE' })
      setMessage('Statement removed.')
      onChanged?.()
    } catch (requestError) {
      setError(requestError.message || 'Could not remove this statement.')
    }
  }

  return (
    <section className="statements-panel" aria-labelledby="statements-heading">
      <h2 id="statements-heading">Credit card statements</h2>
      <p>Add the real dates and amounts shown by your card issuer.</p>

      {loading && <Skeleton lines={4} label="Loading statements" />}
      <Toast message={error} type="error" onClose={() => setError('')} />
      <Toast message={message} type="success" onClose={() => setMessage('')} />

      {!loading && accounts.length === 0 && <p>Add a credit card first.</p>}

      {!loading && accounts.length > 0 && (
        <form className="statement-form" onSubmit={save}>
          <fieldset disabled={saving}>
            <label htmlFor="statement-card">Credit card</label>
            <select id="statement-card" value={form.account_id} onChange={(event) => change('account_id', event.target.value)} required>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            <label htmlFor="statement-open">Opening date</label>
            <input id="statement-open" type="date" value={form.opening_date} onChange={(event) => change('opening_date', event.target.value)} required />
            <label htmlFor="statement-close">Closing date</label>
            <input id="statement-close" type="date" value={form.closing_date} onChange={(event) => change('closing_date', event.target.value)} required />
            <label htmlFor="statement-due">Due date</label>
            <input id="statement-due" type="date" value={form.due_date} onChange={(event) => change('due_date', event.target.value)} required />
            <label htmlFor="statement-amount">Statement amount (EGP)</label>
            <input id="statement-amount" type="number" min="0" step="0.01" value={form.amount_due} onChange={(event) => change('amount_due', event.target.value)} required />
            <label htmlFor="statement-minimum">Minimum payment (EGP)</label>
            <input id="statement-minimum" type="number" min="0" step="0.01" value={form.minimum_payment} onChange={(event) => change('minimum_payment', event.target.value)} required />
          </fieldset>
          <div className="statement-actions">
            <Button type="submit" loading={saving}>
              {editingId
                  ? 'Save correction'
                  : 'Add statement'}
            </Button>
            {editingId && (
              <Button variant="secondary" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}

      {!loading && statements.length === 0 && (
        <EmptyState title="No statements yet" description="Add your first credit card statement to track due dates and payments." icon="▤" />
      )}

      <ul className="statement-list">
        {statements.map((statement) => (
          <li key={statement.id}>
            <div>
              <strong>{accounts.find((item) => item.id === statement.account_id)?.name || `Card ${statement.account_id}`}</strong>
              <div className="statement-meta">
                <span>Due {statement.due_date}</span>
                <StatusBadge tone={Number(statement.remaining_amount) <= 0 ? 'success' : statement.due_date < new Date().toISOString().slice(0, 10) ? 'danger' : 'warning'}>
                  {Number(statement.remaining_amount) <= 0 ? 'Paid' : statement.due_date < new Date().toISOString().slice(0, 10) ? 'Overdue' : statement.status.replace('_', ' ')}
                </StatusBadge>
              </div>
            </div>
            <div>
              <strong>{money(statement.remaining_amount)} remaining</strong>
              <p>{money(statement.paid_amount)} paid of {money(statement.amount_due)}</p>
              <div className="statement-actions">
                <Button variant="secondary" size="small" onClick={() => editStatement(statement)}>
                  Correct
                </Button>
                <ConfirmButton
                  variant="danger"
                  size="small"
                  title="Remove statement?"
                  message="This statement will be removed permanently."
                  confirmLabel="Remove"
                  onConfirm={() => removeStatement(statement)}
                >
                  Remove
                </ConfirmButton>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
