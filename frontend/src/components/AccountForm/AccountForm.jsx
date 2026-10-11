import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../api'
import {
  clearPendingAccount,
  readPendingAccount,
  writePendingAccount,
} from './pendingStorage'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import './AccountForm.css'

function restoreAccount(userId) {
  try {
    return {
      account: readPendingAccount(userId),
      failed: false,
    }
  } catch {
    return { account: null, failed: true }
  }
}

export default function AccountForm({ userId, onSaved }) {
  const [restored] = useState(() => restoreAccount(userId))
  const [name, setName] = useState(restored.account?.name ?? '')
  const [accountType, setAccountType] = useState(
    restored.account?.account_type ?? 'cash',
  )
  const [openingBalance, setOpeningBalance] = useState(
    restored.account?.account_type === 'credit'
      ? restored.account.opening_balance.replace(/^-/, '')
      : restored.account?.opening_balance ?? '0.00',
  )
  const [creditLimit, setCreditLimit] = useState(
    restored.account?.credit_limit ?? '',
  )
  const [defaultPaymentId, setDefaultPaymentId] = useState(
    restored.account?.default_payment_account_id
      ? String(restored.account.default_payment_account_id)
      : '',
  )
  const [bankAccounts, setBankAccounts] = useState([])
  const [pending, setPending] = useState(restored.account)
  const [storageBlocked, setStorageBlocked] = useState(restored.failed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(
    restored.failed
      ? 'Could not read an unfinished account save. Saving is paused.'
      : '',
  )
  const [message, setMessage] = useState(
    restored.account
      ? 'Unfinished account found. Press Retry account to confirm it.'
      : '',
  )

  const savingRef = useRef(false)

  useEffect(() => {
    let active = true
    apiRequest('/accounts')
      .then((accounts) => {
        if (active) {
          setBankAccounts(
            accounts.filter((account) => account.account_type === 'bank'),
          )
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()

    if (savingRef.current || storageBlocked) return

    setError('')
    setMessage('')

    let request = pending

    if (!request) {
      if (!name.trim()) {
        setError('Enter an account name.')
        return
      }

      if (
        accountType === 'credit' &&
        (!creditLimit || Number(creditLimit) <= 0)
      ) {
        setError('Enter a credit limit greater than zero.')
        return
      }

      if (
        accountType === 'credit' &&
        Number(openingBalance) < 0
      ) {
        setError('Enter the current card debt as a positive amount.')
        return
      }

      if (!globalThis.crypto?.randomUUID) {
        setError('Open the app using localhost or HTTPS.')
        return
      }

      request = {
        request_id: globalThis.crypto.randomUUID(),
        name: name.trim(),
        account_type: accountType,
        currency: 'EGP',
        opening_balance:
          accountType === 'credit' && Number(openingBalance) !== 0
            ? `-${openingBalance}`
            : openingBalance,
        credit_limit: accountType === 'credit' ? creditLimit : null,
        default_payment_account_id:
          accountType === 'credit' && defaultPaymentId
            ? Number(defaultPaymentId)
            : null,
      }
    }

    try {
      writePendingAccount(userId, request)
    } catch {
      setError(
        'Could not store this account on your device. Nothing was sent.',
      )
      return
    }

    setPending(request)
    savingRef.current = true
    setSaving(true)

    try {
      await apiRequest('/accounts', {
        method: 'POST',
        body: JSON.stringify(request),
      })
    } catch (requestError) {
      const canCorrect = [410, 422].includes(requestError.status)

      if (canCorrect) {
        try {
          clearPendingAccount(userId)
          setPending(null)
          setError(
            requestError.status === 422
              ? 'Check the name and starting amount.'
              : requestError.message,
          )
        } catch {
          setStorageBlocked(true)
          setError(
            'The account was rejected, but its device copy could not be cleared. Saving is paused.',
          )
        }
      } else {
        setError(
          requestError.status === 409
            ? 'This account save needs checking. Review your accounts before retrying.'
            : requestError.status === 401
              ? 'Please sign in again. The unfinished account is stored on this device.'
              : 'Save not confirmed. Press Retry account when connected.',
        )
      }

      savingRef.current = false
      setSaving(false)
      return
    }

    try {
      clearPendingAccount(userId)
    } catch {
      setError(
        'Account saved, but its device copy could not be cleared. Press Retry account to confirm it.',
      )
      savingRef.current = false
      setSaving(false)
      onSaved?.()
      return
    }

    setPending(null)
    setName('')
    setAccountType('cash')
    setOpeningBalance('0.00')
    setCreditLimit('')
    setDefaultPaymentId('')
    setMessage('Account added.')
    savingRef.current = false
    setSaving(false)
    onSaved?.()
  }

  return (
    <section
      className="account-form-panel"
      aria-labelledby="account-form-heading"
    >
      <h2 id="account-form-heading">Add an account</h2>
      <p>Add where you keep money or a credit card you use.</p>

      <Toast message={error} type="error" onClose={() => setError('')} />
      <Toast message={message} type="success" onClose={() => setMessage('')} />

      <form onSubmit={handleSubmit} aria-busy={saving}>
        <fieldset disabled={saving || pending !== null || storageBlocked}>
          <label htmlFor="account-name">Account name</label>
          <input
            id="account-name"
            type="text"
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />

          <label htmlFor="account-type">Account type</label>
          <select
            id="account-type"
            value={accountType}
            onChange={(event) => {
              setAccountType(event.target.value)
              setOpeningBalance('0.00')
              setCreditLimit('')
              setDefaultPaymentId('')
              setError('')
            }}
          >
            <option value="cash">Cash or wallet</option>
            <option value="bank">Bank account</option>
            <option value="credit">Credit card</option>
          </select>

          <label htmlFor="account-start">
            {accountType === 'credit'
              ? 'Current card debt (EGP)'
              : 'Starting money (EGP)'}
          </label>
          <input
            id="account-start"
            type="number"
            inputMode="decimal"
            min={accountType === 'credit' ? '0' : '-999999999999.99'}
            max="999999999999.99"
            step="0.01"
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
            aria-describedby="account-start-help"
            required
          />

          <p id="account-start-help" className="account-form-help">
            {accountType === 'credit'
              ? 'Enter how much you currently owe. Use 0 if the card has no debt.'
              : 'Money already in this account. It does not count as income.'}
          </p>

          {accountType === 'credit' && (
            <>
              <label htmlFor="account-credit-limit">
                Credit limit (EGP)
              </label>
              <input
                id="account-credit-limit"
                type="number"
                inputMode="decimal"
                min="0.01"
                max="999999999999.99"
                step="0.01"
                value={creditLimit}
                onChange={(event) => setCreditLimit(event.target.value)}
                required
              />
              <p className="account-form-help">
                The maximum amount provided by your card issuer.
              </p>

              <label htmlFor="account-default-payment">
                Default payment account (optional)
              </label>
              <select
                id="account-default-payment"
                value={defaultPaymentId}
                onChange={(event) => setDefaultPaymentId(event.target.value)}
              >
                <option value="">Choose when paying</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              <p className="account-form-help">
                This Bank account will be selected first when paying the card.
              </p>
            </>
          )}
        </fieldset>

        <Button
          type="submit"
          loading={saving}
          disabled={saving || storageBlocked}
        >
          {pending
              ? 'Retry account'
              : 'Add account'}
        </Button>
      </form>
    </section>
  )
}
