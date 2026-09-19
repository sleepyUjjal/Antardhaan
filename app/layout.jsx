import { Anton, Archivo, JetBrains_Mono } from 'next/font/google'
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

export const metadata = {
  title: 'Antardhaan',
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
    // data-mode is hard-coded to 'bad' until C3's oscillator takes it over.
    <html
      lang="en"
      data-mode="bad"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
