'use client'

import Link from 'next/link'
import { useGlitch } from '@/components/glitch/GlitchProvider'
import { useScramble } from '@/components/glitch/useScramble'
import { Container } from '@/components/ui/Container'
import { Rule } from '@/components/ui/Rule'

/**
 * The decoy.
 *
 * This is the page an explorer hits most — it is what `/[slug]` renders for a
 * slug that resolves to nothing, and what every unrouted path falls through to.
 * So it has two jobs and the second one is the one that matters:
 *
 * 1. Look deliberate. A browser-default 404 reads as a broken site, and a broken
 *    site is a thing people poke at. A dead channel reads as the piece working
 *    as intended, which is the answer that sends someone back to the clue card.
 * 2. **Say nothing about what does exist.** No "chamber not found", no "check
 *    your code", no "try the other suits" — every one of those confirms the
 *    shape of what is there. "Nothing is transmitting on this address" is about
 *    this address alone, and is the same sentence whether the visitor typed
 *    `/.env` or came one character away from a real slug.
 *
 * `noindex` comes from the root layout; `not-found.js` cannot export metadata of
 * its own. The 404 status code is set by the framework, not here.
 */

const HEADLINE = 'NO SIGNAL'

export default function NotFound() {
  const { reducedMotion } = useGlitch()
  const headline = useScramble(HEADLINE, { enabled: !reducedMotion })

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-16 text-center">
      <Container className="flex flex-col items-center">
        <p className="font-mono text-xs tracking-[0.35em] text-muted uppercase">Error 404</p>

        {/* aria-label pins the accessible name to the real words — without it a
            screen reader that happens to read during the first 700ms reads the
            scrambled glyphs instead. Same reason as the landing hero. */}
        <h1 aria-label={HEADLINE} className="mt-6 font-display text-display uppercase">
          {headline}
        </h1>

        {/* Width goes on the wrapper, not on Rule. `cn` joins rather than merges
            (lib/cn.js), so a `w-16` passed in would sit alongside Rule's `w-full`
            and the winner would be whichever Tailwind emitted last. */}
        <div className="mt-8 w-16">
          <Rule tone="accent" />
        </div>

        <p className="mt-8 max-w-[34ch] text-lg">Nothing is transmitting on this address.</p>

        {/* The one link on the site. It costs nothing — `/` is public and says
            nothing — and an explorer who reaches a dead channel with no way back
            is an explorer who reloads and retries instead of leaving. */}
        <Link
          href="/"
          className="mt-10 inline-flex min-h-[52px] touch-manipulation items-center justify-center border border-rule px-6 font-mono text-xs tracking-[0.25em] text-fg uppercase select-none transition-colors active:border-accent active:text-accent-text"
        >
          Return to the surface
        </Link>
      </Container>
    </main>
  )
}
