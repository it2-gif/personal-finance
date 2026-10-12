import { useState } from 'react'
import { apiRequest } from '../../api'
import Button from '../UI/Button'
import FormField from '../UI/FormField'
import ThemeToggle from '../UI/ThemeToggle'
import Toast from '../UI/Toast'
import './Login.css'

export default function ForgotPassword({ onNavigate, onReset }) {
  const [email, setEmail] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setError(''); setLoading(true)
    try {
      const result = await apiRequest('/auth/reset-password', { method: 'POST', skipAuthEvent: true, body: JSON.stringify({ email: email.trim(), recovery_code: recoveryCode.trim(), new_password: password }) })
      onReset(result)
    } catch (requestError) { setError(requestError.status ? requestError.message : 'Unable to reset your password. Please try again.') }
    finally { setLoading(false) }
  }

  return <main className="auth-page"><div className="login-theme-toggle"><ThemeToggle /></div><section className="auth-card"><button className="auth-brand" onClick={() => onNavigate('/')}><span className="brand-mark">PF</span>Personal Finance</button><h1>Reset your password</h1><p>Use the recovery code you saved when you created your account.</p><form onSubmit={handleSubmit} aria-busy={loading}><FormField label="Email" htmlFor="recovery-email"><input id="recovery-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={loading} /></FormField><FormField label="Recovery code" hint="Hyphens and letter case do not matter." htmlFor="recovery-code"><input id="recovery-code" autoComplete="off" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} minLength={32} maxLength={64} required disabled={loading} /></FormField><FormField label="New password" hint="Use at least 12 characters." htmlFor="new-password"><input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required disabled={loading} /></FormField><FormField label="Confirm new password" htmlFor="confirm-new-password"><input id="confirm-new-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required disabled={loading} /></FormField><Toast message={error} type="error" onClose={() => setError('')} /><Button type="submit" size="large" loading={loading}>Reset password</Button></form><div className="auth-switch"><span>Remembered your password?</span><Button variant="ghost" size="small" onClick={() => onNavigate('/login')}>Back to sign in</Button></div></section></main>
}
