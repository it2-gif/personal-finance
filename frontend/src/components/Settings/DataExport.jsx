import { useState } from 'react'
import { getUnlockedVault, getVaultSession, updateVault } from '../../security/vaultSession'
import { serializeEncryptedBackup, unlockEncryptedBackup } from '../../security/vaultBackup'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import Card from '../UI/Card'
import './DataExport.css'

export default function DataExport() {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [backupFile, setBackupFile] = useState(null)
  const [backupPassword, setBackupPassword] = useState('')

  async function download() {
    if (downloading) return
    setDownloading(true)
    setError('')
    try {
      const exportedAt = new Date().toISOString()
      const vault = structuredClone(getUnlockedVault())
      const blob = new Blob([JSON.stringify({ exported_at: exportedAt, ...vault }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `spendwise-export-${exportedAt.slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (requestError) {
      setError(requestError.message || 'Could not download your data.')
    } finally {
      setDownloading(false)
    }
  }

  function downloadEncryptedBackup() {
    setError('')
    const { envelope } = getVaultSession()
    const exportedAt = new Date().toISOString()
    const blob = new Blob([serializeEncryptedBackup(envelope, exportedAt)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `spendwise-encrypted-backup-${exportedAt.slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Encrypted backup downloaded. Keep it with your recovery information.')
  }

  async function restoreEncryptedBackup() {
    if (!backupFile || !backupPassword) return
    if (!window.confirm('Replace the current vault with this backup? Download a current encrypted backup first.')) return
    setDownloading(true)
    setError('')
    setMessage('')
    try {
      const restored = await unlockEncryptedBackup(await backupFile.text(), backupPassword)
      await updateVault((next) => {
        for (const key of Object.keys(next)) delete next[key]
        Object.assign(next, structuredClone(restored.data))
      })
      setBackupFile(null)
      setBackupPassword('')
      setMessage('Encrypted backup restored successfully.')
    } catch (restoreError) {
      setError(restoreError.message === 'This is not a supported Spendwise backup.' || restoreError.message === 'This backup file is not valid JSON.' ? restoreError.message : 'Could not unlock this backup. Check the file and the password used when it was created.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card className="export-card" aria-labelledby="export-heading">
      <div>
        <h2 id="export-heading">Download your data</h2>
      <p>A readable JSON copy decrypted only on this device.</p>
      </div>
      <Toast message={error} type="error" onClose={() => setError('')} />
      <Toast message={message} type="success" onClose={() => setMessage('')} />
      <Button onClick={download} loading={downloading}>Download decrypted export</Button>
      <p className="export-note">Keep this file private. Unlike your server vault, the downloaded copy is not encrypted.</p>
      <div className="backup-divider" />
      <div><h3>Encrypted backup</h3><p>Download a portable encrypted copy for disaster recovery. It still requires the password that was active when the backup was created.</p></div>
      <Button variant="secondary" onClick={downloadEncryptedBackup}>Download encrypted backup</Button>
      <details className="restore-panel"><summary>Restore an encrypted backup</summary><p>This replaces the current vault. Download a current backup first.</p><label htmlFor="backup-file">Backup file</label><input id="backup-file" type="file" accept="application/json,.json" onChange={(event) => setBackupFile(event.target.files?.[0] || null)} /><label htmlFor="backup-password">Backup password</label><input id="backup-password" type="password" autoComplete="current-password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} /><Button variant="danger" onClick={restoreEncryptedBackup} loading={downloading} disabled={!backupFile || !backupPassword}>Restore and replace vault</Button></details>
    </Card>
  )
}
