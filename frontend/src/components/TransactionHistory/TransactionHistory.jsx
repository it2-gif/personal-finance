import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../api'
import ConfirmButton from '../UI/ConfirmButton'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import EmptyState from '../UI/EmptyState'
import StatusBadge from '../UI/StatusBadge'
import Skeleton from '../UI/Skeleton'
import './TransactionHistory.css'

const PAGE_SIZE = 10

const kindLabels = {
  regular: null,
  card_purchase: 'Card purchase',
  card_refund: 'Card refund',
  card_fee: 'Card fee',
  card_interest: 'Card interest',
}

const emptyFilters = {
  account_id: '',
  type: '',
  start_date: '',
  end_date: '',
}


function formatMoney(amount) {
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
  }).format(Number(amount))
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

export default function TransactionHistory({
  refreshKey = 0,
  onChanged,
}) {
  const [filters, setFilters] = useState({ ...emptyFilters })
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accountsError, setAccountsError] = useState('')
  const [filterError, setFilterError] = useState('')
  const [appliedFilters, setAppliedFilters] = useState({})
  const [reloadKey, setReloadKey] = useState(0)
  const [deletingId, setDeletingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)

  const historyVersion = useRef(0)
  const moreBusy = useRef(false)
  const mutationBusy = useRef(false)
  const busy = saving || deletingId !== null
  const filtersLocked = busy || editingId !== null
  const actionsLocked = filtersLocked || loading || loadingMore
  
  useEffect(() => {
    let active = true

    async function loadAccounts() {
      setAccountsError('')

      try {
        const data = await apiRequest('/accounts?include_archived=true')
        if (active) setAccounts(data)
      } catch {
        if (active) {
          setAccountsError(
            'Could not load account choices. Reload to try again.',
          )
        }
      }
    }

    loadAccounts()

    return () => {
      active = false
    }
  }, [refreshKey])

  useEffect(() => {
    let active = true
    historyVersion.current += 1
    moreBusy.current = false

    async function loadTransactions() {
      setLoading(true)
      setLoadingMore(false)
      setError('')
      setMoreError('')
      setHasMore(false)

      const query = new URLSearchParams(appliedFilters)
      query.set('limit', String(PAGE_SIZE))
      query.set('offset', '0')

      try {
        const data = await apiRequest(`/transactions?${query}`)

        if (active) {
          setTransactions(data)
          setNextOffset(data.length)
          setHasMore(data.length === PAGE_SIZE)
        }
      } catch {
        if (active) {
          setError('Could not load your history. Reload to try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadTransactions()

    return () => {
      active = false
      historyVersion.current += 1
    }
  }, [refreshKey, appliedFilters, reloadKey])

  async function loadMore() {
    if (
      moreBusy.current ||
      mutationBusy.current ||
      loading ||
      filtersLocked ||
      !hasMore
    ) {
      return
    }

    moreBusy.current = true
    setLoadingMore(true)
    setMoreError('')

    const version = historyVersion.current
    const query = new URLSearchParams(appliedFilters)
    query.set('limit', String(PAGE_SIZE))
    query.set('offset', String(nextOffset))

    try {
      const data = await apiRequest(`/transactions?${query}`)

      if (version !== historyVersion.current) return

      setTransactions((current) => {
        const existingIds = new Set(current.map((entry) => entry.id))

        return [
          ...current,
          ...data.filter((entry) => !existingIds.has(entry.id)),
        ]
      })

      setNextOffset(nextOffset + data.length)
      setHasMore(data.length === PAGE_SIZE)
    } catch {
      if (version === historyVersion.current) {
        setMoreError('Could not load more entries. Try again.')
      }
    } finally {
      if (version === historyVersion.current) {
        moreBusy.current = false
        setLoadingMore(false)
      }
    }
  }

  function changeFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }))
    setFilterError('')
  }

  function applyFilters(event) {
    event.preventDefault()
    if (actionsLocked || moreBusy.current) return

    if (
      filters.start_date &&
      filters.end_date &&
      filters.start_date > filters.end_date
    ) {
      setFilterError('From date must be before or equal to To date.')
      return
    }

    setFilterError('')

    setAppliedFilters(
      Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== ''),
      ),
    )
  }

  function clearFilters() {
    if (actionsLocked || moreBusy.current) return

    setFilters({ ...emptyFilters })
    setAppliedFilters({})
    setFilterError('')
  }

  function refreshAfterChange() {
    setReloadKey((value) => value + 1)
    onChanged?.()
  }

  function startEdit(transaction) {
    if (
      actionsLocked ||
      moreBusy.current ||
      mutationBusy.current
    ) {
      return
    }

    setEditingId(transaction.id)
    setEditError('')
    setDraft({
      account_id: transaction.account_id,
      type: transaction.type,
      kind: transaction.kind,
      amount: transaction.amount,
      date: transaction.date,
      category: transaction.category,
      description: transaction.description || '',
    })
  }

  function cancelEdit() {
    if (mutationBusy.current) return

    setEditingId(null)
    setDraft(null)
    setEditError('')
  }

  function changeDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function handleSave(event) {
    event.preventDefault()

    if (mutationBusy.current || moreBusy.current || !draft) return

    setEditError('')

    if (!draft.category.trim()) {
      setEditError('Enter a category.')
      return
    }

    mutationBusy.current = true
    setSaving(true)

    try {
      await apiRequest(`/transactions/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...draft,
          category: draft.category.trim(),
          description: draft.description.trim() || null,
        }),
      })
    } catch (requestError) {
      setEditError(
        requestError.status === 422
          ? 'Check the fields. Use an amount with up to two decimal places.'
          : requestError.status
            ? requestError.message
            : 'Save not confirmed. Reload to check before trying again.',
      )

      mutationBusy.current = false
      setSaving(false)
      return
    }

    mutationBusy.current = false
    setSaving(false)
    cancelEdit()
    refreshAfterChange()
  }

  async function handleDelete(transaction) {
    if (
      actionsLocked ||
      moreBusy.current ||
      mutationBusy.current
    ) {
      return
    }

    mutationBusy.current = true
    setDeletingId(transaction.id)
    setError('')

    try {
      await apiRequest(`/transactions/${transaction.id}`, {
        method: 'DELETE',
      })
    } catch {
      setError(
        'Deletion not confirmed. Reload to check before trying again.',
      )

      mutationBusy.current = false
      setDeletingId(null)
      return
    }

    setTransactions((current) =>
      current.filter((entry) => entry.id !== transaction.id),
    )

    mutationBusy.current = false
    setDeletingId(null)
    refreshAfterChange()
  }

  return (
    <section className="history-panel" aria-labelledby="history-heading">
      <h2 id="history-heading">Your history</h2>

      <p className="history-note">
        Your entries, newest first. Load 10 at a time.
      </p>

            <form className="history-filters" onSubmit={applyFilters}>
              <fieldset disabled={actionsLocked}>
                  <div className="history-filter-fields">
        <div>
          <label htmlFor="history-search">Search</label>
          <input
            id="history-search"
            type="search"
            placeholder="Category or note"
            maxLength={100}
            value={filters.search}
            onChange={(event) =>
              changeFilter('search', event.target.value)
            }
          />
        </div>

        <div>
          <label htmlFor="history-account">Account</label>
          <select
            id="history-account"
            value={filters.account_id}
            onChange={(event) =>
              changeFilter('account_id', event.target.value)
            }
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="history-type">Type</label>
          <select
            id="history-type"
            value={filters.type}
            onChange={(event) =>
              changeFilter('type', event.target.value)
            }
          >
            <option value="">Money in and out</option>
            <option value="income">Money in</option>
            <option value="expense">Money out</option>
          </select>
        </div>

        <div>
          <label htmlFor="history-from">From date</label>
          <input
            id="history-from"
            type="date"
            value={filters.start_date}
            onChange={(event) =>
              changeFilter('start_date', event.target.value)
            }
          />
        </div>

        <div>
          <label htmlFor="history-to">To date</label>
          <input
            id="history-to"
            type="date"
            value={filters.end_date}
            onChange={(event) =>
              changeFilter('end_date', event.target.value)
            }
          />
        </div>
      </div>

          <div className="history-buttons">
            <Button type="submit">Apply filters</Button>
            <Button
              variant="secondary"
              onClick={clearFilters}
            >
              Clear
            </Button>
          </div>
        </fieldset>

      </form>

      {loading && <Skeleton lines={5} label="Loading transaction history" />}
      <Toast
        message={editError || filterError || accountsError || moreError || error}
        type="error"
        onClose={() => {
          setEditError('')
          setFilterError('')
          setAccountsError('')
          setMoreError('')
          setError('')
        }}
      />

      {!loading && !error && transactions.length === 0 && (
        <EmptyState title="No entries found" description="Try different filters or add a new entry." icon="↕" />
      )}

      {!loading && !error && transactions.length > 0 && (
        <>
          <ul className="history-list">
            {transactions.map((transaction) => (
              <li className="history-item" key={transaction.id}>
                {editingId === transaction.id && draft ? (
                  <form className="history-edit" onSubmit={handleSave}>
                    <h3>Edit entry</h3>


                    <fieldset disabled={busy}>
                      <label htmlFor={`type-${transaction.id}`}>
                        Type
                      </label>
                      <select
                        id={`type-${transaction.id}`}
                        value={draft.type}
                        onChange={(event) =>
                          changeDraft('type', event.target.value)
                        }
                      >
                        <option value="expense">Money out</option>
                        <option value="income">Money in</option>
                      </select>

                      <label htmlFor={`amount-${transaction.id}`}>
                        Amount (EGP)
                      </label>
                      <input
                        id={`amount-${transaction.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        max="999999999999.99"
                        step="0.01"
                        value={draft.amount}
                        onChange={(event) =>
                          changeDraft('amount', event.target.value)
                        }
                        required
                      />

                      <label htmlFor={`date-${transaction.id}`}>
                        Date
                      </label>
                      <input
                        id={`date-${transaction.id}`}
                        type="date"
                        value={draft.date}
                        onChange={(event) =>
                          changeDraft('date', event.target.value)
                        }
                        required
                      />

                      <label htmlFor={`category-${transaction.id}`}>
                        Category
                      </label>
                      <input
                        id={`category-${transaction.id}`}
                        type="text"
                        maxLength={100}
                        value={draft.category}
                        onChange={(event) =>
                          changeDraft('category', event.target.value)
                        }
                        required
                      />

                      <label htmlFor={`note-${transaction.id}`}>
                        Note (optional)
                      </label>
                      <input
                        id={`note-${transaction.id}`}
                        type="text"
                        maxLength={500}
                        value={draft.description}
                        onChange={(event) =>
                          changeDraft('description', event.target.value)
                        }
                      />

                      <div className="history-edit-buttons">
                        <Button type="submit" loading={saving}>Save changes</Button>
                        <Button
                          variant="secondary"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </Button>
                      </div>
                    </fieldset>
                  </form>
                ) : (
                  <>
                    <div className="history-details">
                      <h3>{transaction.category}</h3>

                      <div className="history-badges">
                        <StatusBadge tone={transaction.type === 'income' ? 'success' : 'danger'}>{transaction.type}</StatusBadge>
                        {transaction.kind && transaction.kind !== 'regular' && <StatusBadge tone="info">{transaction.kind.replaceAll('_', ' ')}</StatusBadge>}
                      </div>
                      {transaction.reversed_at && <StatusBadge tone="neutral">Reversed</StatusBadge>}

                      <p>
                        <time dateTime={transaction.date}>
                          {formatDate(transaction.date)}
                        </time>
                        {' · '}
                        {kindLabels[transaction.kind] ||
                          (transaction.type === 'income'
                            ? 'Money in'
                            : 'Money out')}
                      </p>

                      <p>
                        {accounts.find(
                          (account) =>
                            account.id === transaction.account_id,
                        )?.name || `Account ${transaction.account_id}`}
                      </p>

                      {transaction.description && (
                        <p className="history-description">
                          {transaction.description}
                        </p>
                      )}
                    </div>

                    <div className="history-actions">
                      <strong
                        className={`history-amount ${transaction.type}`}
                      >
                        {transaction.type === 'income' ? '+' : '−'}
                        {formatMoney(transaction.amount)}
                      </strong>

                      <div className="history-buttons">
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => startEdit(transaction)}
                          disabled={
                            actionsLocked ||
                            transaction.reversed_at !== null ||
                            transaction.kind !== 'regular'
                          }
                          aria-label={`Edit ${transaction.category}`}
                        >
                          Edit
                        </Button>

                        <ConfirmButton
                          variant="danger"
                          size="small"
                          className="history-delete"
                          title="Reverse entry?"
                          message={`${transaction.category}, ${formatMoney(transaction.amount)} will be reversed. Its history will be kept.`}
                          confirmLabel="Reverse"
                          onConfirm={() => handleDelete(transaction)}
                          disabled={actionsLocked || transaction.reversed_at !== null}
                          aria-label={`Delete ${transaction.category}`}
                        >
                          {deletingId === transaction.id
                            ? 'Reversing…'
                            : transaction.reversed_at
                              ? 'Reversed'
                              : 'Reverse'}
                        </ConfirmButton>
                      </div>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="history-pagination">
            <p role="status">
              Showing {transactions.length} entries.
            </p>


            {hasMore ? (
              <Button
                variant="secondary"
                onClick={loadMore}
                loading={loadingMore}
                disabled={filtersLocked}
              >
                {moreError
                    ? 'Try again'
                    : 'Load more'}
              </Button>
            ) : (
              <p>No more entries.</p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
