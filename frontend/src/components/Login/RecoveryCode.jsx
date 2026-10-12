import { useState } from 'react'
import Button from '../UI/Button'
import ThemeToggle from '../UI/ThemeToggle'
import Toast from '../UI/Toast'
import './Login.css'

export default function RecoveryCode({ code, title, message, onContinue }) {
  const [copied, setCopied] = useState(false)
  async function copyCode() { try { await navigator.clipboard.writeText(code); setCopied(true) } catch { setCopied(false) } }
  return <main className="auth-page"><div className="login-theme-toggle"><ThemeToggle /></div><section className="auth-card recovery-card"><div className="recovery-check">✓</div><h1>{title}</h1><p>{message}</p><div className="recovery-code" aria-label="Recovery code">{code}</div><Button variant="secondary" onClick={copyCode}>{copied ? 'Copied' : 'Copy recovery code'}</Button><Toast message={copied ? 'Recovery code copied.' : ''} type="success" onClose={() => setCopied(false)} /><div className="recovery-warning"><strong>Keep this code private.</strong><span>Anyone with it and your email can reset your password.</span></div><Button size="large" onClick={onContinue}>I saved my code</Button></section></main>
}
