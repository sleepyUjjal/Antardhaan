import { ImageResponse } from 'next/og'

export const alt = 'Antardhaan — Mridang 2k26'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const PAPER = '#f2efe9'
const INK = '#0b0b0c'
const MAROON = '#7a0e1e'
const MUTED = '#8a8681'

/**
 * The card a shared link unfurls into, built from the same tokens as the site.
 *
 * It is deliberately, permanently in bad mode. A mode that flips every few
 * seconds has no single frame to freeze, and the void ground is the one that
 * reads on both a light and a dark timeline.
 *
 * next/font self-hosts Anton as woff2, which satori cannot read, so this is a
 * separate fetch of the TTF. It is wrapped on purpose: this route is
 * prerendered at build time, and a network blip during a build should cost the
 * custom face, not the build. satori falls back to its bundled font.
 */
async function loadAnton() {
  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf',
    )
    if (!response.ok) return null
    return await response.arrayBuffer()
  } catch {
    return null
  }
}

export default async function OpengraphImage() {
  const anton = await loadAnton()
  const fonts = anton ? [{ name: 'Anton', data: anton, weight: 400, style: 'normal' }] : []

  return new ImageResponse(
    (
      // satori needs an explicit display on anything with more than one child,
      // and inline styles only — no Tailwind, no CSS variables.
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: INK,
          padding: 72,
          fontFamily: anton ? 'Anton' : 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            letterSpacing: 12,
            color: MAROON,
            fontFamily: 'monospace',
          }}
        >
          MRIDANG 2K26
        </div>

        <div style={{ display: 'flex', fontSize: 168, letterSpacing: -5, color: PAPER, lineHeight: 1 }}>
          ANTARDHAAN
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', height: 4, width: '100%', background: MAROON }} />
          <div
            style={{
              display: 'flex',
              marginTop: 20,
              fontSize: 22,
              letterSpacing: 8,
              color: MUTED,
              fontFamily: 'monospace',
            }}
          >
            AN INTERNAL GAME EVENT
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
