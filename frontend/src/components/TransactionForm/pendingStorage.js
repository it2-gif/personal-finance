function storageKey(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('A valid user ID is required.')
  }

  return `personal-finance:pending-transaction:${userId}`
}

export function readPending(userId) {
  const saved = localStorage.getItem(storageKey(userId))
  if (!saved) return null

  const entry = JSON.parse(saved)

  const valid =
    entry !== null &&
    typeof entry === 'object' &&
    typeof entry.request_id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      entry.request_id,
    ) &&
    Number.isInteger(entry.account_id) &&
    entry.account_id > 0 &&
    ['income', 'expense'].includes(entry.type) &&
    (
      entry.kind === undefined ||
      ['regular', 'card_purchase', 'card_refund', 'card_fee', 'card_interest'].includes(
        entry.kind,
      )
    ) &&
    typeof entry.amount === 'string' &&
    typeof entry.date === 'string' &&
    typeof entry.category === 'string' &&
    (entry.description === null || typeof entry.description === 'string')

  if (!valid) {
    throw new Error('The saved entry could not be read.')
  }

  return { ...entry, kind: entry.kind ?? 'regular' }
}

export function writePending(userId, entry) {
  localStorage.setItem(storageKey(userId), JSON.stringify(entry))
}

export function clearPending(userId) {
  localStorage.removeItem(storageKey(userId))
}
