import Button from '../UI/Button'
import ThemeToggle from '../UI/ThemeToggle'
import InstallWidget from './InstallWidget'
import './Login.css'

export default function LandingPage({ onNavigate }) {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><img className="brand-icon" src="/icons/spendwise-192.png" alt="" /><span>Spendwise</span></button>
        <nav aria-label="Public navigation"><a href="#features">Features</a><a href="#security">Security</a></nav>
        <div className="landing-actions"><ThemeToggle /><Button variant="ghost" onClick={() => onNavigate('/login')}>Sign in</Button><Button onClick={() => onNavigate('/signup')}>Get started</Button></div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="eyebrow-pill">A calmer way to manage money</span>
            <h1>Know where your money goes. Plan what comes next.</h1>
            <p>Track accounts, everyday spending, transfers, and credit-card payments in one clear private workspace.</p>
            <div className="hero-actions"><Button size="large" onClick={() => onNavigate('/signup')}>Create free account</Button><Button size="large" variant="secondary" onClick={() => onNavigate('/login')}>Sign in</Button></div>
            <div className="hero-trust" aria-label="Product qualities"><span>✓ Simple setup</span><span>✓ End-to-end encrypted</span><span>✓ Password recovery code</span></div>
          </div>

          <div className="product-preview" aria-label="Example personal finance dashboard">
            <div className="preview-top"><img className="preview-logo" src="/icons/spendwise-192.png" alt="" /><span>Overview</span><span className="preview-dot" /></div>
            <div className="preview-balance"><small>Total balance</small><strong>EGP 24,850</strong><span>Across 3 accounts</span></div>
            <div className="preview-metrics"><div><small>Income</small><strong className="positive">+ 8,200</strong></div><div><small>Spending</small><strong>− 3,460</strong></div><div><small>Net this month</small><strong className="positive">+ 4,740</strong></div></div>
            <div className="preview-chart" aria-hidden="true">{[35, 48, 42, 68, 58, 76, 88, 72, 91].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
            <div className="preview-accounts"><span><i className="account-cash" />Cash</span><strong>3,250</strong><span><i className="account-bank" />Bank</span><strong>21,600</strong></div>
          </div>
        </section>

        <section className="landing-section" id="features">
          <div className="section-heading"><span>Everything in its place</span><h2>Built for real everyday money decisions</h2><p>A focused toolkit that keeps the details useful without making finance feel complicated.</p></div>
          <div className="feature-grid"><article><span className="feature-icon">↕</span><h3>Income and spending</h3><p>Record entries, search your history, and understand your net position for any period.</p></article><article><span className="feature-icon">▣</span><h3>Accounts and cards</h3><p>Keep cash, bank balances, credit limits, card debt, and available credit clear.</p></article><article><span className="feature-icon">⇄</span><h3>Transfers that reconcile</h3><p>Move money or pay a card without incorrectly counting it as new income or spending.</p></article></div>
        </section>

        <section className="workflow-section">
          <div className="workflow-copy"><span>Clear by design</span><h2>Your financial picture in three simple steps</h2><p>Set up the accounts you already use, record activity as it happens, then review the dashboard when you need clarity.</p></div>
          <ol className="workflow-list"><li><span>01</span><div><h3>Add your accounts</h3><p>Cash, bank accounts, and credit cards each use the right balance rules.</p></div></li><li><span>02</span><div><h3>Record activity</h3><p>Save income, expenses, transfers, purchases, refunds, fees, and payments.</p></div></li><li><span>03</span><div><h3>Review and adjust</h3><p>See summaries and correct mistakes while keeping a trustworthy history.</p></div></li></ol>
        </section>

        <section className="security-section" id="security">
          <div><span className="security-mark">✓</span><span className="section-kicker">Privacy and recovery</span><h2>Your financial records are encrypted before they leave your device.</h2></div>
          <div className="security-points"><p><strong>Encrypted vault</strong>The server stores ciphertext, not readable account names, balances, entries, or transfers.</p><p><strong>Private unlock</strong>Use your password or optional operating-system Face ID, fingerprint, Touch ID, or Windows Hello.</p><p><strong>Recovery without email</strong>Your private recovery code can unlock and re-protect the same vault if you forget your password.</p></div>
        </section>

        <section className="landing-cta"><span>Start with a clearer view</span><h2>Your money deserves a workspace that feels simple.</h2><p>Create an account in a minute. You can add your first account when you are ready.</p><Button size="large" onClick={() => onNavigate('/signup')}>Create your account</Button></section>
      </main>

      <footer className="landing-footer"><div className="landing-brand"><img className="brand-icon" src="/icons/spendwise-192.png" alt="" /><span>Spendwise</span></div><p>Clear tools for everyday money.</p><div className="footer-links"><button onClick={() => onNavigate('/privacy')}>Privacy</button><button onClick={() => onNavigate('/terms')}>Terms</button><button onClick={() => onNavigate('/security')}>Security</button><button onClick={() => onNavigate('/support')}>Support</button><button onClick={() => onNavigate('/login')}>Sign in</button></div></footer>
      <InstallWidget />
    </div>
  )
}
