import './globals.css'

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
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-mode="bad">
      <body>{children}</body>
    </html>
  )
}
