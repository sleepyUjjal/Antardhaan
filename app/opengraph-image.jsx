import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
 * This route is the concrete reason `Referrer-Policy: no-referrer` exists (§7):
 * the tag it serves is on every page including the chambers, so when a chamber
 * link is unfurled by Slack or Discord, that service fetches a public URL with
 * the chamber's own URL as the `Referer`. The header is what stops the slug
 * going with it.
 */

/**
 * Anton, vendored at `assets/Anton-Regular.ttf`.
 *
 * This used to be fetched from raw.githubusercontent.com on every build, under a
 * comment claiming a failed fetch was survivable because "satori falls back to
 * its bundled font". That claim was false, and this is what it cost: satori
 * ships no font of its own, and `new ImageResponse(..., { fonts: [] })` throws
 * *"No fonts are loaded. At least one font is required to calculate the layout."*
 * So the path written to degrade gracefully was instead a build that dies on a
 * network blip — which is what happened on the first clean production build,
 * after earlier builds had simply been lucky with the fetch.
 *
 * Vendored rather than fetched: 50 KB in the repo removes a live third-party
 * dependency from every `next build`, and removes the failure path entirely
 * rather than trying to handle it. next/font self-hosts Anton as woff2, which
 * satori cannot read, so this is a separate copy of the TTF rather than the same
 * file.
 *
 * The read is safe because this route is prerendered — the font is needed on the
 * build machine, where the repo is checked out, not in the deployed runtime. If
 * this ever becomes a dynamic route, the file has to be traced into the
 * deployment (`outputFileTracingIncludes` in next.config.mjs) or it will be
 * missing at request time.
 */
const FONT_PATH = join(process.cwd(), 'assets', 'Anton-Regular.ttf')

let antonCache

function loadAnton() {
  if (antonCache === undefined) {
    try {
      antonCache = readFileSync(FONT_PATH)
    } catch {
      antonCache = null
    }
  }
  return antonCache
}

export default function OpengraphImage() {
  const anton = loadAnton()

  // Loud, early, and with the fix in the message. The alternative — passing an
  // empty font list — is what produced "No fonts are loaded" three layers down
  // inside satori, naming neither the file that was missing nor the command that
  // would produce it. A missing font is a setup error, not a runtime condition,
  // so failing the build is the right answer; failing it unhelpfully is not.
  if (!anton) {
    throw new Error(
      `Missing ${FONT_PATH}. Fetch it once:\n\n` +
        '  mkdir -p assets && curl -L -o assets/Anton-Regular.ttf \\\n' +
        '    https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf\n',
    )
  }

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
          fontFamily: 'Anton',
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
    { ...size, fonts: [{ name: 'Anton', data: anton, weight: 400, style: 'normal' }] },
  )
}
