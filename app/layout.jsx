import { Anton, Archivo, JetBrains_Mono } from 'next/font/google'
import { GlitchOverlay } from '@/components/glitch/GlitchOverlay'
import { GlitchProvider } from '@/components/glitch/GlitchProvider'
import './globals.css'

// Self-hosted at build time, so no runtime request to Google and no layout
// shift. The variables are read by the --font-* tokens in globals.css.
const display = Anton({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-anton',
  display: 'swap',
})

const body = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

// metadataBase is what makes the OG image URL absolute. It falls back to
// localhost rather than throwing, because a missing env var should not break
// the build — but note the consequence: if NEXT_PUBLIC_SITE_URL is not set in
// Vercel *before* the production build, the deployed OG tags point at
// localhost. It is one of the four vars in C16.
function siteUrl() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
  } catch {
    return new URL('http://localhost:3000')
  }
}

export const metadata = {
  metadataBase: siteUrl(),
  title: { default: 'Antardhaan', template: '%s · Antardhaan' },
  description: 'An internal game event for Mridang 2k26.',
}

// viewportFit: 'cover' is what makes env(safe-area-inset-*) resolve to real
// values on notched phones. Without it those insets are always 0.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0b0c',
}

export default function RootLayout({ children }) {
  return (
    // data-mode="bad" here is the server-rendered default so the first paint is
    // already correct. GlitchProvider takes ownership of the attribute on mount.
    <html
      lang="en"
      data-mode="bad"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        <GlitchProvider>
          {/* The overlay sits outside .glitch-content on purpose — see
              GlitchOverlay.jsx for why that ordering is load-bearing. */}
          <div className="glitch-content">{children}</div>
          <GlitchOverlay />
        </GlitchProvider>
      </body>
    </html>
  )
}
