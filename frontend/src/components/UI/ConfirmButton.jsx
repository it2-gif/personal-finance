import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'
import './ConfirmButton.css'

export default function ConfirmButton({
  children,
  title,
  message,
  onConfirm,
  confirmLabel = 'Confirm',
  className = '',
  disabled = false,
  ...buttonProps
}) {
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const triggerRef = useRef(null)
  const cancelRef = useRef(null)
  const titleId = useId()
  const messageId = useId()

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus()
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !working) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, working])

  async function confirm() {
    setWorking(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        {...buttonProps}
        className={className}
        variant={buttonProps.variant || 'secondary'}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      {open && createPortal(
        <div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!working) { setOpen(false); triggerRef.current?.focus() } }}>
          <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} onMouseDown={(event) => event.stopPropagation()}>
            <span className="confirm-icon" aria-hidden="true">!</span>
            <h2 id={titleId}>{title}</h2>
            <p id={messageId}>{message}</p>
            <div className="confirm-actions">
              <Button ref={cancelRef} variant="secondary" disabled={working} onClick={() => { setOpen(false); triggerRef.current?.focus() }}>Cancel</Button>
              <Button variant="danger" loading={working} onClick={confirm}>{confirmLabel}</Button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}
