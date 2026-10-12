import Button from '../UI/Button'
import ThemeToggle from '../UI/ThemeToggle'
import './TrustPage.css'

const pages = {
  '/privacy': {
    eyebrow: 'Privacy',
    title: 'Your financial records are designed to remain private.',
    intro: 'Spendwise stores your financial workspace as encrypted ciphertext. The service cannot read your account names, balances, transactions, transfers, statements, or notes.',
    sections: [
      ['Information the service can see', 'Your email address, account creation time, active login sessions, encrypted-vault size and update time, and operational request metadata needed to keep the service reliable.'],
      ['Information the service cannot read', 'Financial records are encrypted in your browser before upload. They are decrypted only after you unlock the vault on your device.'],
      ['Data retention and deletion', 'Your encrypted vault remains until you delete your account. Account deletion removes the user, sessions, and encrypted vault from the active database. Database backups may retain encrypted copies until their retention period expires.'],
      ['Your responsibility', 'Keep your password and recovery code private. A readable export is not encrypted and must be protected separately.'],
    ],
  },
  '/terms': {
    eyebrow: 'Terms',
    title: 'Simple terms for a personal money workspace.',
    intro: 'Spendwise is a record-keeping and budgeting tool. It is not a bank, payment provider, accountant, investment adviser, or financial adviser.',
    sections: [
      ['Your account', 'Provide accurate account information, protect your credentials, and use the service lawfully. You are responsible for entries you record and decisions you make from them.'],
      ['Availability', 'The service may occasionally be unavailable for maintenance, deployment, or events outside reasonable control. Keep an encrypted backup of important records.'],
      ['No financial advice', 'Displays, summaries, and insights are informational. Verify important figures against statements from your financial institutions.'],
      ['Account deletion', 'You may permanently delete your account from Settings. Deletion cannot be undone, and encrypted records cannot be recovered without a separate backup.'],
    ],
  },
  '/security': {
    eyebrow: 'Security',
    title: 'How Spendwise protects your vault.',
    intro: 'Spendwise combines browser-side encryption with password hashing, secure sessions, recovery-code rotation, and optional operating-system biometric unlock.',
    sections: [
      ['End-to-end encrypted vault', 'A random vault key encrypts financial data with authenticated encryption. Password and recovery-code derived keys protect that vault key. The server stores ciphertext and key wrappers, not plaintext financial records.'],
      ['Authentication', 'Passwords are hashed on the server, session tokens are stored as hashes, login attempts are rate limited, and production cookies are Secure and HTTP-only.'],
      ['Important limits', 'Encryption cannot protect an unlocked device, a stolen password or recovery code, malicious browser extensions, or compromised JavaScript delivered from the Spendwise origin. No system can promise absolute security.'],
      ['Report a vulnerability', 'Do not include passwords, recovery codes, tokens, or real financial data in a report. Contact the service operator using the support channel listed on the Support page.'],
    ],
  },
  '/support': {
    eyebrow: 'Support',
    title: 'Get help without exposing private information.',
    intro: 'When asking for help, describe what you were doing and the visible error. Never send your password, recovery code, cookies, encrypted vault, or readable export.',
    sections: [
      ['Account access', 'Use your saved recovery code from “Forgot password.” Spendwise cannot recover a vault when both the password and recovery code are lost.'],
      ['Safe diagnostics', 'Screenshots should hide email addresses and private values. Browser console errors and request status codes are usually enough to diagnose a problem.'],
      ['Contact', 'Before public launch, configure and publish a dedicated support email and expected response time here.'],
      ['Service status', 'Before public launch, link this page to an independent status page covering the frontend, API, database, and backups.'],
    ],
  },
}

export default function TrustPage({ path, onNavigate }) {
  const page = pages[path] || pages['/privacy']
  return <div className="trust-page"><header><button className="landing-brand" onClick={() => onNavigate('/')}><img className="brand-icon" src="/icons/spendwise-192.png" alt="" /><span>Spendwise</span></button><ThemeToggle /></header><main><span className="trust-eyebrow">{page.eyebrow}</span><h1>{page.title}</h1><p className="trust-intro">{page.intro}</p><div className="trust-sections">{page.sections.map(([heading, content]) => <section key={heading}><h2>{heading}</h2><p>{content}</p></section>)}</div><div className="trust-note"><strong>Pre-launch notice</strong><p>These pages describe the current technical design and must be reviewed for the laws and business entity governing the final public service.</p></div><Button onClick={() => onNavigate('/')}>Back to Spendwise</Button></main></div>
}
