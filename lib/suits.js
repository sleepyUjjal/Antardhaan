/**
 * Suit presentation.
 *
 * Labels and glyphs are visuals, not data, so they live here rather than in the
 * database (§3) — the database only knows the five enum keys.
 *
 * Safe to import from a client component: nothing in this file is secret. A
 * suit's *slug* and *code* are per-suit data, are read server-side only, and
 * must never be imported here or passed as props (§7).
 */
export const SUIT_KEYS = ['SPADES', 'CLUBS', 'DIAMONDS', 'HEARTS', 'JOKER']

export const SUITS = {
  SPADES: { label: 'Spades', glyph: '♠', order: 1 },
  CLUBS: { label: 'Clubs', glyph: '♣', order: 2 },
  DIAMONDS: { label: 'Diamonds', glyph: '♦', order: 3 },
  HEARTS: { label: 'Hearts', glyph: '♥', order: 4 },
  // The joker has no card glyph that matches the other four, so it borrows the
  // jester's star here. C8 draws a proper sigil for the chamber hero; this one
  // only ever appears as a faint background mark or a label.
  JOKER: { label: 'Joker', glyph: '★', order: 5 },
}

/** The suits in display order, as `{ key, label, glyph, order }`. */
export const SUIT_LIST = SUIT_KEYS.map((key) => ({ key, ...SUITS[key] }))
