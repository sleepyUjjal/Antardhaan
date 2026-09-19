/**
 * Suit code and hidden-slug generation.
 *
 * Lives in C5 rather than C6 because the seed is the first thing that needs it,
 * and because two generators would drift — the one that drifts is always the
 * one nobody re-reads.
 *
 * `node:crypto`, not Math.random. These codes are what stands between a
 * stranger and a chamber, and Math.random is seeded from a predictable source
 * and is not designed to be unguessable. `randomInt` is also uniform, which
 * avoids the modulo bias a naive `random() * n | 0` would introduce.
 */

// No 0/O/1/I/L. A code gets read off a clue card and typed into a phone at a
// venue, in the dark, by someone in a hurry; the ambiguous characters cost more
// in support than the two bits of entropy they would add.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // 31 characters

const CODE_LENGTH = 8
const SLUG_LENGTH = 10

function randomFrom(alphabet, length) {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += alphabet[randomInt(alphabet.length)]
  }
  return out
}

/**
 * An 8-character suit code: 31⁸ ≈ 8.5 × 10¹¹ possibilities. §7 has the
 * arithmetic on why that is sufficient with no rate limiting in front of it.
 */
export function generateCode() {
  return randomFrom(ALPHABET, CODE_LENGTH)
}

/**
 * A 10-character slug for `/c/<slug>`: 31¹⁰ ≈ 8.2 × 10¹⁴. Lowercase because
 * these get retyped by hand from a message, and a path is case-sensitive.
 */
export function generateSlug() {
  return randomFrom(ALPHABET.toLowerCase(), SLUG_LENGTH)
}
