import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../api'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import './TransferForm.css'

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

function storageKey(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Missing user ID')
  }

  return `personal-finance:pending-transfer:${userId}`
}

function restorePending(userId) {
  try {
    const stored = localStorage.getItem(storageKey(userId))

    if (!stored) return { entry: null, failed: false }

    const entry = JSON.parse(stored)
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (
      !entry ||
      typeof entry !== 'object' ||
      !uuidPattern.test(entry.request_id) ||
      !Number.isInteger(entry.from_account_id) ||
      entry.from_account_id <= 0 ||
      !Number.isInteger(entry.to_account_id) ||
      entry.to_account_id <= 0 ||
      entry.from_account_id === entry.to_account_id ||
      typeof entry.amount !== 'string' ||
      typeof entry.date !== 'string' ||
      !(
        entry.description === null ||
        typeof entry.description === 'string'
      )
    ) {
      throw new Error('Invalid pending transfer')
    }

    return {
      entry: {
        request_id: entry.request_id,
        from_account_id: entry.from_account_id,
        to_account_id: entry.to_account_id,
        amount: entry.amount,
        date: entry.date,
        description: entry.description,
      },
      failed: false,
    }
  } catch {
    return { entry: null, failed: true }
  }
}

export default function TransferForm({
  userId,
  refreshKey = 0,
  onSaved,
}) {
  const [restored] = useState(() => restorePending(userId))
  const [accounts, setAccounts] = useState([])
  const [fromId, setFromId] = useState(
    restored.entry ? String(restored.entry.from_account_id) : '',
  )
  const [toId, setToId] = useState(
    restored.entry ? String(restored.entry.to_account_id) : '',
  )
  const [amount, setAmount] = useState(restored.entry?.amount ?? '')
  const [date, setDate] = useState(
    restored.entry?.date ?? todayInCairo(),
  )
  const [description, setDescription] = useState(
    restored.entry?.description ?? '',
  )
  const [loading, setLoading] = useState(true)
  const [accountsError, setAccountsError] = useState('')
  const [error, setError] = useState(
    restored.failed
      ? 'Could not read an unfinished transfer. Saving is paused. Check your transfer history before clearing browser data.'
      : '',
  )
  const [message, setMessage] = useState(
    restored.entry
      ? 'Unfinished transfer found. Press Retry transfer to confirm it.'
      : '',
  )
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState(restored.entry)
  const [storageBlocked, setStorageBlocked] = useState(restored.failed)

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
          if (!restored.entry) {
            const preferred = localStorage.getItem('personal-finance:default-account')
            const validSource = data.find((account) => String(account.id) === preferred && account.account_type !== 'credit')
            setFromId((current) => current || (validSource ? preferred : ''))
          }
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
  }, [refreshKey, restored.entry])

  const sourceAccounts = accounts.filter(
    (account) => account.account_type !== 'credit',
  )

  const source = accounts.find(
    (account) => String(account.id) === fromId,
  )

  const destinationAccounts = accounts.filter(
    (account) =>
      String(account.id) !== fromId &&
      (!source || account.currency === source.currency),
  )

  const sourceMissing =
    pending &&
    !sourceAccounts.some((account) => String(account.id) === fromId)

  const destinationMissing =
    pending &&
    !destinationAccounts.some((account) => String(account.id) === toId)

  async function handleSubmit(event) {
    event.preventDefault()
    if (savingRef.current || storageBlocked) return

    setError('')
    setMessage('')

    let request = pending

    if (!request) {
      const destination = accounts.find(
        (account) => String(account.id) === toId,
      )

      if (!source || source.account_type === 'credit') {
        setError('Choose Cash or Bank as the source.')
        return
      }

      if (!destination || source.id === destination.id) {
        setError('Choose a different destination account.')
        return
      }

      if (source.currency !== destination.currency) {
        setError('Both accounts must use the same currency.')
        return
      }

      if (!globalThis.crypto?.randomUUID) {
        setError('Open the app using localhost or HTTPS.')
        return
      }

      request = {
        request_id: globalThis.crypto.randomUUID(),
        from_account_id: source.id,
        to_account_id: destination.id,
        amount,
        date,
        description: description.trim() || null,
      }
    }

    // Store the exact request before sending it.
    try {
      localStorage.setItem(
        storageKey(userId),
        JSON.stringify(request),
      )
    } catch {
      setError(
        'Could not store this transfer on your device. Nothing was sent. Allow browser storage and try again.',
      )
      return
    }

    setPending(request)
    savingRef.current = true
    setSaving(true)

    try {
      await apiRequest('/transfers', {
        method: 'POST',
        body: JSON.stringify(request),
      })
    } catch (requestError) {
      const canCorrect =
        requestError.status === 404 ||
        requestError.status === 422

      if (canCorrect) {
        try {
          localStorage.removeItem(storageKey(userId))
          setPending(null)
          setError(requestError.message)
        } catch {
          setStorageBlocked(true)
          setError(
            'Transfer rejected, but its device copy could not be cleared. Saving is paused. Reload to try again.',
          )
        }
      } else {
        setError(
          requestError.status === 409
            ? 'This save needs checking. Check your transfer history before adding another transfer.'
            : requestError.status === 401
              ? 'Please sign in again. Your unfinished transfer is stored on this device.'
              : 'Save not confirmed. Press Retry transfer when connected. The same save ID will be used.',
        )
      }

      savingRef.current = false
      setSaving(false)
      return
    }

    try {
      localStorage.removeItem(storageKey(userId))
    } catch {
      setError(
        'Transfer saved, but its device copy could not be cleared. Press Retry transfer to confirm and clear it.',
      )
      savingRef.current = false
      setSaving(false)
      onSaved?.()
      return
    }

    setPending(null)
    setAmount('')
    setDescription('')
    setMessage('Transfer saved.')
    savingRef.current = false
    setSaving(false)
    onSaved?.()
  }

  return (
    <section
      className="transfer-panel"
      aria-labelledby="transfer-heading"
    >
      <h2 id="transfer-heading">Transfer or pay a card</h2>
      <p>
        Move money between accounts or pay a credit card.
        This does not count as income or spending.
      </p>

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

      {!loading &&
        !accountsError &&
        !pending &&
        accounts.length < 2 && (
          <p>Add at least two accounts to make a transfer.</p>
        )}

      {(accounts.length >= 2 || pending) && (
        <form onSubmit={handleSubmit} aria-busy={saving}>
          <fieldset
            disabled={
              saving ||
              pending !== null ||
              loading ||
              storageBlocked
            }
          >
            <label htmlFor="transfer-from">From account</label>
            <select
              id="transfer-from"
              value={fromId}
              onChange={(event) => {
                setFromId(event.target.value)
                setToId('')
                setMessage('')
              }}
              required
            >
              <option value="">Choose Cash or Bank</option>

              {sourceMissing && (
                <option value={fromId}>
                  Saved account {fromId}
                </option>
              )}

              {sourceAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>

            <label htmlFor="transfer-to">To account</label>
            <select
              id="transfer-to"
              value={toId}
              onChange={(event) => {
                const nextId = event.target.value
                const destination = accounts.find(
                  (account) => String(account.id) === nextId,
                )
                setToId(nextId)
                if (
                  destination?.account_type === 'credit' &&
                  destination.default_payment_account_id
                ) {
                  setFromId(String(destination.default_payment_account_id))
                }
              }}
              required
            >
              <option value="">Choose an account</option>

              {destinationMissing && (
                <option value={toId}>
                  Saved account {toId}
                </option>
              )}

              {destinationAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.account_type === 'credit'
                    ? ' — Card payment'
                    : ''}
                </option>
              ))}
            </select>

            <label htmlFor="transfer-amount">Amount (EGP)</label>
            <input
              id="transfer-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              max="999999999999.99"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />

            <label htmlFor="transfer-date">Date</label>
            <input
              id="transfer-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />

            <label htmlFor="transfer-note">Note (optional)</label>
            <input
              id="transfer-note"
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
            {pending
                ? 'Retry transfer'
                : 'Save transfer'}
          </Button>
        </form>
      )}
    </section>
  )
}
