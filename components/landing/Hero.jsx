'use client'

import { GlitchText } from '@/components/glitch/GlitchText'
import { useGlitch } from '@/components/glitch/GlitchProvider'
import { useScramble } from '@/components/glitch/useScramble'
import { Container } from '@/components/ui/Container'
import { SUITS } from '@/lib/suits'

const LOCKUP = 'ANTARDHAAN'

/**
 * Suit glyphs as faint background marks. Placed by hand rather than generated
 * from an index: the arrangement should read as a composition, not as a row.
 * A row of five glyphs would look like navigation, and nothing on this page
 * navigates anywhere.
 *
 * Geometry goes in an inline style rather than an arbitrary-value class. Both
 * would work — these values are literal, so Tailwind would find them — but the
 * inline object keeps the composition readable in one place and sidesteps the
 * source-text scanning trap entirely (C2).
 *
 * Negative offsets are safe because the section clips: see the comment below.
 */
const GHOSTS = [
  { suit: 'SPADES', style: { top: '-3%', left: '-7%', fontSize: 'clamp(6rem, 30vw, 18rem)', opacity: 0.05 } },
  { suit: 'CLUBS', style: { top: '16%', right: '-9%', fontSize: 'clamp(5rem, 24vw, 14rem)', opacity: 0.04 } },
  {
    suit: 'JOKER',
    style: {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      fontSize: 'clamp(10rem, 48vw, 30rem)',
      opacity: 0.035,
    },
  },
  { suit: 'DIAMONDS', style: { bottom: '2%', left: '-5%', fontSize: 'clamp(5rem, 22vw, 13rem)', opacity: 0.045 } },
  { suit: 'HEARTS', style: { bottom: '-4%', right: '-3%', fontSize: 'clamp(6rem, 26vw, 16rem)', opacity: 0.05 } },
]

export function Hero() {
  const { reducedMotion } = useGlitch()
  const lockup = useScramble(LOCKUP, { enabled: !reducedMotion })

  return (
    // overflow-hidden is load-bearing, not tidiness. The ghost glyphs are
    // deliberately offset past all four edges, and ANTARDHAAN is a single
    // unbreakable word — either one would widen the document and give a phone
    // horizontal scroll. Clipping here is what makes the mark bleed off the
    // page instead of stretching it.
    <section className="relative flex flex-1 items-center overflow-hidden py-24">
      {/* aria-hidden and pointer-events-none: decoration that must not be read
          aloud, and must not intercept a tap meant for the page. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
        {GHOSTS.map(({ suit, style }) => (
          <span
            key={suit}
            className="absolute font-display leading-none"
            style={{ ...style, color: 'var(--fg)' }}
          >
            {SUITS[suit].glyph}
          </span>
        ))}
      </div>

      <Container className="relative">
        {/* aria-label pins the accessible name to the real word. Without it a
            screen reader that happens to read during the first 700ms reads the
            scrambled glyphs instead. GlitchText spreads props through, so this
            lands on the <h1> itself. */}
        <GlitchText as="h1" aria-label={LOCKUP} className="font-display text-display uppercase">
          {lockup}
        </GlitchText>
      </Container>
    </section>
  )
}
