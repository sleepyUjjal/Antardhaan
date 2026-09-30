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
import { randomInt } from 'node:crypto'

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
 * A 10-character slug for `/<slug>`: 31¹⁰ ≈ 8.2 × 10¹⁴. Lowercase because these
 * get retyped by hand from a message, and a path is case-sensitive.
 *
 * Ten characters of a 31-letter alphabet, and it still fits `SLUG_PATTERN` in
 * lib/slug.js with room to spare — that pattern allows up to 64 so that a
 * thematic slug typed by hand in C13 (`the-mirror`) can live alongside these.
 * The alphabet is lowercase letters and digits only, so a generated slug can
 * never be rejected by the shape rule, and never lands on a reserved word.
 */
export function generateSlug() {
  return randomFrom(ALPHABET.toLowerCase(), SLUG_LENGTH)
}

export function normalizeCode(raw) {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : ''
}

export function codeProblem(code) {
  if (typeof code !== 'string' || code === '') return 'empty'
  if (code.length < 4) return 'short'
  if (code.length > 32) return 'long'
  if (!/^[A-Z0-9]+$/.test(code)) return 'shape'
  return null
}

export function codeProblemText(problem) {
  switch (problem) {
    case 'empty': return 'Type a code, or press Generate.'
    case 'short': return 'Code must be at least 4 characters.'
    case 'long': return 'Code cannot be longer than 32 characters.'
    case 'shape': return 'Uppercase letters and digits only.'
    default: return null
  }
}
