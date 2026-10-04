// Boots the application with the shared provider boundary at the document root.
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import { AppProviders } from './app/providers.tsx'
import { startPwaUpdates } from './app/pwa-update.ts'
import './index.css'

if ('serviceWorker' in navigator) startPwaUpdates()

createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <App />
  </AppProviders>,
)
