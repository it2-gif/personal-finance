import { useState } from 'react'
import { apiUrl } from '../../api'
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
      const response = await fetch(apiUrl('/export'), {
        credentials: 'include',
      })
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('finance:session-expired'))
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.detail || 'Could not prepare your export.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const disposition = response.headers.get('Content-Disposition') || ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'personal-finance.zip'
      link.href = url
      link.download = filename
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
        <p>A ZIP file with accounts, entries, transfers, and card statements.</p>
      </div>
      <Toast message={error} type="error" onClose={() => setError('')} />
      <Button onClick={download} loading={downloading}>Download ZIP</Button>
      <p className="export-note">CSV files open in Excel and use safe text handling.</p>
    </Card>
  )
}
