'use client'

import { GlitchText } from '@/components/glitch/GlitchText'
import { useGlitch } from '@/components/glitch/GlitchProvider'
import { useScramble } from '@/components/glitch/useScramble'
import { HeroFigure } from './HeroFigure'

const LOCKUP = 'ANTARDHAAN'

/**
 * The lockup, and the figure standing in front of it.
 *
 * Everything decorative behind them — the jaali, the halftone screen, the suit
 * glyphs — lives in <HeroGround>, which the page passes in as `children`. That
 * is not tidying: this file is the only reason the landing page ships any
 * JavaScript at all, and the whole ground used to ride in the client bundle in
 * order to be positioned by inline styles that never change.
 *
 * `children` and not an import. A client module's imports join the client
 * bundle; a slot handed down from a server component does not. Importing
 * HeroGround here would have moved the decoration back into the bundle while
 * looking, in this file, exactly like it had been taken out.
 *
 * <HeroFigure> IS imported, and that is deliberate rather than an oversight.
 * The rule above is about weight, and HeroFigure is one <img> — there is no
 * logic in it to ship. Passing it down as a second slot would have been
 * ceremony that bought nothing and made the paint order harder to read, which
 * is the thing that actually matters here: ground, then lockup, then figure,
 * because the figure is in front.
 */
export function Hero({ children }) {
  const { reducedMotion } = useGlitch()
  const lockup = useScramble(LOCKUP, { enabled: !reducedMotion })

  return (
    // `isolate` is here so the two z-indexes in this section are compared
    // against each other and nothing else. `position: relative` alone does not
    // create a stacking context, so without it the lockup's 0 and the figure's
    // 10 would be ranked against every other positioned element on the page —
    // and a z-index in EventMeta or the footer could land between them. It was
    // originally added for mix-blend-mode, which is gone; it is still doing the
    // job it does here, which is containment.
    //
    // `bg-bg` is the hero's own ground rather than a blend backdrop. bad mode
    // is the default, so this section is ink and the figure on it is inverted
    // to match; the section paints its own colour instead of letting the body
    // show through, which is what makes that flip self-contained.
    //
    // overflow-hidden is load-bearing. The ghost glyphs are deliberately
    // offset past all four edges and the lockup runs most of the width of the
    // screen — either one would widen the document and give a phone horizontal
    // scroll. Clipping here is what makes the mark bleed off the page instead
    // of stretching it.
    //
    // No `display: flex`. Every child is absolutely positioned, so a flex
    // container has nothing to lay out — the class that mattered was `flex-1`
    // on the section itself, which sizes it against the page column and is
    // kept. `flex` alongside it only read as though it were doing something.
    //
    // `hero-stage` carries the one number the composition is built from, the
    // figure's height as a share of this section. Both the figure and the
    // lockup read it; globals.css explains why they share it rather than each
    // picking their own percentage.
    <section className="hero-stage relative isolate flex-1 overflow-hidden bg-bg">
      {children}

      {/* The lockup is positioned rather than laid out, and it is the one thing
          here that is: its distance from the bottom is derived from the
          figure's height, so it has to be measured against the same box the
          figure is. `.hero-lockup-anchor` in globals.css holds that number.

          NO <Container>, and no fixed cap on the box. The lockup is sized in vw
          and is meant to run most of the width of the screen, so a 68rem
          ceiling would not constrain it — the text would overflow the box and
          centre anyway. The gutter is kept by hand below, which is the only
          part of Container this ever wanted. */}
      <div className="hero-lockup-anchor flex justify-center px-5 sm:px-8">
        {/* aria-label pins the accessible name to the real word. Without it a
            screen reader that happens to read during the first 700ms reads the
            scrambled glyphs instead. GlitchText spreads props through, so this
            lands on the <h1> itself. */}
        <GlitchText as="h1" aria-label={LOCKUP} className="hero-lockup font-display uppercase">
          {lockup}
        </GlitchText>
      </div>

      <HeroFigure />
    </section>
  )
}
