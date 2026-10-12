import {
  base64ToBytes,
  bytesToBase64,
  importPrfWrappingKey,
  randomBytes,
  unwrapDataKey,
  wrapDataKey,
} from './vaultCrypto.js'

function requirePasskeySupport() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('Passkeys are not supported on this device. Use your password to unlock Spendwise.')
  }
}

function prfResult(credential) {
  const result = credential.getClientExtensionResults()?.prf?.results?.first
  if (!result) throw new Error('This browser cannot use the passkey for encrypted vault access.')
  return result
}

async function evaluatePrf(credentialId, salt) {
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt } } },
    },
  })
  return { credential, output: prfResult(credential) }
}

export async function createPasskeyEnvelope(dataKey, user) {
  requirePasskeySupport()
  const prfSalt = randomBytes(32)
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Spendwise' },
      user: {
        id: new TextEncoder().encode(`spendwise-user-${user.id}`),
        name: user.email,
        displayName: user.email,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
      attestation: 'none',
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  })

  let output = credential.getClientExtensionResults()?.prf?.results?.first
  if (!output) ({ output } = await evaluatePrf(new Uint8Array(credential.rawId), prfSalt))
  const wrappingKey = await importPrfWrappingKey(output)
  const nonce = randomBytes(12)
  const wrappedKey = await wrapDataKey(dataKey, wrappingKey, nonce)
  return JSON.stringify({
    version: 1,
    credentialId: bytesToBase64(credential.rawId),
    prfSalt: bytesToBase64(prfSalt),
    wrapNonce: bytesToBase64(nonce),
    wrappedKey: bytesToBase64(wrappedKey),
  })
}

export async function unlockDataKeyWithPasskey(serializedEnvelope) {
  requirePasskeySupport()
  const envelope = JSON.parse(serializedEnvelope)
  if (envelope.version !== 1) throw new Error('This passkey format is not supported.')
  const credentialId = base64ToBytes(envelope.credentialId)
  const { output } = await evaluatePrf(credentialId, base64ToBytes(envelope.prfSalt))
  const wrappingKey = await importPrfWrappingKey(output)
  return unwrapDataKey(
    base64ToBytes(envelope.wrappedKey),
    wrappingKey,
    base64ToBytes(envelope.wrapNonce),
  )
}
