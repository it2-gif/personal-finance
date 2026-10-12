const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const VAULT_FORMAT_VERSION = 1
export const PASSWORD_KDF_ITERATIONS = 600_000
const KEY_AAD = encoder.encode('spendwise:vault-key:v1')
const DATA_AAD = encoder.encode('spendwise:vault-data:v1')

export function emptyVault() {
  return {
    version: VAULT_FORMAT_VERSION,
    nextIds: { account: 1, transaction: 1, transfer: 1, statement: 1, allocation: 1 },
    accounts: [],
    transactions: [],
    transfers: [],
    statements: [],
    allocations: [],
  }
}

export function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export function base64ToBytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length))
}

async function deriveWrappingKey(secret, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function importDataKey(rawKey) {
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

async function wrapDataKey(dataKey, wrappingKey, nonce) {
  const rawKey = await crypto.subtle.exportKey('raw', dataKey)
  return crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: KEY_AAD }, wrappingKey, rawKey)
}

async function unwrapDataKey(wrappedKey, wrappingKey, nonce) {
  const rawKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: KEY_AAD },
    wrappingKey,
    wrappedKey,
  )
  return importDataKey(rawKey)
}

export async function encryptVaultData(dataKey, value) {
  const nonce = randomBytes(12)
  const plaintext = encoder.encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: DATA_AAD },
    dataKey,
    plaintext,
  )
  return { data_nonce: bytesToBase64(nonce), ciphertext: bytesToBase64(ciphertext) }
}

export async function decryptVaultData(dataKey, envelope) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.data_nonce), additionalData: DATA_AAD },
    dataKey,
    base64ToBytes(envelope.ciphertext),
  )
  const value = JSON.parse(decoder.decode(plaintext))
  if (value?.version !== VAULT_FORMAT_VERSION) throw new Error('This encrypted vault version is not supported.')
  return value
}

export async function createVaultEnvelope(password, recoveryCode, initialData = emptyVault()) {
  const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const passwordSalt = randomBytes(16)
  const recoverySalt = randomBytes(16)
  const passwordNonce = randomBytes(12)
  const recoveryNonce = randomBytes(12)
  const [passwordKey, recoveryKey] = await Promise.all([
    deriveWrappingKey(password, passwordSalt, PASSWORD_KDF_ITERATIONS),
    deriveWrappingKey(recoveryCode, recoverySalt, PASSWORD_KDF_ITERATIONS),
  ])
  const [passwordWrappedKey, recoveryWrappedKey, encryptedData] = await Promise.all([
    wrapDataKey(dataKey, passwordKey, passwordNonce),
    wrapDataKey(dataKey, recoveryKey, recoveryNonce),
    encryptVaultData(dataKey, initialData),
  ])
  return {
    dataKey,
    envelope: {
      format_version: VAULT_FORMAT_VERSION,
      expected_revision: null,
      password_kdf_salt: bytesToBase64(passwordSalt),
      password_kdf_iterations: PASSWORD_KDF_ITERATIONS,
      password_wrap_nonce: bytesToBase64(passwordNonce),
      password_wrapped_key: bytesToBase64(passwordWrappedKey),
      recovery_kdf_salt: bytesToBase64(recoverySalt),
      recovery_kdf_iterations: PASSWORD_KDF_ITERATIONS,
      recovery_wrap_nonce: bytesToBase64(recoveryNonce),
      recovery_wrapped_key: bytesToBase64(recoveryWrappedKey),
      passkey_envelope: null,
      ...encryptedData,
    },
  }
}

export async function unlockVaultWithPassword(password, envelope) {
  const wrappingKey = await deriveWrappingKey(
    password,
    base64ToBytes(envelope.password_kdf_salt),
    envelope.password_kdf_iterations,
  )
  const dataKey = await unwrapDataKey(
    base64ToBytes(envelope.password_wrapped_key),
    wrappingKey,
    base64ToBytes(envelope.password_wrap_nonce),
  )
  return { dataKey, data: await decryptVaultData(dataKey, envelope) }
}

export async function unlockVaultWithRecoveryCode(recoveryCode, envelope) {
  const dataKey = await unwrapDataKeyWithRecoveryCode(recoveryCode, envelope)
  return { dataKey, data: await decryptVaultData(dataKey, envelope) }
}

export async function unwrapDataKeyWithRecoveryCode(recoveryCode, envelope) {
  const wrappingKey = await deriveWrappingKey(
    recoveryCode,
    base64ToBytes(envelope.recovery_kdf_salt),
    envelope.recovery_kdf_iterations,
  )
  return unwrapDataKey(
    base64ToBytes(envelope.recovery_wrapped_key),
    wrappingKey,
    base64ToBytes(envelope.recovery_wrap_nonce),
  )
}

export async function rewrapVaultPassword(dataKey, newPassword) {
  const salt = randomBytes(16)
  const nonce = randomBytes(12)
  const wrappingKey = await deriveWrappingKey(newPassword, salt, PASSWORD_KDF_ITERATIONS)
  const wrappedKey = await wrapDataKey(dataKey, wrappingKey, nonce)
  return {
    password_kdf_salt: bytesToBase64(salt),
    password_kdf_iterations: PASSWORD_KDF_ITERATIONS,
    password_wrap_nonce: bytesToBase64(nonce),
    password_wrapped_key: bytesToBase64(wrappedKey),
  }
}

export async function rewrapVaultRecovery(dataKey, recoveryCode) {
  const salt = randomBytes(16)
  const nonce = randomBytes(12)
  const wrappingKey = await deriveWrappingKey(recoveryCode, salt, PASSWORD_KDF_ITERATIONS)
  const wrappedKey = await wrapDataKey(dataKey, wrappingKey, nonce)
  return {
    recovery_kdf_salt: bytesToBase64(salt),
    recovery_kdf_iterations: PASSWORD_KDF_ITERATIONS,
    recovery_wrap_nonce: bytesToBase64(nonce),
    recovery_wrapped_key: bytesToBase64(wrappedKey),
  }
}

export function createRecoveryCode() {
  const hex = [...randomBytes(16)].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()
  return hex.match(/.{1,4}/g).join('-')
}

export async function buildVaultUpdate(dataKey, data, envelope) {
  const encryptedData = await encryptVaultData(dataKey, data)
  return {
    format_version: envelope.format_version,
    expected_revision: envelope.revision,
    password_kdf_salt: envelope.password_kdf_salt,
    password_kdf_iterations: envelope.password_kdf_iterations,
    password_wrap_nonce: envelope.password_wrap_nonce,
    password_wrapped_key: envelope.password_wrapped_key,
    recovery_kdf_salt: envelope.recovery_kdf_salt,
    recovery_kdf_iterations: envelope.recovery_kdf_iterations,
    recovery_wrap_nonce: envelope.recovery_wrap_nonce,
    recovery_wrapped_key: envelope.recovery_wrapped_key,
    passkey_envelope: envelope.passkey_envelope,
    ...encryptedData,
  }
}

export async function importPrfWrappingKey(prfOutput) {
  return crypto.subtle.importKey('raw', prfOutput, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export { randomBytes, wrapDataKey, unwrapDataKey }
