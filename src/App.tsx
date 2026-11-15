import { useEffect, useState } from 'react'
import ThemeSwitch, { type ThemeMode } from './components/ThemeSwitch'

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>('white')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return (
    <div style={{ padding: 24 }}>
      <ThemeSwitch mode={theme} onChange={setTheme} />
    </div>
  )
}
