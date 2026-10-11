import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'
import './Toast.css'

export default function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    if (!message) return undefined
    const timer = window.setTimeout(onClose, type === 'error' ? 7000 : 4500)
    return () => window.clearTimeout(timer)
  }, [message, onClose, type])

  if (!message) return null

  return createPortal(
    <div className={`toast toast-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span className="toast-mark" aria-hidden="true">{type === 'error' ? '!' : '✓'}</span>
      <p>{message}</p>
      <Button variant="ghost" size="small" onClick={onClose} aria-label="Close message">×</Button>
    </div>,
    document.body,
  )
}
