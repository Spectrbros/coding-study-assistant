import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import { App } from './App'
import { AppProvider } from './state/AppProvider'
import { I18nProvider } from './i18n/I18nProvider'
import './styles/global.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container is missing in index.html')
}

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </I18nProvider>
  </StrictMode>
)

