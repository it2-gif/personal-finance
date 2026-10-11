import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import Button from '../UI/Button'
import ProgressBar from '../UI/ProgressBar'
import StatusBadge from '../UI/StatusBadge'
import './AccountDetailsDialog.css'

const money = (value, currency) => new Intl.NumberFormat('en-EG', { style: 'currency', currency }).format(Number(value || 0))

export default function AccountDetailsDialog({ account, paymentAccountName, onClose }) {
  const closeRef = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    function keydown(event) { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow }
  }, [onClose])

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-dialog-heading"><div><StatusBadge tone={account.account_type === 'credit' ? 'warning' : 'info'}>{account.account_type}</StatusBadge><h2 id={titleId}>{account.name}</h2></div><Button ref={closeRef} variant="icon" onClick={onClose} aria-label="Close account details">×</Button></div>
        <dl>
          <div><dt>{account.account_type === 'credit' ? 'Amount owed' : 'Current balance'}</dt><dd>{money(account.account_type === 'credit' ? account.amount_owed : account.balance, account.currency)}</dd></div>
          <div><dt>Opening balance</dt><dd>{money(account.opening_balance, account.currency)}</dd></div>
          {account.account_type === 'credit' && <><div><dt>Available credit</dt><dd>{money(account.available_credit, account.currency)}</dd></div><div><dt>Credit limit</dt><dd>{money(account.credit_limit, account.currency)}</dd></div></>}
        </dl>
        {account.account_type === 'credit' && <div className="account-dialog-progress"><span>Credit utilization</span><ProgressBar value={account.amount_owed} max={account.credit_limit} label="Credit utilization" /><small>Default payment account: {paymentAccountName || 'Choose when paying'}</small></div>}
      </section>
    </div>,
    document.body,
  )
}
