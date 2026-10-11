import { useEffect, useState } from 'react'
import { apiRequest } from '../../api'
import Login from './Login'
import Signup from './Signup'

export default function AuthScreen({ onLogin, sessionNotice = '' }) {
  const [mode, setMode] = useState('login')
  const [signupOpen, setSignupOpen] = useState(false)
  const [notice, setNotice] = useState(sessionNotice)

  useEffect(() => {
    let active = true
    apiRequest('/auth/registration-status', { skipAuthEvent: true })
      .then((result) => {
        if (active) setSignupOpen(result.signup_open)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  if (mode === 'signup' && signupOpen) {
    return (
      <Signup
        onBack={() => setMode('login')}
        onCreated={() => {
          setSignupOpen(false)
          setMode('login')
          setNotice('Account created successfully. Sign in to continue.')
        }}
      />
    )
  }

  return (
    <Login
      notice={notice}
      onNoticeClose={() => setNotice('')}
      onLogin={onLogin}
      signupOpen={signupOpen}
      onCreateAccount={() => setMode('signup')}
    />
  )
}
