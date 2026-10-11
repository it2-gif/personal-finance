import { useEffect, useState } from 'react'
import { apiRequest } from '../../api'
import ConfirmButton from '../UI/ConfirmButton'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import EmptyState from '../UI/EmptyState'
import StatusBadge from '../UI/StatusBadge'
import ProgressBar from '../UI/ProgressBar'
import ActionMenu from '../UI/ActionMenu'
import Skeleton from '../UI/Skeleton'
import AccountDetailsDialog from './AccountDetailsDialog'
import './AccountBalances.css'

function formatMoney(amount, currency) {
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency,
  }).format(Number(amount))
}

export default function AccountBalances({
  refreshKey = 0,
  onChanged,
}) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [viewingAccount, setViewingAccount] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [archivingId, setArchivingId] = useState(null)

  useEffect(() => {
    let active = true

    async function loadBalances() {
      setLoading(true)
      setError('')

      try {
        const data = await apiRequest('/accounts/balances')
        if (active) setAccounts(data)
      } catch {
        if (active) {
          setError('Could not load your balances. Try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadBalances()

    return () => {
      active = false
    }
  }, [refreshKey, reloadKey])

  function startEdit(account) {
  if (saving || editingId !== null) return

  setEditingId(account.id)
  setDraft({
    name: account.name,
    account_type: account.account_type,
    currency: account.currency,
    opening_balance: account.opening_balance,
    credit_limit: account.credit_limit,
    default_payment_account_id: account.default_payment_account_id,
  })
  setEditError('')
}

  function cancelEdit() {
    setEditingId(null)
    setDraft(null)
    setEditError('')
  }

  async function archiveAccount(account) {
    setArchivingId(account.id)
    setError('')
    try {
      await apiRequest(`/accounts/${account.id}/archive`, { method: 'POST' })
      onChanged?.()
    } catch (requestError) {
      setError(requestError.message || 'Could not archive this account.')
    } finally {
      setArchivingId(null)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    if (saving) return

    setEditError('')

    if (!draft.name.trim()) {
      setEditError('Enter an account name.')
      return
    }

    setSaving(true)

    try {
      await apiRequest(`/accounts/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...draft,
          name: draft.name.trim(),
        }),
      })
    } catch (error) {
      setEditError(
        error.status === 422
          ? 'Check the name and starting amount.'
          : error.status
            ? error.message
            : 'Could not confirm the save. Reload to check before trying again.',
      )
      setSaving(false)
      return
    }

    cancelEdit()
    setSaving(false)

    if (onChanged) {
      onChanged()
    } else {
      setReloadKey((value) => value + 1)
    }
  }

    return (
    <section className="balances-panel" aria-labelledby="balances-heading">
      <h2 id="balances-heading">Your accounts</h2>
      <p>Your money balances and credit card debt.</p>

      {loading && <Skeleton cards={3} lines={0} label="Loading account balances" />}

      <Toast message={error} type="error" onClose={() => setError('')} />
      {error && (
        <div className="inline-retry">
          <Button
            variant="secondary"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && accounts.length === 0 && (
        <EmptyState title="No accounts yet" description="Add your first account to start tracking balances." icon="◫" />
      )}

      {!loading && !error && (
        <ul className="balances-list">
          {accounts.map((account) => (
            <li className="balance-card" key={account.id}>
              {editingId === account.id && draft ? (
                <form className="balance-edit" onSubmit={handleSave}>
                  <h3>Edit account</h3>

                  <Toast message={editError} type="error" onClose={() => setEditError('')} />

                  <fieldset disabled={saving}>
                    <label htmlFor={`account-name-${account.id}`}>
                      Account name
                    </label>
                    <input
                      id={`account-name-${account.id}`}
                      type="text"
                      maxLength={100}
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      required
                    />

                    <label htmlFor={`account-start-${account.id}`}>
                      {draft.account_type === 'credit'
                        ? 'Starting debt (EGP, enter a negative amount)'
                        : 'Starting money (EGP)'}
                    </label>
                    <input
                      id={`account-start-${account.id}`}
                      type="number"
                      inputMode="decimal"
                      min="-999999999999.99"
                      max={
                        draft.account_type === 'credit'
                          ? '0'
                          : '999999999999.99'
                      }
                      step="0.01"
                      value={draft.opening_balance}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          opening_balance: event.target.value,
                        }))
                      }
                      aria-describedby={`account-help-${account.id}`}
                      required
                    />

                    <p
                      id={`account-help-${account.id}`}
                      className="balance-start"
                    >
                      {draft.account_type === 'credit'
                        ? 'Debt before your saved entries. Enter -2000 if you owed EGP 2,000. Use 0 if you owed nothing.'
                        : 'Money you had before your saved entries. Changing it changes your balance, not your income.'}
                    </p>

                    {draft.account_type === 'credit' && (
                      <>
                        <label htmlFor={`account-limit-${account.id}`}>
                          Credit limit (EGP)
                        </label>
                        <input
                          id={`account-limit-${account.id}`}
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          max="999999999999.99"
                          step="0.01"
                          value={draft.credit_limit ?? ''}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              credit_limit: event.target.value,
                            }))
                          }
                          required
                        />

                        <label htmlFor={`account-payment-${account.id}`}>
                          Default payment account
                        </label>
                        <select
                          id={`account-payment-${account.id}`}
                          value={draft.default_payment_account_id ?? ''}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              default_payment_account_id:
                                event.target.value
                                  ? Number(event.target.value)
                                  : null,
                            }))
                          }
                        >
                          <option value="">Choose when paying</option>
                          {accounts
                            .filter((item) => item.account_type === 'bank')
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </>
                    )}

                    <div className="balance-edit-buttons">
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
                  <div className="balance-card-header">
                    <span className="account-type-icon" aria-hidden="true">
                      {account.account_type === 'credit' ? '◆' : account.account_type === 'bank' ? '▤' : '●'}
                    </span>
                    <div>
                      <h3>{account.name}</h3>
                      <StatusBadge tone={account.account_type === 'credit' ? 'warning' : 'info'}>
                        {account.account_type === 'credit' ? 'Credit card' : account.account_type === 'bank' ? 'Bank account' : 'Cash'}
                      </StatusBadge>
                    </div>
                  </div>

                  {account.account_type === 'credit' ? (
                    <>
                      <p className="balance-start">Amount owed</p>
                      <p className="balance-value">
                        {formatMoney(account.amount_owed, account.currency)}
                      </p>

                      <ProgressBar value={account.amount_owed} max={account.credit_limit} label={`${account.name} credit used`} />

                      <p className="balance-start">
                        Available credit:{' '}
                        {formatMoney(
                          account.available_credit,
                          account.currency,
                        )}
                      </p>

                      <p className="balance-start">
                        Credit limit:{' '}
                        {formatMoney(account.credit_limit, account.currency)}
                      </p>

                      <p className="balance-start">
                        Default payment:{' '}
                        {accounts.find(
                          (item) =>
                            item.id === account.default_payment_account_id,
                        )?.name || 'Choose when paying'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="balance-value">
                        {formatMoney(account.balance, account.currency)}
                      </p>

                      <p className="balance-start">
                        Starting money:{' '}
                        {formatMoney(
                          account.opening_balance,
                          account.currency,
                        )}
                      </p>
                    </>
                  )}

                  <div className="balance-card-actions">
                    <Button variant="ghost" size="small" onClick={() => setViewingAccount(account)}>View details</Button>
                    <ActionMenu label={`More actions for ${account.name}`}>
                      <Button variant="ghost" size="small" onClick={() => startEdit(account)} disabled={saving || editingId !== null} aria-label={`Edit ${account.name}`}>Edit account</Button>
                      <ConfirmButton variant="ghost" size="small" className="archive-action" title={`Archive ${account.name}?`} message="The account will be hidden, but its history will be kept." confirmLabel="Archive" onConfirm={() => archiveAccount(account)} disabled={archivingId !== null || editingId !== null}>
                        {archivingId === account.id ? 'Archiving…' : 'Archive account'}
                      </ConfirmButton>
                    </ActionMenu>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {viewingAccount && <AccountDetailsDialog account={viewingAccount} paymentAccountName={accounts.find((item) => item.id === viewingAccount.default_payment_account_id)?.name} onClose={() => setViewingAccount(null)} />}
    </section>
  )
}
