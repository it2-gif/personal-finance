import { unlockVaultWithPassword } from './vaultCrypto.js'

export const BACKUP_VERSION = 1

export function createEncryptedBackup(envelope, exportedAt = new Date().toISOString()) {
  if (!envelope?.ciphertext || !envelope?.data_nonce) throw new Error('The current vault is not ready to back up.')
  return {
    product: 'Spendwise',
    backup_version: BACKUP_VERSION,
    exported_at: exportedAt,
    envelope: structuredClone(envelope),
  }
}

export function serializeEncryptedBackup(envelope, exportedAt) {
  return JSON.stringify(createEncryptedBackup(envelope, exportedAt))
}

export async function unlockEncryptedBackup(serialized, password) {
  let parsed
  try {
    parsed = typeof serialized === 'string' ? JSON.parse(serialized) : serialized
  } catch {
    throw new Error('This backup file is not valid JSON.')
  }
  if (parsed?.product !== 'Spendwise' || parsed?.backup_version !== BACKUP_VERSION || !parsed.envelope) {
    throw new Error('This is not a supported Spendwise backup.')
  }
  return unlockVaultWithPassword(password, parsed.envelope)
}
