import { SUITS } from '@/lib/suits'

/**
 * Everything behind the wordmark, as a server component.
 *
 * It is split out of <Hero> for one reason that is not tidiness. Hero is the
 * only client component on the landing page, and every pixel of this file used
 * to ride in the client bundle so that inline styles which never change could be
 * positioned by JavaScript. None of it is interactive, none of it reads the
 * glitch state, and all of it is paint.
 *
 * WHICH ONLY WORKS BECAUSE app/page.jsx RENDERS IT, not Hero. A client module's
 * imports join the client bundle, so `import { HeroGround } from './HeroGround'`
 * inside Hero.jsx would have compiled this file as a client component and
 * shipped the lot — while looking, in that file, exactly like it had been taken
 * out. The page is a server component and passes this down as children, which
 * is the one arrangement where it is really rendered on the server.
 *
 * Textures only. An earlier pass had a torn halftone field and a corner frame
 * here as well; both are gone, and globals.css records why. What is left is the
 * paper stock — and it is deliberately this quiet, because a figure is coming
 * to sit on top of it and two loud layers cannot share a hero.
 */

/**
 * Suit glyphs as faint marks bleeding off the edges.
 *
 * Placed by hand rather than generated from an index: the arrangement should
 * read as a scatter, not as a row. A row of five glyphs would look like
 * navigation, and nothing on this page navigates anywhere.
 *
 * Every glyph gets its own angle — a hand-placed rotation is what keeps the
 * field feeling thrown rather than set. All five suits sit at roughly the same
 * loudness now: the star and the heart used to carry the field on their own,
 * and the spade, club and diamond have been brought up to match, with a couple
 * of repeats scattered in between so none of the three new suits reads as "the
 * one that is missing".
 *
 * Geometry goes in an inline style rather than an arbitrary-value class. Both
 * would work — these values are literal, so Tailwind would find them — but the
 * inline object keeps the composition readable in one place and sidesteps the
 * source-text scanning trap entirely (C2).
 *
 * Negative offsets are safe because the section clips.
 *
 * These used to be --fg. They are --accent-text now, which is the poster's
 * doing: its corner ornament is dark red, not grey. --accent-text is the
 * mode-correct red in both frames — the lightened #c4576a on ink, maroon itself
 * on paper — so the marks stay red through the flip instead of going muddy in
 * one of the two. Opacities went up to match: the lightened red is dimmer than
 * paper, so the same number would have been a weaker mark than before.
 */
const GHOSTS = [
  { suit: 'SPADES', style: { top: '5%', left: '4%', transform: 'rotate(-16deg)', fontSize: 'clamp(5rem, 24vw, 14rem)', opacity: 0.08 } },
  { suit: 'CLUBS', style: { top: '15%', right: '7%', transform: 'rotate(13deg)', fontSize: 'clamp(4.5rem, 20vw, 12rem)', opacity: 0.07 } },
  {
    suit: 'JOKER',
    style: {
      top: '48%',
      left: '50%',
      transform: 'translate(-50%, -50%) rotate(6deg)',
      fontSize: 'clamp(10rem, 48vw, 30rem)',
      opacity: 0.045,
    },
  },
  { suit: 'HEARTS', style: { bottom: '4%', right: '6%', transform: 'rotate(11deg)', fontSize: 'clamp(5.5rem, 26vw, 16rem)', opacity: 0.09 } },
  { suit: 'DIAMONDS', style: { bottom: '22%', left: '3%', transform: 'rotate(-24deg)', fontSize: 'clamp(5rem, 22vw, 13rem)', opacity: 0.08 } },
  { suit: 'CLUBS', style: { bottom: '40%', left: '20%', transform: 'rotate(19deg)', fontSize: 'clamp(2.5rem, 10vw, 6rem)', opacity: 0.06 } },
  { suit: 'SPADES', style: { top: '40%', right: '13%', transform: 'rotate(-9deg)', fontSize: 'clamp(2.5rem, 9vw, 5.5rem)', opacity: 0.06 } },
  { suit: 'DIAMONDS', style: { top: '9%', left: '32%', transform: 'rotate(27deg)', fontSize: 'clamp(2.5rem, 10vw, 6rem)', opacity: 0.05 } },
]

export function HeroGround() {
  return (
    <>
      {/* aria-hidden and pointer-events-none throughout: decoration that must
          not be read aloud, and must not intercept a tap meant for the page. */}
      <div aria-hidden="true" className="ornament pointer-events-none absolute inset-0" />

      {/* One halftone screen, where the torn field used to be — a printed band
          across the wordmark's middle. Not a composition any more, just the
          tint that says this came off a press: no clipping, no offset quarters,
          no second plate to misregister against.

          --accent-text rather than --accent for the same reason the glyphs
          moved: maroon on ink is 1.8:1 and the screen would disappear in bad
          mode. It is a wash rather than a mark, so the opacity is low enough to
          read as texture in both frames. */}
      <div
        aria-hidden="true"
        className="halftone pointer-events-none absolute inset-x-0 top-[24%] h-[52%] text-accent-text opacity-30"
      />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
        {GHOSTS.map(({ suit, style }, index) => (
          <span
            key={`${suit}-${index}`}
            className="absolute font-display leading-none"
            style={{ ...style, color: 'var(--accent-text)' }}
          >
            {SUITS[suit].glyph}
          </span>
        ))}
      </div>
    </>
  )
}
