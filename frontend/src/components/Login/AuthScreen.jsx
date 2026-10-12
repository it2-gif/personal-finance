import { useEffect, useState } from 'react'
import ForgotPassword from './ForgotPassword'
import LandingPage from './LandingPage'
import Login from './Login'
import RecoveryCode from './RecoveryCode'
import Signup from './Signup'

const publicPaths = new Set(['/', '/login', '/signup', '/forgot-password'])
const currentPath = () => publicPaths.has(window.location.pathname) ? window.location.pathname : '/'

export default function AuthScreen({ onLogin, sessionNotice = '' }) {
  const [path, setPath] = useState(currentPath)
  const [notice, setNotice] = useState(sessionNotice)
  const [recovery, setRecovery] = useState(null)

  useEffect(() => {
    const handlePopState = () => setPath(currentPath())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigate(nextPath) {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (recovery) return <RecoveryCode {...recovery} onContinue={() => {
    if (recovery.user) {
      onLogin(recovery.user)
      return
    }
    setRecovery(null)
    setNotice('Password reset complete. Sign in to unlock your vault.')
    navigate('/login')
  }} />
  if (path === '/login') return <Login notice={notice} onNoticeClose={() => setNotice('')} onLogin={onLogin} onNavigate={navigate} />
  if (path === '/signup') return <Signup onNavigate={navigate} onCreated={(result) => setRecovery({ user: { id: result.id, email: result.email }, code: result.recovery_code, title: 'Save your recovery code', message: 'This code unlocks your encrypted financial vault if you forget your password. Store it somewhere safe and private.' })} />
  if (path === '/forgot-password') return <ForgotPassword onNavigate={navigate} onReset={(result) => setRecovery({ code: result.recovery_code, title: 'Password reset complete', message: 'Your previous recovery code has been replaced. Save this new code before signing in.' })} />
  return <LandingPage onNavigate={navigate} />
}
