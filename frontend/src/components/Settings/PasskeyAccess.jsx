import { useState } from 'react'
import { disablePasskeyUnlock, enablePasskeyUnlock, getVaultSession } from '../../security/vaultSession'
import Button from '../UI/Button'
import Card from '../UI/Card'
import Toast from '../UI/Toast'

export default function PasskeyAccess({ user }) {
  const [enabled, setEnabled] = useState(() => Boolean(getVaultSession().envelope.passkey_envelope))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function enable() {
    setSaving(true); setError(''); setMessage('')
    try {
      await enablePasskeyUnlock(user)
      setEnabled(true)
      setMessage('Biometric unlock is ready on this device.')
    } catch (requestError) {
      setError(requestError.message || 'Could not enable biometric unlock. Continue using your password.')
    } finally { setSaving(false) }
  }

  async function disable() {
    setSaving(true); setError(''); setMessage('')
    try {
      await disablePasskeyUnlock()
      setEnabled(false)
      setMessage('Biometric unlock was removed. Your password still works.')
    } catch (requestError) {
      setError(requestError.message || 'Could not remove biometric unlock.')
    } finally { setSaving(false) }
  }

  return (
    <Card className="password-card" aria-labelledby="passkey-heading">
      <div><h2 id="passkey-heading">Face ID or fingerprint</h2><p>Your operating system verifies you. Spendwise never receives biometric data.</p></div>
      <Toast message={error} type="error" onClose={() => setError('')} />
      <Toast message={message} type="success" onClose={() => setMessage('')} />
      {enabled
        ? <Button variant="secondary" onClick={disable} loading={saving}>Remove biometric unlock</Button>
        : <Button onClick={enable} loading={saving}>Enable biometric unlock</Button>}
    </Card>
  )
}
