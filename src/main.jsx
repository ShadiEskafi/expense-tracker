import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initStoragePersistence } from './services/storagePersistence.js'
import { registerServiceWorker } from './services/serviceWorker.js'

// Initialize persistent storage and offline Service Worker (F020)
initStoragePersistence().catch((err) => {
  console.warn('[StoragePersistence] Initialization warning:', err);
});

registerServiceWorker().catch((err) => {
  console.warn('[ServiceWorker] Registration warning:', err);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
