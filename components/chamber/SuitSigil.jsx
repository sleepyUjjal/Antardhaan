import { cn } from '@/lib/cn'
import { Club } from './sigils/Club'
import { Diamond } from './sigils/Diamond'
import { Heart } from './sigils/Heart'
import { Joker } from './sigils/Joker'
import { Spade } from './sigils/Spade'

/**
 * Suit key to drawn sigil.
 *
 * Keyed by the database enum values, not by `SUITS` in lib/suits.js — that file
 * carries a text glyph per suit for labels and the OG image, and a glyph is the
 * wrong thing to draw at hero scale on a phone (the four card glyphs render at
 * wildly different optical weights, and `★` is a font's idea of a joker, not a
 * drawn one).
 */
const SIGILS = {
  SPADES: Spade,
  CLUBS: Club,
  DIAMONDS: Diamond,
  HEARTS: Heart,
  JOKER: Joker,
}

/**
 * The chamber's hero mark.
 *
 * `fill="currentColor"` is what makes it participate in the mode flip: the
 * colour comes from the `text-*` class on the caller's `className`, so the sigil
 * inverts with the page instead of needing a rule per mode. That also means the
 * caller picks the colour — and it should pick `text-fg`, not `text-accent`.
 * Maroon on ink is 1.8:1 (see the note on `--accent-text` in globals.css), and a
 * hero mark that disappears every few seconds is worse than a plain one.
 *
 * `aria-hidden` because the suit's name is the `<h1>` next to it. A screen
 * reader announcing "black spade suit" as the page heading would be worse than
 * the word.
 */
export function SuitSigil({ suit, className }) {
  const Sigil = SIGILS[suit]

  // An enum value with no sigil means the schema and this map have drifted. A
  // missing hero mark is survivable mid-event; a thrown render is not.
  if (!Sigil) return null

  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn('block', className)}
    >
      <Sigil />
    </svg>
  )
}
