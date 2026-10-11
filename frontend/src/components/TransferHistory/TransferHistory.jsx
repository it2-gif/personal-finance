import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../api'
import ConfirmButton from '../UI/ConfirmButton'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import EmptyState from '../UI/EmptyState'
import StatusBadge from '../UI/StatusBadge'
import './TransferHistory.css'

const PAGE_SIZE = 10

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

export default function TransferHistory({ refreshKey = 0, onChanged }) {
  const [transfers, setTransfers] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [moreError, setMoreError] = useState('')
  const [accountsError, setAccountsError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [reversingId, setReversingId] = useState(null)

  const versionRef = useRef(0)
  const moreBusy = useRef(false)

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
            'Account names could not load. Account numbers are shown instead.',
          )
        }
      }
    }

    loadAccounts()

    return () => {
      active = false
    }
  }, [refreshKey, reloadKey])

  useEffect(() => {
    let active = true
    versionRef.current += 1
    moreBusy.current = false

    async function loadTransfers() {
      setLoading(true)
      setLoadingMore(false)
      setError('')
      setMoreError('')
      setHasMore(false)

      try {
        const data = await apiRequest(
          `/transfers?limit=${PAGE_SIZE}&offset=0`,
        )

        if (active) {
          setTransfers(data)
          setNextOffset(data.length)
          setHasMore(data.length === PAGE_SIZE)
        }
      } catch {
        if (active) {
          setError('Could not load transfers. Try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadTransfers()

    return () => {
      active = false
      versionRef.current += 1
    }
  }, [refreshKey, reloadKey])

  async function loadMore() {
    if (moreBusy.current || loading || !hasMore) return

    moreBusy.current = true
    setLoadingMore(true)
    setMoreError('')

    const version = versionRef.current

    try {
      const data = await apiRequest(
        `/transfers?limit=${PAGE_SIZE}&offset=${nextOffset}`,
      )

      if (version !== versionRef.current) return

      setTransfers((current) => {
        const existingIds = new Set(current.map((entry) => entry.id))

        return [
          ...current,
          ...data.filter((entry) => !existingIds.has(entry.id)),
        ]
      })

      setNextOffset(nextOffset + data.length)
      setHasMore(data.length === PAGE_SIZE)
    } catch {
      if (version === versionRef.current) {
        setMoreError('Could not load more transfers. Try again.')
      }
    } finally {
      if (version === versionRef.current) {
        moreBusy.current = false
        setLoadingMore(false)
      }
    }
  }

  function accountName(id) {
    return (
      accounts.find((account) => account.id === id)?.name ||
      `Account ${id}`
    )
  }

  async function reverseTransfer(transfer) {
    setReversingId(transfer.id)
    setError('')
    try {
      await apiRequest(`/transfers/${transfer.id}/reverse`, { method: 'POST' })
      onChanged?.()
    } catch (requestError) {
      setError(requestError.message || 'Could not reverse this transfer.')
    } finally {
      setReversingId(null)
    }
  }

  return (
    <section
      className="transfer-history-panel"
      aria-labelledby="transfer-history-heading"
    >
      <h2 id="transfer-history-heading">Your transfers</h2>
      <p>Account transfers and credit card payments.</p>

      {loading && <p role="status">Loading transfers…</p>}

      <Toast
        message={accountsError || error || moreError}
        type="error"
        onClose={() => {
          setAccountsError('')
          setError('')
          setMoreError('')
        }}
      />

      {error && (
        <div>
          <Button
            variant="secondary"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && transfers.length === 0 && (
        <EmptyState title="No transfers yet" description="Transfers and card payments will appear here." icon="⇄" />
      )}

      {!loading && !error && transfers.length > 0 && (
        <>
          <ul className="transfer-history-list">
            {transfers.map((transfer) => (
              <li className="transfer-history-item" key={transfer.id}>
                <div className="transfer-history-details">
                  <h3>
                    {accountName(transfer.from_account_id)}
                    {' → '}
                    {accountName(transfer.to_account_id)}
                  </h3>

                  <p>
                    <time dateTime={transfer.date}>
                      {formatDate(transfer.date)}
                    </time>
                  </p>

                  {transfer.description && (
                    <p>{transfer.description}</p>
                  )}
                  {transfer.reversed_at && <StatusBadge tone="neutral">Reversed</StatusBadge>}
                </div>

                <strong className="transfer-history-amount">
                  {formatMoney(transfer.amount)}
                </strong>
                <ConfirmButton
                  variant="danger"
                  size="small"
                  title="Reverse transfer?"
                  message="The balances will be restored and the transfer history will be kept."
                  confirmLabel="Reverse"
                  onConfirm={() => reverseTransfer(transfer)}
                  disabled={reversingId !== null || transfer.reversed_at !== null}
                >
                  {reversingId === transfer.id
                    ? 'Reversing…'
                    : transfer.reversed_at
                      ? 'Reversed'
                      : 'Reverse'}
                </ConfirmButton>
              </li>
            ))}
          </ul>

          <div className="transfer-history-pagination">
            <p role="status">
              Showing {transfers.length} transfers.
            </p>


            {hasMore ? (
              <Button
                variant="secondary"
                onClick={loadMore}
                loading={loadingMore}
              >
                {moreError
                    ? 'Try again'
                    : 'Load more'}
              </Button>
            ) : (
              <p>No more transfers.</p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
