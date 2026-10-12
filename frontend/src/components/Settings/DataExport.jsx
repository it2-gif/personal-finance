import { useState } from 'react'
import { getUnlockedVault } from '../../security/vaultSession'
import Toast from '../UI/Toast'
import Button from '../UI/Button'
import Card from '../UI/Card'
import './DataExport.css'

export default function DataExport() {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

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

  return (
    <Card className="export-card" aria-labelledby="export-heading">
      <div>
        <h2 id="export-heading">Download your data</h2>
      <p>A readable JSON copy decrypted only on this device.</p>
      </div>
      <Toast message={error} type="error" onClose={() => setError('')} />
      <Button onClick={download} loading={downloading}>Download decrypted export</Button>
      <p className="export-note">Keep this file private. Unlike your server vault, the downloaded copy is not encrypted.</p>
    </Card>
  )
}
