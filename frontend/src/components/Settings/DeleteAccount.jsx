import { useState } from 'react'
import { apiRequest } from '../../api'
import Button from '../UI/Button'
import Card from '../UI/Card'
import Toast from '../UI/Toast'

export default function DeleteAccount({ onDeleted }) {
  const [password, setPassword] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function remove(event) {
    event.preventDefault()
    if (deleting) return
    setDeleting(true); setError('')
    try {
      await apiRequest('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) })
      onDeleted()
    } catch (requestError) {
      setError(requestError.message || 'Could not delete the account.')
    } finally { setDeleting(false) }
  }

  return (
    <Card className="password-card" aria-labelledby="delete-account-heading">
      <div><h2 id="delete-account-heading">Delete account</h2><p>Permanently remove your login and encrypted vault. This cannot be undone.</p></div>
      <Toast message={error} type="error" onClose={() => setError('')} />
      {!confirming
        ? <Button variant="danger" onClick={() => setConfirming(true)}>Delete my account</Button>
        : <form onSubmit={remove}><label htmlFor="delete-account-password">Confirm your password</label><input id="delete-account-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={128} disabled={deleting} /><div className="statement-actions"><Button type="submit" variant="danger" loading={deleting}>Permanently delete</Button><Button variant="secondary" onClick={() => { setConfirming(false); setPassword(''); setError('') }} disabled={deleting}>Cancel</Button></div></form>}
    </Card>
  )
}
