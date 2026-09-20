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
 * The font satori draws `ANTARDHAAN` with, from one of two places.
 *
 * WHY THIS CANNOT COME FROM next/font OR A <link>. Satori renders this card on
 * the build machine, and it needs raw font bytes — next/font hands the browser a
 * **woff2**, which satori cannot read, and a `<link>` to fonts.googleapis.com is
 * a runtime browser request that never reaches the build at all. Whatever else
 * changes about how the site loads its type, something still has to hand this
 * file a font file.
 *
 * So: the vendored copy at `assets/Anton-Regular.ttf` when it is there, and
 * otherwise a download from fonts.googleapis.com. Local first, because a file in
 * the repo costs one `stat` and takes a third-party dependency out of the build;
 * the download is the path for a checkout that has not vendored it, which is the
 * state this repo was actually in — `assets/` was never committed, so the build
 * failed here on every clean checkout with a message telling you to `curl` from
 * raw.githubusercontent.com, a host that may not be reachable.
 *
 * The download asks for TrueType by lying about the browser. Google's CSS API
 * serves woff2 to anything modern and TrueType to a user agent old enough to
 * predate it, and the file's URL is *inside* the CSS it returns rather than
 * something that can be constructed, because the gstatic paths carry a version.
 * Two user agents, so one change at Google's end does not turn a build into a
 * puzzle, and every failure below is a throw with the next step in it.
 *
 * Both fetches pass `cache: 'force-cache'`, and that is load-bearing rather than
 * an optimisation. Next 15 made `no-store` the default for `fetch`, and a
 * `no-store` fetch marks its route dynamic — which would move this render to
 * request time, where `readFileSync` on a repo file is not available and the
 * deployment has no `assets/` directory at all. Caching keeps the route
 * prerendered, which is the only place this file has ever been read.
 */
const FONT_PATH = join(process.cwd(), 'assets', 'Anton-Regular.ttf')

const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Anton&display=swap'

const LEGACY_USER_AGENTS = [
  'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)',
  'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.90 Safari/537.36',
]

// TrueType, OpenType or woff — the three satori reads. Deliberately not woff2:
// matching one would hand satori something it rejects, and the error from inside
// the renderer names neither the format nor the URL.
const FONT_URL = /url\((https:\/\/[^)\s]+\.(?:ttf|otf|woff))\)/

/** The vendored file, or null when it has not been vendored. */
function readVendored() {
  try {
    return readFileSync(FONT_PATH)
  } catch {
    return null
  }
}

/**
 * The CSS, or null. Never throws: a failure here is one attempt failing, and the
 * throw worth reading is the one at the end of `download`, which knows how many
 * attempts there were and that the vendored path was empty.
 */
async function fetchCss(userAgent) {
  try {
    const response = await fetch(FONT_CSS_URL, {
      headers: { 'User-Agent': userAgent },
      cache: 'force-cache',
    })

    return response.ok ? await response.text() : null
  } catch {
    return null
  }
}

async function download() {
  for (const userAgent of LEGACY_USER_AGENTS) {
    const css = await fetchCss(userAgent)
    const url = css ? FONT_URL.exec(css)?.[1] : null
    if (!url) continue

    const response = await fetch(url, { cache: 'force-cache' })

    if (!response.ok) {
      throw new Error(`Google Fonts pointed at ${url}, which answered ${response.status}.`)
    }

    return Buffer.from(await response.arrayBuffer())
  }

  // Loud, early, and with the fix in the message. The alternative — passing an
  // empty font list — is what once produced "No fonts are loaded. At least one
  // font is required to calculate the layout." three layers down inside satori,
  // naming neither the file that was missing nor the command that would produce
  // it. A missing font is a setup error, not a runtime condition, so failing the
  // build is right; failing it unhelpfully is not.
  throw new Error(
    `Could not read Anton from Google Fonts, and there is no copy at ${FONT_PATH}.\n\n` +
      'The build machine needs to reach fonts.googleapis.com and fonts.gstatic.com. Check:\n\n' +
      `  curl -sI '${FONT_CSS_URL}' | head -1\n\n` +
      'Or vendor the font once, after which this download is skipped entirely:\n\n' +
      '  mkdir -p assets\n' +
      "  curl -s 'https://fonts.googleapis.com/css2?family=Anton' \\\n" +
      "    -A 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)' \\\n" +
      "    | grep -oE 'https://[^)]+\\.ttf' | head -1 \\\n" +
      '    | xargs curl -L -o assets/Anton-Regular.ttf\n',
  )
}

let antonCache

async function loadAnton() {
  if (antonCache === undefined) {
    antonCache = readVendored() ?? (await download())
  }
  return antonCache
}

export default async function OpengraphImage() {
  const anton = await loadAnton()

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
