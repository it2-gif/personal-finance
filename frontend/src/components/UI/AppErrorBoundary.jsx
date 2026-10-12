import { Component } from 'react'
import Button from './Button'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    window.dispatchEvent(new CustomEvent('spendwise:client-error', { detail: { name: error?.name || 'Error' } }))
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="center-state"><section className="fatal-error" role="alert"><img className="brand-icon" src="/icons/spendwise-192.png" alt="" /><h1>Spendwise needs to reload</h1><p>Your encrypted vault has not been erased. Reload the app and unlock it again.</p><Button onClick={() => window.location.reload()}>Reload Spendwise</Button></section></main>
  }
}
