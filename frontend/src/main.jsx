import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  window.spendwiseInstallPrompt = event
  window.dispatchEvent(new CustomEvent('spendwise:install-ready'))
})

window.addEventListener('appinstalled', () => {
  window.spendwiseInstallPrompt = null
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {})
  })
}
