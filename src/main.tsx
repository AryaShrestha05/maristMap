import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ClickSpark from './components/ClickSpark'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* sparks on every button in the app */}
    <ClickSpark
      sparkColor="#fff"
      shape="line"
      sparkCount={8}
      sparkSize={14}
      sparkRadius={30}
      duration={500}
      selector="button, [role='switch'], [role='option']"
      autoContrast
    >
      <App />
    </ClickSpark>
  </StrictMode>
)
