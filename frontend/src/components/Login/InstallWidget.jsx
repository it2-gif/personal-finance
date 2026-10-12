import { useEffect, useState } from 'react'
import Button from '../UI/Button'

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
const isIOS = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent)

export default function InstallWidget() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    function handlePrompt(event) { event.preventDefault(); setInstallPrompt(event) }
    function handleInstalled() { setInstalled(true); setInstallPrompt(null); setShowGuide(false) }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  async function install() {
    if (!installPrompt) { setShowGuide(true); return }
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setInstallPrompt(null)
  }

  if (installed) return null

  return (
    <>
      <aside className="install-widget" aria-label="Install Spendwise">
        <img src="/icons/spendwise-192.png" alt="" />
        <div><strong>Get Spendwise</strong><span>Install the app on this device</span></div>
        <Button size="small" onClick={install}>Install</Button>
      </aside>

      {showGuide && (
        <div className="install-backdrop" role="presentation" onMouseDown={() => setShowGuide(false)}>
          <section className="install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-title" onMouseDown={(event) => event.stopPropagation()}>
            <img src="/icons/spendwise-192.png" alt="" />
            <span className="section-kicker">Install Spendwise</span>
            <h2 id="install-title">Keep your money workspace one tap away.</h2>
            {isIOS() ? (
              <ol><li>Tap the <strong>Share</strong> button in Safari.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>Tap <strong>Add</strong> to finish.</li></ol>
            ) : (
              <p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
            )}
            <Button onClick={() => setShowGuide(false)}>Got it</Button>
          </section>
        </div>
      )}
    </>
  )
}
