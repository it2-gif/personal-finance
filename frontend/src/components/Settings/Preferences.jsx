import { useEffect, useState } from 'react'
import Button from '../UI/Button'
import Card from '../UI/Card'
import StatusBadge from '../UI/StatusBadge'
import ThemeToggle from '../UI/ThemeToggle'
import { apiRequest } from '../../api'
import './Preferences.css'

const sectionOptions = [
  ['overview', 'Overview'],
  ['transactions', 'Transactions'],
  ['accounts', 'Accounts'],
  ['settings', 'Settings'],
]

export default function Preferences({ email }) {
  const [landing, setLanding] = useState(() => localStorage.getItem('personal-finance:landing') || 'overview')
  const [density, setDensity] = useState(() => localStorage.getItem('personal-finance:density') || 'comfortable')
  const [accounts, setAccounts] = useState([])
  const [defaultAccount, setDefaultAccount] = useState(() => localStorage.getItem('personal-finance:default-account') || '')

  useEffect(() => {
    document.documentElement.dataset.density = density
    localStorage.setItem('personal-finance:density', density)
  }, [density])

  useEffect(() => {
    let active = true
    apiRequest('/accounts').then((data) => { if (active) setAccounts(data) }).catch(() => {})
    return () => { active = false }
  }, [])

  function changeLanding(value) {
    setLanding(value)
    localStorage.setItem('personal-finance:landing', value)
  }

  function changeDefaultAccount(value) {
    setDefaultAccount(value)
    if (value) localStorage.setItem('personal-finance:default-account', value)
    else localStorage.removeItem('personal-finance:default-account')
  }

  return (
    <Card className="preferences-card" aria-labelledby="preferences-heading">
      <div className="preferences-heading"><div><h2 id="preferences-heading">Display preferences</h2><p>Saved only in this browser.</p></div><ThemeToggle /></div>
      <div className="preference-row"><div><strong>Layout density</strong><small>Choose how much space appears between records.</small></div><div className="preference-options"><Button size="small" variant={density === 'comfortable' ? 'primary' : 'secondary'} onClick={() => setDensity('comfortable')}>Comfortable</Button><Button size="small" variant={density === 'compact' ? 'primary' : 'secondary'} onClick={() => setDensity('compact')}>Compact</Button></div></div>
      <div className="preference-row"><div><strong>Start page</strong><small>The first page shown after signing in.</small></div><select aria-label="Start page" value={landing} onChange={(event) => changeLanding(event.target.value)}>{sectionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="preference-row"><div><strong>Default account</strong><small>Selected first when adding an entry or transfer.</small></div><select aria-label="Default account" value={defaultAccount} onChange={(event) => changeDefaultAccount(event.target.value)}><option value="">First available account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
      <div className="session-row"><div><strong>Current session</strong><small>{email}</small></div><StatusBadge tone="success">Active</StatusBadge></div>
    </Card>
  )
}
