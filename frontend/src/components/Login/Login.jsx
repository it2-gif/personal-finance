import { useState } from 'react'
import { apiRequest } from '../../api'

import ThemeToggle from '../UI/ThemeToggle'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import FormField from '../UI/FormField'
import './Login.css'
export default function Login({ onLogin, notice = '' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return

    setError('')
    setLoading(true)

    try {
      const user = await apiRequest('/auth/login', {
        method: 'POST',
        skipAuthEvent: true,
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      setPassword('')
      onLogin(user)
    } catch (error) {
      setError(
        error.status
          ? error.message
          : 'Unable to connect. Please try again.',
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
      <section className="auth-card" aria-labelledby="login-heading">
        <p className="brand">Personal Finance</p>
        <h1 id="login-heading">Welcome back</h1>
        <p>Sign in to track your money.</p>
        <Toast message={notice} type="success" />

        <form onSubmit={handleSubmit} aria-busy={loading}>
          <FormField label="Email" htmlFor="email">
            <input
              id="email"
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

          <FormField label="Password" htmlFor="password">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={128}
              disabled={loading}
            />
          </FormField>

          <Toast message={error} type="error" onClose={() => setError('')} />

          <Button type="submit" size="large" loading={loading}>Sign in</Button>
        </form>
      </section>
    </main>
  )
}
