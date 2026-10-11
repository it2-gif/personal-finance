function storageKey(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('A valid user ID is required.')
  }

  return `personal-finance:pending-account:${userId}`
}

export function readPendingAccount(userId) {
  const saved = localStorage.getItem(storageKey(userId))
  if (!saved) return null

  const account = JSON.parse(saved)

  const valid =
    account !== null &&
    typeof account === 'object' &&
    typeof account.request_id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      account.request_id,
    ) &&
    typeof account.name === 'string' &&
    ['cash', 'bank', 'credit'].includes(account.account_type) &&
    account.currency === 'EGP' &&
    typeof account.opening_balance === 'string' &&
    (
      account.credit_limit === null ||
      typeof account.credit_limit === 'string'
    ) &&
    (
      account.default_payment_account_id === undefined ||
      account.default_payment_account_id === null ||
      Number.isInteger(account.default_payment_account_id)
    )

  if (!valid) {
    throw new Error('The saved account could not be read.')
  }

  return {
    ...account,
    default_payment_account_id:
      account.default_payment_account_id ?? null,
  }
}

export function writePendingAccount(userId, account) {
  localStorage.setItem(storageKey(userId), JSON.stringify(account))
}

export function clearPendingAccount(userId) {
  localStorage.removeItem(storageKey(userId))
}
