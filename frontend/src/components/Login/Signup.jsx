import { useState } from 'react'
import { apiRequest } from '../../api'
import { initializeVault } from '../../security/vaultSession'

import ThemeToggle from '../UI/ThemeToggle'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import FormField from '../UI/FormField'
import './Login.css'

export default function Signup({ onCreated, onNavigate }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const result = await apiRequest('/auth/signup', {
        method: 'POST',
        skipAuthEvent: true,
        body: JSON.stringify({ email: email.trim(), password }),
      })
      await initializeVault(password, result.recovery_code)
      setPassword('')
      setConfirmPassword('')
      onCreated(result)
    } catch (requestError) {
      setError(
        requestError.status
          ? requestError.message
          : 'Unable to create the account. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="login-theme-toggle">
        <ThemeToggle />
      </div>
      <section className="auth-card" aria-labelledby="signup-heading">
        <button className="auth-brand" onClick={() => onNavigate('/')}><img className="brand-icon" src="/icons/spendwise-192.png" alt="" />Spendwise</button>
        <h1 id="signup-heading">Create your account</h1>
        <p>Create your private workspace and start with the accounts you already use.</p>

        <form onSubmit={handleSubmit} aria-busy={loading}>
          <FormField label="Email" htmlFor="signup-email">
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={loading}
            />
          </FormField>

          <FormField label="Password" hint="Use at least 12 characters." htmlFor="signup-password">
            <input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={12}
              maxLength={128}
              disabled={loading}
            />
          </FormField>

          <FormField label="Confirm password" htmlFor="confirm-password">
            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={12}
              maxLength={128}
              disabled={loading}
            />
          </FormField>

          <Toast message={error} type="error" onClose={() => setError('')} />
          <Button type="submit" size="large" loading={loading}>Create account</Button>
        </form>

        <div className="auth-switch">
          <span>Already have an account?</span>
          <Button variant="ghost" size="small" onClick={() => onNavigate('/login')} disabled={loading}>
            Back to sign in
          </Button>
        </div>
      </section>
    </main>
  )
}
