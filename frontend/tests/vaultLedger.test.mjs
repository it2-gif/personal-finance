import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.window = { location: { origin: 'https://spendwise.test' } }

let storedEnvelope = null
globalThis.fetch = async (_url, options = {}) => {
  if ((options.method || 'GET') === 'PUT') {
    const body = JSON.parse(options.body)
    const revision = storedEnvelope ? storedEnvelope.revision + 1 : 1
    storedEnvelope = { ...body, revision }
    delete storedEnvelope.expected_revision
    return { ok: true, status: 200, json: async () => structuredClone(storedEnvelope) }
  }
  return storedEnvelope
    ? { ok: true, status: 200, json: async () => structuredClone(storedEnvelope) }
    : { ok: false, status: 404, json: async () => ({ detail: 'Not found' }) }
}

const { initializeVault } = await import('../src/security/vaultSession.js')
const { vaultRequest } = await import('../src/security/vaultApi.js')

test('encrypted local ledger calculates accounts, entries, transfers and summary', async () => {
  await initializeVault('a secure password value', 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ12-3456')
  const bank = await vaultRequest('/accounts', {
    method: 'POST',
    body: JSON.stringify({ request_id: crypto.randomUUID(), name: 'Private bank', account_type: 'bank', currency: 'EGP', opening_balance: '1000.00', credit_limit: null, default_payment_account_id: null }),
  })
  const cash = await vaultRequest('/accounts', {
    method: 'POST',
    body: JSON.stringify({ request_id: crypto.randomUUID(), name: 'Private cash', account_type: 'cash', currency: 'EGP', opening_balance: '0.00', credit_limit: null, default_payment_account_id: null }),
  })
  await vaultRequest('/transactions', {
    method: 'POST',
    body: JSON.stringify({ request_id: crypto.randomUUID(), account_id: bank.id, type: 'expense', kind: 'regular', amount: '200.00', date: '2026-10-12', category: 'Food', description: null }),
  })
  await vaultRequest('/transfers', {
    method: 'POST',
    body: JSON.stringify({ request_id: crypto.randomUUID(), from_account_id: bank.id, to_account_id: cash.id, amount: '300.00', date: '2026-10-12', description: null }),
  })

  const balances = await vaultRequest('/accounts/balances')
  assert.equal(balances.find((item) => item.id === bank.id).balance, '500.00')
  assert.equal(balances.find((item) => item.id === cash.id).balance, '300.00')
  const summary = await vaultRequest('/summary?start_date=2026-10-01&end_date=2026-10-31')
  assert.equal(summary.expenses, '200.00')
  assert.equal(summary.surplus, '-200.00')
  assert.equal(JSON.stringify(storedEnvelope).includes('Private bank'), false)
  assert.equal(JSON.stringify(storedEnvelope).includes('1000.00'), false)
})
