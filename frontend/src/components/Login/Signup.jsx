import { useState } from 'react'
import { apiRequest } from '../../api'

import ThemeToggle from '../UI/ThemeToggle'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import FormField from '../UI/FormField'
import './Login.css'

export default function Signup({ onCreated, onBack }) {
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
      await apiRequest('/auth/signup', {
        method: 'POST',
        skipAuthEvent: true,
        body: JSON.stringify({ email: email.trim(), password }),
      })
      onCreated()
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
        <p className="brand">Personal Finance</p>
        <h1 id="signup-heading">Create your account</h1>
        <p>Set up the private owner account for this workspace.</p>

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
          <Button variant="ghost" size="small" onClick={onBack} disabled={loading}>
            Back to sign in
          </Button>
        </div>
      </section>
    </main>
  )
}
