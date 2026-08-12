import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import App from '@/App.jsx'
import { installLinkPrefetch } from '@/lib/design/prefetch'
import '@/index.css'

// One delegated listener warms the chunk for any in-app link the user points at, anywhere in
// the app — including pages this build's owners never touched. It is capture-phase, passive
// and read-only, so it cannot interfere with React's handlers or with a link's default
// behaviour, and it opts out entirely on Save-Data and 2g connections. The nav components
// also wire explicit handlers, so prefetch survives even if this global hook is ever removed.
installLinkPrefetch()

ReactDOM.createRoot(document.getElementById('root')).render(
  // `disableTransitionOnChange` suppresses the CSS transitions that would otherwise animate
  // every themed surface at once during a theme flip — the flash reads as a rendering bug
  // rather than as a state change, and no information is carried by that half-second.
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
    <App />
  </ThemeProvider>
)
