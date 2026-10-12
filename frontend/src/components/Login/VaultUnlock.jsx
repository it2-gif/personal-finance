import { useState } from 'react'
import { apiRequest } from '../../api'
import { unlockVault, unlockVaultWithPasskey } from '../../security/vaultSession'
import Button from '../UI/Button'
import FormField from '../UI/FormField'
import ThemeToggle from '../UI/ThemeToggle'
import Toast from '../UI/Toast'
import './Login.css'

export default function VaultUnlock({ user, envelope, onUnlocked, onSignOut }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function unlockWithPassword(event) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      await apiRequest('/auth/login', {
        method: 'POST',
        skipAuthEvent: true,
        body: JSON.stringify({ email: user.email, password }),
      })
      await unlockVault(password, envelope)
      setPassword('')
      onUnlocked(user)
    } catch (requestError) {
      setError(requestError.status === 404
        ? 'This test account predates encrypted vaults. Create a fresh account for the encrypted version.'
        : requestError.message || 'Could not unlock your encrypted vault.')
    } finally {
      setLoading(false)
    }
  }

  async function unlockWithBiometrics() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      await unlockVaultWithPasskey(envelope)
      onUnlocked(user)
    } catch (requestError) {
      setError(requestError.message || 'Biometric unlock was not completed. Use your password instead.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="login-theme-toggle"><ThemeToggle /></div>
      <section className="auth-card" aria-labelledby="unlock-heading">
        <div className="auth-brand"><img className="brand-icon" src="/icons/spendwise-192.png" alt="" />Spendwise</div>
        <h1 id="unlock-heading">Unlock your vault</h1>
        <p>Your financial data is encrypted on this device before it is sent to Spendwise.</p>
        <Toast message={error} type="error" onClose={() => setError('')} />
        {envelope?.passkey_envelope && (
          <Button type="button" size="large" onClick={unlockWithBiometrics} loading={loading}>
            Use Face ID or fingerprint
          </Button>
        )}
        <form onSubmit={unlockWithPassword} aria-busy={loading}>
          <FormField label="Password" htmlFor="vault-password">
            <input id="vault-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={128} disabled={loading} />
          </FormField>
          <Button type="submit" size="large" loading={loading}>Unlock with password</Button>
        </form>
        <div className="auth-switch"><span>{user.email}</span><Button variant="ghost" size="small" onClick={onSignOut} disabled={loading}>Use another account</Button></div>
      </section>
    </main>
  )
}
