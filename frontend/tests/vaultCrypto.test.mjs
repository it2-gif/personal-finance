import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createVaultEnvelope,
  decryptVaultData,
  rewrapVaultPassword,
  rewrapVaultRecovery,
  unlockVaultWithPassword,
  unlockVaultWithRecoveryCode,
} from '../src/security/vaultCrypto.js'

const password = 'correct horse battery staple'
const recoveryCode = 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ12-3456'

test('password and recovery code unlock the same encrypted vault', async () => {
  const created = await createVaultEnvelope(password, recoveryCode)
  const passwordResult = await unlockVaultWithPassword(password, created.envelope)
  const recoveryResult = await unlockVaultWithRecoveryCode(recoveryCode, created.envelope)
  assert.deepEqual(passwordResult.data, recoveryResult.data)
  assert.equal(passwordResult.data.version, 1)
})

test('wrong passwords and modified ciphertext are rejected', async () => {
  const created = await createVaultEnvelope(password, recoveryCode)
  await assert.rejects(unlockVaultWithPassword('incorrect password', created.envelope))
  const unlocked = await unlockVaultWithPassword(password, created.envelope)
  const ciphertext = Buffer.from(created.envelope.ciphertext, 'base64')
  ciphertext[0] ^= 1
  await assert.rejects(decryptVaultData(unlocked.dataKey, {
    ...created.envelope,
    ciphertext: ciphertext.toString('base64'),
  }))
})

test('password wrapping can change without changing vault data', async () => {
  const created = await createVaultEnvelope(password, recoveryCode)
  const unlocked = await unlockVaultWithPassword(password, created.envelope)
  const replacement = await rewrapVaultPassword(unlocked.dataKey, 'a different secure password')
  const reopened = await unlockVaultWithPassword('a different secure password', {
    ...created.envelope,
    ...replacement,
  })
  assert.deepEqual(reopened.data, unlocked.data)
})

test('recovery code rotation invalidates the old recovery wrapper', async () => {
  const created = await createVaultEnvelope(password, recoveryCode)
  const unlocked = await unlockVaultWithRecoveryCode(recoveryCode, created.envelope)
  const replacementCode = '9999-8888-7777-6666-5555-4444-3333-2222'
  const replacement = await rewrapVaultRecovery(unlocked.dataKey, replacementCode)
  const rotated = { ...created.envelope, ...replacement }
  await assert.rejects(unlockVaultWithRecoveryCode(recoveryCode, rotated))
  const reopened = await unlockVaultWithRecoveryCode(replacementCode, rotated)
  assert.deepEqual(reopened.data, unlocked.data)
})
