import { useEffect, useState } from 'react'
import { apiRequest } from './api'
import AccountBalances from './components/AccountBalances/AccountBalances'
import AccountForm from './components/AccountForm/AccountForm'
import Dashboard from './components/Dashboard/Dashboard'
import DashboardInsights from './components/Dashboard/DashboardInsights'
import Login from './components/Login/Login'
import ChangePassword from './components/Settings/ChangePassword'
import DataExport from './components/Settings/DataExport'
import Preferences from './components/Settings/Preferences'
import Statements from './components/Statements/Statements'
import TransactionForm from './components/TransactionForm/TransactionForm'
import TransactionHistory from './components/TransactionHistory/TransactionHistory'
import TransferForm from './components/TransferForm/TransferForm'
import TransferHistory from './components/TransferHistory/TransferHistory'
import Button from './components/UI/Button'
import PageHeader from './components/UI/PageHeader'
import ThemeToggle from './components/UI/ThemeToggle'
import Toast from './components/UI/Toast'
import ConfirmButton from './components/UI/ConfirmButton'
import './App.css'

const sections = [
  { id: 'overview', label: 'Overview', short: 'Home', icon: '⌂' },
  { id: 'transactions', label: 'Transactions', short: 'Entries', icon: '↕' },
  { id: 'accounts', label: 'Accounts & cards', short: 'Accounts', icon: '▣' },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: '⚙' },
]

export default function App() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeSection, setActiveSection] = useState(() => {
    try {
      const saved = localStorage.getItem('personal-finance:landing')
      return sections.some((section) => section.id === saved) ? saved : 'overview'
    } catch {
      return 'overview'
    }
  })
  const [sessionNotice, setSessionNotice] = useState('')

  useEffect(() => {
    let active = true
    async function checkSession() {
      try {
        const currentUser = await apiRequest('/auth/me', { skipAuthEvent: true })
        if (active) setUser(currentUser)
      } catch (requestError) {
        if (active && requestError.status !== 401) setError('Unable to check your session. Please reload to try again.')
      } finally {
        if (active) setChecking(false)
      }
    }
    function handleExpiredSession() {
      if (!active) return
      setUser(null)
      setSessionNotice('Your session expired. Sign in again; unfinished saves remain on this device.')
      setActiveSection('overview')
    }
    window.addEventListener('finance:session-expired', handleExpiredSession)
    checkSession()
    return () => {
      active = false
      window.removeEventListener('finance:session-expired', handleExpiredSession)
    }
  }, [])

  function refreshData() { setRefreshKey((value) => value + 1) }
  function openSection(section) {
    setActiveSection(section)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setError('')
    try {
      await apiRequest('/auth/logout', { method: 'POST' })
      setUser(null)
      setActiveSection('overview')
      setSessionNotice('')
    } catch {
      setError('Unable to sign out. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  if (checking) return <main className="center-state"><p role="status">Checking your session…</p></main>
  if (!user && error) {
    return <main className="center-state"><p role="alert">{error}</p><Button onClick={() => window.location.reload()}>Retry</Button></main>
  }
  if (!user) {
    return <Login notice={sessionNotice} onLogin={(currentUser) => { setUser(currentUser); setSessionNotice('') }} />
  }

  const currentSection = sections.find((section) => section.id === activeSection)

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Button variant="ghost" className="sidebar-brand" onClick={() => openSection('overview')}>
          <span className="brand-mark" aria-hidden="true">PF</span>
          <span><strong>Personal Finance</strong><small>Money, made clearer</small></span>
        </Button>

        <div className="sidebar-label">Workspace</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {sections.map((section) => (
            <Button
              key={section.id}
              variant="ghost"
              className={activeSection === section.id ? 'nav-active' : ''}
              aria-current={activeSection === section.id ? 'page' : undefined}
              onClick={() => openSection(section.id)}
            >
              <span className="nav-icon" aria-hidden="true">{section.icon}</span>
              <span>{section.label}</span>
            </Button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-tools"><span>Appearance</span><ThemeToggle /></div>
          <Button variant="ghost" className="sidebar-profile" onClick={() => openSection('settings')}>
            <span className="profile-avatar" aria-hidden="true">{user.email.slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy"><strong>My account</strong><small>{user.email}</small></span>
          </Button>
          <ConfirmButton variant="ghost" className="sidebar-signout" title="Sign out?" message="Your current session on this device will end." confirmLabel="Sign out" onConfirm={handleLogout} disabled={loggingOut}>Sign out</ConfirmButton>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="mobile-header">
          <div className="mobile-brand"><span className="brand-mark">PF</span><strong>{currentSection?.label}</strong></div>
          <ThemeToggle />
        </header>

        <main className="app-main">
          <Toast message={error} type="error" onClose={() => setError('')} />

          <section className="app-page" hidden={activeSection !== 'overview'}>
            <PageHeader eyebrow="Overview" title="Your financial picture" description="A clear view of your cash, accounts, and recent progress."
              actions={<><Button onClick={() => openSection('transactions')}>+ Add entry</Button><Button variant="secondary" onClick={() => openSection('accounts')}>Move money</Button></>} />
            <Dashboard refreshKey={refreshKey} />
            <DashboardInsights refreshKey={refreshKey} />
            <AccountBalances refreshKey={refreshKey} onChanged={refreshData} />
          </section>

          <section className="app-page" hidden={activeSection !== 'transactions'}>
            <PageHeader eyebrow="Transactions" title="Money in and out" description="Record activity, find entries, and correct mistakes without losing history." />
            <div className="content-grid content-grid-form">
              <TransactionForm key={`transaction-${user.id}`} userId={user.id} refreshKey={refreshKey} onSaved={refreshData} />
              <TransactionHistory refreshKey={refreshKey} onChanged={refreshData} />
            </div>
          </section>

          <section className="app-page" hidden={activeSection !== 'accounts'}>
            <PageHeader eyebrow="Accounts & cards" title="Accounts and payments" description="Add accounts, transfer funds, pay cards, and manage statements." />
            <div className="content-grid">
              <AccountForm key={`account-${user.id}`} userId={user.id} onSaved={refreshData} />
              <TransferForm key={`transfer-${user.id}`} userId={user.id} refreshKey={refreshKey} onSaved={refreshData} />
            </div>
            <Statements refreshKey={refreshKey} onChanged={refreshData} />
            <TransferHistory refreshKey={refreshKey} onChanged={refreshData} />
          </section>

          <section className="app-page" hidden={activeSection !== 'settings'}>
            <PageHeader eyebrow="Settings" title="Account and data" description="Manage your security, exports, and session." />
            <div className="settings-grid">
              <article className="settings-card"><span className="settings-icon">@</span><div><h2>Signed-in account</h2><p>{user.email}</p></div></article>
              <article className="settings-card"><span className="settings-icon">✓</span><div><h2>Protected history</h2><p>Corrections use reversals so your financial history remains clear.</p></div></article>
            </div>
            <Preferences email={user.email} />
            <ChangePassword />
            <DataExport />
            <section className="signout-card"><div><h2>Sign out</h2><p>End this session on this device.</p></div><ConfirmButton variant="danger" title="Sign out?" message="Your current session on this device will end." confirmLabel="Sign out" onConfirm={handleLogout} disabled={loggingOut}>Sign out</ConfirmButton></section>
          </section>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {sections.map((section) => (
          <Button key={section.id} variant="ghost" className={activeSection === section.id ? 'nav-active' : ''} aria-current={activeSection === section.id ? 'page' : undefined} onClick={() => openSection(section.id)}>
            <span className="nav-icon" aria-hidden="true">{section.icon}</span><span>{section.short}</span>
          </Button>
        ))}
      </nav>
    </div>
  )
}
