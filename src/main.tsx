import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { initPwa } from './lib/pwa'
import { initSentry, SentryErrorBoundary } from './lib/sentry'
import { openSharedLink } from './lib/url'

openSharedLink()
initPwa()
initSentry()

function CrashFallback() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">Algo salió mal</h1>
      <p className="text-slate-600">Recarga la página. Si sigue pasando, avísanos.</p>
      <button onClick={() => window.location.reload()} className="rounded-btn bg-brand bg-btn-grad px-6 py-3 font-bold text-white">
        Recargar
      </button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SentryErrorBoundary fallback={<CrashFallback />}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <App />
      </BrowserRouter>
    </SentryErrorBoundary>
  </React.StrictMode>,
)
