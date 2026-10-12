import {
  buildVaultUpdate,
  createVaultEnvelope,
  decryptVaultData,
  unlockVaultWithPassword,
} from './vaultCrypto.js'
import { unlockDataKeyWithPasskey } from './passkeyVault.js'
import { createPasskeyEnvelope } from './passkeyVault.js'

let session = null
let saveQueue = Promise.resolve()

async function vaultFetch(options = {}) {
  const response = await fetch('/api/vault', {
    ...options,
    credentials: 'include',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.detail || `Vault request failed (${response.status})`)
    error.status = response.status
    throw error
  }
  return data
}

async function refreshAfterConflict() {
  if (!session) return
  const envelope = await vaultFetch()
  try {
    const data = await decryptVaultData(session.dataKey, envelope)
    session = { ...session, data, envelope }
  } catch {
    lockVault()
    window.dispatchEvent(new CustomEvent('finance:vault-lock-required'))
    throw new Error('Your vault security changed on another device. Sign in again before continuing.')
  }
}

export async function getVaultEnvelope() {
  return vaultFetch()
}

export async function initializeVault(password, recoveryCode) {
  const created = await createVaultEnvelope(password, recoveryCode)
  const envelope = await vaultFetch({ method: 'PUT', body: JSON.stringify(created.envelope) })
  session = { dataKey: created.dataKey, data: JSON.parse(JSON.stringify(created.envelope.initialData || null)), envelope }
  const unlocked = await unlockVaultWithPassword(password, envelope)
  session.data = unlocked.data
  return session.data
}

export async function unlockVault(password, suppliedEnvelope = null) {
  const envelope = suppliedEnvelope || await getVaultEnvelope()
  const unlocked = await unlockVaultWithPassword(password, envelope)
  session = { ...unlocked, envelope }
  return unlocked.data
}

export async function unlockVaultWithPasskey(suppliedEnvelope = null) {
  const envelope = suppliedEnvelope || await getVaultEnvelope()
  if (!envelope.passkey_envelope) throw new Error('Passkey unlock is not enabled for this account.')
  const dataKey = await unlockDataKeyWithPasskey(envelope.passkey_envelope)
  const data = await decryptVaultData(dataKey, envelope)
  session = { dataKey, data, envelope }
  return data
}

export function lockVault() {
  session = null
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index)
    if (key?.startsWith('personal-finance:pending-')) sessionStorage.removeItem(key)
  }
}

export function getUnlockedVault() {
  if (!session) {
    const error = new Error('Unlock your encrypted vault to continue.')
    error.status = 423
    throw error
  }
  return session.data
}

export function getVaultSession() {
  if (!session) throw new Error('Vault is locked.')
  return session
}

export async function updateVault(mutator) {
  const operation = saveQueue.then(async () => {
    if (!session) throw new Error('Vault is locked.')
    const nextData = structuredClone(session.data)
    const result = mutator(nextData)
    const update = await buildVaultUpdate(session.dataKey, nextData, session.envelope)
    let envelope
    try {
      envelope = await vaultFetch({ method: 'PUT', body: JSON.stringify(update) })
    } catch (error) {
      if (error.status === 409) {
        await refreshAfterConflict()
        const conflict = new Error('Your vault was updated on another device. Your form is unchanged; review it and save again.')
        conflict.status = 409
        throw conflict
      }
      throw error
    }
    session = { ...session, data: nextData, envelope }
    return result
  })
  saveQueue = operation.catch(() => {})
  return operation
}

export async function updateVaultEnvelope(changes) {
  const operation = saveQueue.then(async () => {
    if (!session) throw new Error('Vault is locked.')
    const nextEnvelope = { ...session.envelope, ...changes }
    const update = await buildVaultUpdate(session.dataKey, session.data, nextEnvelope)
    let envelope
    try {
      envelope = await vaultFetch({ method: 'PUT', body: JSON.stringify(update) })
    } catch (error) {
      if (error.status === 409) {
        await refreshAfterConflict()
        const conflict = new Error('Your vault was updated on another device. Review the latest settings and try again.')
        conflict.status = 409
        throw conflict
      }
      throw error
    }
    session = { ...session, envelope }
    return envelope
  })
  saveQueue = operation.catch(() => {})
  return operation
}

export async function enablePasskeyUnlock(user) {
  if (!session) throw new Error('Vault is locked.')
  const passkeyEnvelope = await createPasskeyEnvelope(session.dataKey, user)
  await updateVaultEnvelope({ passkey_envelope: passkeyEnvelope })
}

export async function disablePasskeyUnlock() {
  await updateVaultEnvelope({ passkey_envelope: null })
}
