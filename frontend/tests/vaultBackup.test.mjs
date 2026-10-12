import test from 'node:test'
import assert from 'node:assert/strict'

import { createVaultEnvelope } from '../src/security/vaultCrypto.js'
import { createEncryptedBackup, serializeEncryptedBackup, unlockEncryptedBackup } from '../src/security/vaultBackup.js'

const password = 'backup password with enough length'
const recoveryCode = 'ABCD-EFGH-1234-5678-90AB-CDEF-1234-5678'

test('encrypted backup restores the original vault without plaintext in the file', async () => {
  const initial = { version: 1, nextIds: { account: 2, transaction: 1, transfer: 1, statement: 1, allocation: 1 }, accounts: [{ id: 1, name: 'Private savings', opening_balance: '2500.00' }], transactions: [], transfers: [], statements: [], allocations: [] }
  const created = await createVaultEnvelope(password, recoveryCode, initial)
  const serialized = serializeEncryptedBackup(created.envelope, '2026-10-12T00:00:00.000Z')
  assert.equal(serialized.includes('Private savings'), false)
  assert.equal(serialized.includes('2500.00'), false)
  const restored = await unlockEncryptedBackup(serialized, password)
  assert.deepEqual(restored.data, initial)
})

test('encrypted backup rejects wrong passwords and unsupported files', async () => {
  const created = await createVaultEnvelope(password, recoveryCode)
  const backup = createEncryptedBackup(created.envelope)
  await assert.rejects(unlockEncryptedBackup(backup, 'wrong password'))
  await assert.rejects(unlockEncryptedBackup('{"product":"Other"}', password), /not a supported Spendwise backup/)
  await assert.rejects(unlockEncryptedBackup('not json', password), /not valid JSON/)
})
