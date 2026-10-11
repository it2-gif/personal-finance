import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../api'
import { readPending, writePending, clearPending } from './pendingStorage'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import './TransactionForm.css'

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

function restoreEntry(userId) {
  try {
    return { entry: readPending(userId), failed: false }
  } catch {
    return { entry: null, failed: true }
  }
}

export default function TransactionForm({
  userId,
  onSaved,
  refreshKey = 0,
}) {
  const [restored] = useState(() => restoreEntry(userId))
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState(
    restored.entry ? String(restored.entry.account_id) : '',
  )
  const [type, setType] = useState(restored.entry?.type || 'expense')
  const [kind, setKind] = useState(restored.entry?.kind || 'regular')
  const [amount, setAmount] = useState(restored.entry?.amount || '')
  const [date, setDate] = useState(
    () => restored.entry?.date || todayInCairo(),
  )
  const [category, setCategory] = useState(restored.entry?.category || '')
  const [description, setDescription] = useState(
    restored.entry?.description || '',
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState(restored.entry)
  const [storageBlocked, setStorageBlocked] = useState(restored.failed)
  const [error, setError] = useState(
    restored.failed
      ? 'Could not read your saved entry. Saving is paused. Check browser storage and reload.'
      : '',
  )
  const [accountsError, setAccountsError] = useState('')
  const [message, setMessage] = useState(
    restored.entry
      ? 'An unfinished save was found. Press Retry save to check and finish it.'
      : '',
  )

  const savingRef = useRef(false)

  useEffect(() => {
    let active = true

    async function loadAccounts() {
      setLoading(true)
      setAccountsError('')

      try {
        const data = await apiRequest('/accounts')

        if (active) {
          setAccounts(data)
          setAccountId((current) => {
            // Keep the account from a restored pending save.
            if (restored.entry && current === String(restored.entry.account_id)) {
              return current
            }

            const preferred = localStorage.getItem('personal-finance:default-account')
            return data.some((account) => String(account.id) === current)
              ? current
              : data.some((account) => String(account.id) === preferred)
                ? preferred
              : data.length
                ? String(data[0].id)
                : ''
          })
        }
      } catch {
        if (active) {
          setAccountsError('Could not load accounts. Reload to try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadAccounts()

    return () => {
      active = false
    }
  }, [refreshKey, restored])

  async function handleSubmit(event) {
    event.preventDefault()
    if (savingRef.current || storageBlocked) return

    setError('')
    setMessage('')

    let request = pending

    if (!request) {
      if (!category.trim()) {
        setError('Enter a category.')
        return
      }

      if (!accounts.some((account) => String(account.id) === accountId)) {
        setError('Choose an account.')
        return
      }

      if (!globalThis.crypto?.randomUUID) {
        setError('Open the app using localhost or HTTPS to save entries.')
        return
      }

      const selected = accounts.find(
        (account) => String(account.id) === accountId,
      )
      const requestKind =
        selected?.account_type === 'credit'
          ? kind === 'regular'
            ? 'card_purchase'
            : kind
          : 'regular'

      request = {
        request_id: globalThis.crypto.randomUUID(),
        account_id: Number(accountId),
        type:
          requestKind === 'card_refund'
            ? 'income'
            : selected?.account_type === 'credit'
              ? 'expense'
              : type,
        kind: requestKind,
        amount,
        date,
        category: category.trim(),
        description: description.trim() || null,
      }
    }

    // Store the request before sending it to the server.
    try {
      writePending(userId, request)
    } catch {
      setError(
        'Could not store this entry on your device. Nothing was sent. Check browser storage and try again.',
      )
      return
    }

    setPending(request)
    savingRef.current = true
    setSaving(true)

    try {
      await apiRequest('/transactions', {
        method: 'POST',
        body: JSON.stringify(request),
      })
    } catch (error) {
      // These responses reject a new entry before it is saved.
      const canCorrectEntry = [404, 410, 422].includes(error.status)

      if (canCorrectEntry) {
        try {
          clearPending(userId)
          setPending(null)
          setError(error.message)
        } catch {
          setStorageBlocked(true)
          setError(
            'The entry was rejected, but its device copy could not be cleared. Saving is paused. Check browser storage and reload.',
          )
        }
      } else {
        setError(
          error.status === 409
            ? 'This save needs checking. Check your history before making another entry. The saved copy has been kept.'
            : error.status === 401
              ? 'Please log in again. Your unfinished save is kept on this device.'
              : 'Save not confirmed. Press Retry save when connected. The same save ID will be used.',
        )
      }

      savingRef.current = false
      setSaving(false)
      return
    }

    // Only clear the device copy after the server confirms success.
    try {
      clearPending(userId)
    } catch {
      setError(
        'Saved on the server, but the device copy could not be cleared. Do not add it again. Press Retry save to finish.',
      )
      savingRef.current = false
      setSaving(false)
      onSaved?.()
      return
    }

    setPending(null)
    setAmount('')
    setCategory('')
    setDescription('')
    setMessage('Saved.')
    savingRef.current = false
    setSaving(false)
    onSaved?.()
  }

  const pendingAccountMissing =
    pending &&
    !accounts.some((account) => account.id === pending.account_id)
  const selectedAccount = accounts.find(
    (account) => String(account.id) === accountId,
  )
  const displayedKind =
    selectedAccount?.account_type === 'credit' && kind === 'regular'
      ? 'card_purchase'
      : kind

  return (
    <section className="transaction-panel" aria-labelledby="add-heading">
      <h2 id="add-heading">Add money in or out</h2>

      {loading && <p role="status">Loading accounts…</p>}
      <Toast
        message={accountsError || error}
        type="error"
        onClose={() => {
          setAccountsError('')
          setError('')
        }}
      />
      <Toast message={message} type="success" onClose={() => setMessage('')} />

      {!loading && accounts.length === 0 && !accountsError && !pending && (
        <p>Create an account before adding money.</p>
      )}

      {(accounts.length > 0 || pending) && (
        <form onSubmit={handleSubmit} aria-busy={saving}>
          <fieldset
            disabled={
              saving || pending !== null || loading || storageBlocked
            }
          >
            <label htmlFor="transaction-account">Account</label>
            <select
              id="transaction-account"
              value={accountId}
              onChange={(event) => {
                const nextId = event.target.value
                const nextAccount = accounts.find(
                  (account) => String(account.id) === nextId,
                )
                setAccountId(nextId)
                if (nextAccount?.account_type === 'credit') {
                  setType('expense')
                  setKind('card_purchase')
                } else {
                  setType('expense')
                  setKind('regular')
                }
              }}
              required
            >
              {pendingAccountMissing && (
                <option value={pending.account_id}>
                  Saved account #{pending.account_id}
                </option>
              )}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>

            {selectedAccount?.account_type === 'credit' ? (
              <>
                <label htmlFor="transaction-card-action">Card action</label>
                <select
                  id="transaction-card-action"
                  value={displayedKind}
                  onChange={(event) => {
                    const nextKind = event.target.value
                    setKind(nextKind)
                    setType(nextKind === 'card_refund' ? 'income' : 'expense')
                  }}
                >
                  <option value="card_purchase">Purchase</option>
                  <option value="card_refund">Refund</option>
                  <option value="card_fee">Fee</option>
                  <option value="card_interest">Interest</option>
                </select>
              </>
            ) : (
              <>
                <label htmlFor="transaction-type">Type</label>
                <select
                  id="transaction-type"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="expense">Money out</option>
                  <option value="income">Money in</option>
                </select>
              </>
            )}

            <label htmlFor="transaction-amount">Amount (EGP)</label>
            <input
              id="transaction-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              max="999999999999.99"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />

            <label htmlFor="transaction-date">Date</label>
            <input
              id="transaction-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />

            <label htmlFor="transaction-category">Category</label>
            <input
              id="transaction-category"
              type="text"
              placeholder="For example, Food or Salary"
              maxLength={100}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
            />

            <label htmlFor="transaction-note">Note (optional)</label>
            <input
              id="transaction-note"
              type="text"
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </fieldset>

          <Button
            type="submit"
            loading={saving}
            disabled={
              saving ||
              storageBlocked ||
              (!pending && (loading || !!accountsError))
            }
          >
            {pending ? 'Retry save' : 'Save entry'}
          </Button>
        </form>
      )}
    </section>
  )
}
