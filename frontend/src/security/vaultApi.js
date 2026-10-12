import { getUnlockedVault, updateVault } from './vaultSession.js'

const protectedRoots = ['/accounts', '/transactions', '/transfers', '/statements', '/summary']

export function isVaultPath(path) {
  return protectedRoots.some((root) => path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}?`))
}

function apiError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function amount(value) {
  return Math.round(Number(value) * 100) / 100
}

function money(value) {
  return amount(value).toFixed(2)
}

function now() {
  return new Date().toISOString()
}

function parseRequest(path, options) {
  const url = new URL(path, window.location.origin)
  return {
    pathname: url.pathname,
    query: url.searchParams,
    method: (options.method || 'GET').toUpperCase(),
    body: options.body ? JSON.parse(options.body) : null,
  }
}

function activeTransactions(vault, accountId) {
  return vault.transactions.filter((item) => item.account_id === accountId && !item.reversed_at)
}

function accountBalance(vault, accountId) {
  const account = vault.accounts.find((item) => item.id === accountId)
  if (!account) return 0
  let balance = amount(account.opening_balance)
  for (const entry of activeTransactions(vault, accountId)) {
    balance += entry.type === 'income' ? amount(entry.amount) : -amount(entry.amount)
  }
  for (const transfer of vault.transfers.filter((item) => !item.reversed_at)) {
    if (transfer.from_account_id === accountId) balance -= amount(transfer.amount)
    if (transfer.to_account_id === accountId) balance += amount(transfer.amount)
  }
  return amount(balance)
}

function accountRead(account) {
  return { ...account }
}

function balanceRead(vault, account) {
  const entries = activeTransactions(vault, account.id)
  const income = entries.filter((item) => item.type === 'income').reduce((sum, item) => sum + amount(item.amount), 0)
  const expenses = entries.filter((item) => item.type === 'expense').reduce((sum, item) => sum + amount(item.amount), 0)
  const balance = accountBalance(vault, account.id)
  const owed = account.account_type === 'credit' ? Math.max(-balance, 0) : null
  return {
    ...account,
    income: money(income),
    expenses: money(expenses),
    balance: money(balance),
    amount_owed: owed === null ? null : money(owed),
    available_credit: owed === null ? null : money(Math.max(amount(account.credit_limit) - owed, 0)),
  }
}

function validateAccount(vault, body, existingId = null) {
  if (!body.name?.trim()) throw apiError(422, 'Enter an account name.')
  if (!['cash', 'bank', 'credit'].includes(body.account_type)) throw apiError(422, 'Invalid account type.')
  if (body.account_type === 'credit') {
    if (!(amount(body.credit_limit) > 0) || amount(body.opening_balance) > 0) throw apiError(422, 'Check the credit limit and starting debt.')
    if (body.default_payment_account_id != null) {
      const payment = vault.accounts.find((item) => item.id === Number(body.default_payment_account_id) && item.account_type === 'bank' && !item.archived_at)
      if (!payment) throw apiError(422, 'Choose an active Bank account as the default payment account.')
    }
  }
  if (existingId) {
    const current = vault.accounts.find((item) => item.id === existingId)
    if (current.account_type !== body.account_type) throw apiError(422, 'Create a separate account when switching account type.')
  }
}

function validateTransaction(vault, body, replacingId = null) {
  if (!(amount(body.amount) > 0)) throw apiError(422, 'Enter an amount greater than zero.')
  const account = vault.accounts.find((item) => item.id === Number(body.account_id) && !item.archived_at)
  if (!account) throw apiError(404, 'Account not found')
  const simulated = structuredClone(vault)
  if (replacingId) {
    const previous = simulated.transactions.find((item) => item.id === replacingId)
    if (previous) previous.reversed_at = now()
  }
  simulated.transactions.push({ ...body, id: -1, account_id: account.id, amount: money(body.amount), reversed_at: null })
  const projected = accountBalance(simulated, account.id)
  if (account.account_type === 'credit') {
    const validKinds = body.type === 'income'
      ? ['card_refund']
      : ['card_purchase', 'card_fee', 'card_interest']
    if (!validKinds.includes(body.kind)) throw apiError(422, 'Choose Purchase, Refund, Fee, or Interest for a credit card.')
    if (projected < -amount(account.credit_limit)) throw apiError(422, 'This exceeds the available credit.')
    if (body.kind === 'card_refund' && amount(body.amount) > Math.max(-accountBalance(vault, account.id), 0)) throw apiError(422, 'Refund cannot exceed the card debt.')
  } else {
    if (body.kind !== 'regular') throw apiError(422, 'Card actions require a credit card.')
    if (projected < 0) throw apiError(422, 'Not enough money in this account.')
  }
}

function validateStatement(vault, body) {
  const account = vault.accounts.find((item) => item.id === Number(body.account_id) && item.account_type === 'credit' && !item.archived_at)
  if (!account) throw apiError(404, 'Credit card not found')
  if (body.opening_date > body.closing_date) throw apiError(422, 'Opening date must not be after closing date.')
  if (body.due_date <= body.closing_date) throw apiError(422, 'Due date must be after closing date.')
  if (amount(body.amount_due) < 0 || amount(body.minimum_payment) < 0 || amount(body.minimum_payment) > amount(body.amount_due)) throw apiError(422, 'Check the statement and minimum amounts.')
}

function statementRead(vault, statement) {
  const paid = vault.allocations.filter((item) => item.statement_id === statement.id).reduce((sum, item) => sum + amount(item.amount), 0)
  const remaining = Math.max(amount(statement.amount_due) - paid, 0)
  const today = new Date().toISOString().slice(0, 10)
  const status = remaining === 0 ? 'paid' : statement.due_date < today ? 'overdue' : paid > 0 ? 'partially_paid' : 'open'
  return { ...statement, paid_amount: money(paid), remaining_amount: money(remaining), status }
}

function allocatePayment(vault, transfer) {
  const destination = vault.accounts.find((item) => item.id === transfer.to_account_id)
  if (destination?.account_type !== 'credit') return
  let remaining = amount(transfer.amount)
  const statements = vault.statements.filter((item) => item.account_id === destination.id).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id)
  for (const statement of statements) {
    const open = amount(statementRead(vault, statement).remaining_amount)
    const applied = Math.min(open, remaining)
    if (applied > 0) {
      vault.allocations.push({ id: vault.nextIds.allocation++, transfer_id: transfer.id, statement_id: statement.id, amount: money(applied) })
      remaining -= applied
    }
    if (remaining <= 0) break
  }
}

export async function vaultRequest(path, options = {}) {
  const request = parseRequest(path, options)
  const vault = getUnlockedVault()

  if (request.method === 'GET') {
    if (request.pathname === '/accounts') {
      const includeArchived = request.query.get('include_archived') === 'true'
      return vault.accounts.filter((item) => includeArchived || !item.archived_at).sort((a, b) => a.id - b.id).map(accountRead)
    }
    if (request.pathname === '/accounts/balances') return vault.accounts.filter((item) => !item.archived_at).map((item) => balanceRead(vault, item))
    if (request.pathname === '/transactions') {
      let items = vault.transactions.slice()
      const accountId = Number(request.query.get('account_id'))
      if (accountId) items = items.filter((item) => item.account_id === accountId)
      if (request.query.get('type')) items = items.filter((item) => item.type === request.query.get('type'))
      if (request.query.get('start_date')) items = items.filter((item) => item.date >= request.query.get('start_date'))
      if (request.query.get('end_date')) items = items.filter((item) => item.date <= request.query.get('end_date'))
      if (request.query.get('search')) {
        const search = request.query.get('search').toLowerCase()
        items = items.filter((item) => `${item.category} ${item.description || ''}`.toLowerCase().includes(search))
      }
      items.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      const offset = Number(request.query.get('offset') || 0)
      const limit = Number(request.query.get('limit') || 100)
      return items.slice(offset, offset + limit)
    }
    if (request.pathname === '/transfers') {
      let items = vault.transfers.slice()
      const accountId = Number(request.query.get('account_id'))
      if (accountId) items = items.filter((item) => item.from_account_id === accountId || item.to_account_id === accountId)
      if (request.query.get('start_date')) items = items.filter((item) => item.date >= request.query.get('start_date'))
      if (request.query.get('end_date')) items = items.filter((item) => item.date <= request.query.get('end_date'))
      items.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      return items.slice(Number(request.query.get('offset') || 0), Number(request.query.get('offset') || 0) + Number(request.query.get('limit') || 100))
    }
    if (request.pathname === '/statements') {
      const accountId = Number(request.query.get('account_id'))
      return vault.statements.filter((item) => !accountId || item.account_id === accountId).sort((a, b) => a.due_date.localeCompare(b.due_date)).map((item) => statementRead(vault, item))
    }
    if (request.pathname === '/summary') {
      const start = request.query.get('start_date')
      const end = request.query.get('end_date')
      const entries = vault.transactions.filter((item) => !item.reversed_at && item.date >= start && item.date <= end)
      const income = entries.filter((item) => item.type === 'income').reduce((sum, item) => sum + amount(item.amount), 0)
      const expenses = entries.filter((item) => item.type === 'expense').reduce((sum, item) => sum + amount(item.amount), 0)
      return { start_date: start, end_date: end, currency: 'EGP', income: money(income), expenses: money(expenses), surplus: money(income - expenses) }
    }
  }

  return updateVault((next) => {
    const body = request.body
    let match
    if (request.pathname === '/accounts' && request.method === 'POST') {
      const existing = next.accounts.find((item) => item.request_id === body.request_id)
      if (existing) return accountRead(existing)
      validateAccount(next, body)
      const account = { ...body, id: next.nextIds.account++, name: body.name.trim(), opening_balance: money(body.opening_balance), credit_limit: body.credit_limit == null ? null : money(body.credit_limit), created_at: now(), archived_at: null }
      next.accounts.push(account)
      return accountRead(account)
    }
    if ((match = request.pathname.match(/^\/accounts\/(\d+)$/)) && request.method === 'PUT') {
      const account = next.accounts.find((item) => item.id === Number(match[1]))
      if (!account) throw apiError(404, 'Account not found')
      validateAccount(next, body, account.id)
      Object.assign(account, body, { name: body.name.trim(), opening_balance: money(body.opening_balance), credit_limit: body.credit_limit == null ? null : money(body.credit_limit) })
      return accountRead(account)
    }
    if ((match = request.pathname.match(/^\/accounts\/(\d+)\/archive$/)) && request.method === 'POST') {
      const account = next.accounts.find((item) => item.id === Number(match[1]))
      if (!account) throw apiError(404, 'Account not found')
      account.archived_at ||= now()
      for (const card of next.accounts.filter((item) => item.default_payment_account_id === account.id)) card.default_payment_account_id = null
      return accountRead(account)
    }
    if (request.pathname === '/transactions' && request.method === 'POST') {
      const existing = next.transactions.find((item) => item.request_id === body.request_id)
      if (existing) return existing
      validateTransaction(next, body)
      const entry = { ...body, id: next.nextIds.transaction++, account_id: Number(body.account_id), amount: money(body.amount), category: body.category.trim(), description: body.description?.trim() || null, created_at: now(), reversed_at: null }
      next.transactions.push(entry)
      return entry
    }
    if ((match = request.pathname.match(/^\/transactions\/(\d+)$/)) && request.method === 'PUT') {
      const entry = next.transactions.find((item) => item.id === Number(match[1]))
      if (!entry) throw apiError(404, 'Transaction not found')
      if (entry.reversed_at) throw apiError(409, 'Reversed entries cannot be edited.')
      validateTransaction(next, body, entry.id)
      Object.assign(entry, body, { account_id: Number(body.account_id), amount: money(body.amount), category: body.category.trim(), description: body.description?.trim() || null })
      return entry
    }
    if ((match = request.pathname.match(/^\/transactions\/(\d+)(?:\/reverse)?$/)) && ['POST', 'DELETE'].includes(request.method)) {
      const entry = next.transactions.find((item) => item.id === Number(match[1]))
      if (!entry) throw apiError(404, 'Transaction not found')
      entry.reversed_at ||= now()
      return null
    }
    if (request.pathname === '/transfers' && request.method === 'POST') {
      const existing = next.transfers.find((item) => item.request_id === body.request_id)
      if (existing) return existing
      const source = next.accounts.find((item) => item.id === Number(body.from_account_id) && !item.archived_at)
      const destination = next.accounts.find((item) => item.id === Number(body.to_account_id) && !item.archived_at)
      if (!source || !destination) throw apiError(404, 'Account not found')
      if (source.id === destination.id) throw apiError(422, 'Choose two different accounts.')
      if (source.currency !== destination.currency) throw apiError(422, 'Both accounts must use the same currency.')
      if (!(amount(body.amount) > 0)) throw apiError(422, 'Enter an amount greater than zero.')
      if (source.account_type === 'credit') throw apiError(422, 'Transfer from Cash or Bank. Credit cards can receive payments.')
      if (amount(body.amount) > accountBalance(next, source.id)) throw apiError(422, 'Not enough money in the source account.')
      if (destination.account_type === 'credit' && amount(body.amount) > Math.max(-accountBalance(next, destination.id), 0)) throw apiError(422, 'Payment cannot exceed the card debt.')
      const transfer = { ...body, id: next.nextIds.transfer++, from_account_id: Number(body.from_account_id), to_account_id: Number(body.to_account_id), amount: money(body.amount), description: body.description?.trim() || null, created_at: now(), reversed_at: null }
      next.transfers.push(transfer)
      allocatePayment(next, transfer)
      return transfer
    }
    if ((match = request.pathname.match(/^\/transfers\/(\d+)\/reverse$/)) && request.method === 'POST') {
      const transfer = next.transfers.find((item) => item.id === Number(match[1]))
      if (!transfer) throw apiError(404, 'Transfer not found')
      transfer.reversed_at ||= now()
      next.allocations = next.allocations.filter((item) => item.transfer_id !== transfer.id)
      return null
    }
    if (request.pathname === '/statements' && request.method === 'POST') {
      validateStatement(next, body)
      const statement = { ...body, id: next.nextIds.statement++, account_id: Number(body.account_id), amount_due: money(body.amount_due), minimum_payment: money(body.minimum_payment), created_at: now() }
      next.statements.push(statement)
      return statementRead(next, statement)
    }
    if ((match = request.pathname.match(/^\/statements\/(\d+)$/)) && request.method === 'PUT') {
      const statement = next.statements.find((item) => item.id === Number(match[1]))
      if (!statement) throw apiError(404, 'Statement not found')
      validateStatement(next, body)
      Object.assign(statement, body, { account_id: Number(body.account_id), amount_due: money(body.amount_due), minimum_payment: money(body.minimum_payment) })
      return statementRead(next, statement)
    }
    if ((match = request.pathname.match(/^\/statements\/(\d+)$/)) && request.method === 'DELETE') {
      const id = Number(match[1])
      next.statements = next.statements.filter((item) => item.id !== id)
      next.allocations = next.allocations.filter((item) => item.statement_id !== id)
      return null
    }
    throw apiError(404, 'Encrypted vault operation is not supported.')
  })
}
