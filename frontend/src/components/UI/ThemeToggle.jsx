import { useEffect, useState } from 'react'
import Button from './Button'
import './ThemeToggle.css'

function initialTheme() {
  try {
    const saved = localStorage.getItem('personal-finance:theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Continue with the device preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try {
      localStorage.setItem('personal-finance:theme', theme)
    } catch {
      // The theme still works for the current page.
    }
  }, [theme])

  return (
    <Button variant="icon" className="theme-toggle" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </Button>
  )
}
