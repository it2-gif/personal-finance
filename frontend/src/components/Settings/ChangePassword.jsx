import { useState } from 'react'
import { apiRequest } from '../../api'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import Card from '../UI/Card'
import { getVaultSession, updateVaultEnvelope } from '../../security/vaultSession'
import { rewrapVaultPassword } from '../../security/vaultCrypto'
import './ChangePassword.css'

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (saving) return
    setError('')
    setMessage('')
    if (newPassword !== confirmation) {
      setError('New passwords do not match.')
      return
    }
    setSaving(true)
    try {
      const wrappedPassword = await rewrapVaultPassword(getVaultSession().dataKey, newPassword)
      const result = await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          ...wrappedPassword,
        }),
      })
      await updateVaultEnvelope(wrappedPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      setMessage(result.message)
    } catch (requestError) {
      setError(requestError.message || 'Could not change the password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="password-card" aria-labelledby="password-heading">
      <div>
        <h2 id="password-heading">Change password</h2>
        <p>Other signed-in devices will be signed out.</p>
      </div>
      <Toast message={error} type="error" onClose={() => setError('')} />
      <Toast message={message} type="success" onClose={() => setMessage('')} />
      <form onSubmit={submit}>
        <fieldset disabled={saving}>
          <label htmlFor="current-password">Current password</label>
          <input id="current-password" type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          <label htmlFor="new-password">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        </fieldset>
        <Button type="submit" loading={saving}>Change password</Button>
      </form>
    </Card>
  )
}
