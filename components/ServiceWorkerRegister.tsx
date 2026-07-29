'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        // Registration failures shouldn't break the app — but surface them in the
        // console instead of swallowing silently, since a silent failure here is the
        // only symptom of a broken PWA install prompt.
        console.error('Service worker registration failed:', err)
      })
    }
  }, [])

  return null
}
