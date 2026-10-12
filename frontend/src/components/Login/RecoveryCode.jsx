import { useState } from 'react'
import Button from '../UI/Button'
import ThemeToggle from '../UI/ThemeToggle'
import Toast from '../UI/Toast'
import './Login.css'
import { recoveryCodesMatch } from '../../security/vaultCrypto'

export default function RecoveryCode({ code, title, message, onContinue }) {
  const [copied, setCopied] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  async function copyCode() { try { await navigator.clipboard.writeText(code); setCopied(true) } catch { setCopied(false) } }
  function downloadCode() {
    const blob = new Blob([`Spendwise recovery code\n\n${code}\n\nKeep this file private. Anyone with this code and your email can reset your password.\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'spendwise-recovery-code.txt'
    link.click()
    URL.revokeObjectURL(url)
  }
  function confirmSaved() {
    if (!recoveryCodesMatch(confirmation, code)) {
      setError('The code does not match. Copy the complete text code and try again.')
      return
    }
    onContinue()
  }
  return <main className="auth-page"><div className="login-theme-toggle"><ThemeToggle /></div><section className="auth-card recovery-card"><div className="recovery-check">✓</div><h1>{title}</h1><p>{message}</p><div className="recovery-code" aria-label="Recovery code">{code}</div><div className="recovery-actions"><Button variant="secondary" onClick={copyCode}>{copied ? 'Copied' : 'Copy code'}</Button><Button variant="secondary" onClick={downloadCode}>Download text file</Button></div><Toast message={copied ? 'Recovery code copied.' : ''} type="success" onClose={() => setCopied(false)} /><div className="recovery-warning"><strong>Keep this code private.</strong><span>Use copied text or the downloaded file. Screenshots and OCR can change characters.</span><span>Anyone with this code and your email can reset your password.</span></div><label className="recovery-confirm-label" htmlFor="recovery-confirm">Paste the complete code to confirm you saved it</label><input id="recovery-confirm" className="recovery-confirm" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError('') }} autoComplete="off" spellCheck={false} /><Toast message={error} type="error" onClose={() => setError('')} /><Button size="large" onClick={confirmSaved}>Confirm and continue</Button></section></main>
}
