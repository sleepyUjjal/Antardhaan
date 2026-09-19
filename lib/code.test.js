import { describe, expect, it } from 'vitest'
import { generateCode, generateSlug } from './code.js'

// Written out here rather than imported from lib/code.js, deliberately. This is
// an independent statement of what a code is allowed to contain, so narrowing
// the alphabet in the implementation cannot quietly narrow it here too.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

// The characters left out because they are read off a clue card and typed into a
// phone in the dark: zero against O, one against I and L.
const AMBIGUOUS = '01OIL'

// Enough draws that every character in the alphabet should appear many times
// over, so a missing one is a bug rather than bad luck.
const SAMPLE = 5000

const sample = (fn, count = SAMPLE) => Array.from({ length: count }, fn)

describe('code and slug shape', () => {
  it('generates an 8-character code and a 10-character slug', () => {
    expect(generateCode()).toHaveLength(8)
    expect(generateSlug()).toHaveLength(10)
  })

  it('returns a string every time', () => {
    for (const value of sample(generateCode, 50)) {
      expect(typeof value).toBe('string')
    }
  })

  it('is uppercase for codes and lowercase for slugs', () => {
    // The slug is a URL path segment and paths are case-sensitive, so it has to
    // survive being retyped by hand from a message.
    for (const code of sample(generateCode, 200)) {
      expect(code).toMatch(/^[A-Z0-9]+$/)
    }
    for (const slug of sample(generateSlug, 200)) {
      expect(slug).toMatch(/^[a-z0-9]+$/)
    }
  })
})

describe('code alphabet', () => {
  it('never emits 0, O, 1, I or L', () => {
    const pattern = new RegExp(`[${AMBIGUOUS}]`)

    for (const value of [...sample(generateCode, 2000), ...sample(generateSlug, 2000)]) {
      expect(value, `"${value}" contains an ambiguous character`).not.toMatch(pattern)
    }
  })

  it('draws from all 31 characters, none unreachable', () => {
    // Catches an off-by-one in the index bound — `randomInt(alphabet.length - 1)`
    // would make the last character impossible and be invisible in any single
    // code you happened to look at.
    const seen = new Set()
    for (const code of sample(generateCode, SAMPLE)) {
      for (const character of code) seen.add(character)
    }

    expect([...seen].sort().join('')).toBe([...ALPHABET].sort().join(''))
  })

  it('keeps the ambiguous characters out of the alphabet itself', () => {
    for (const character of AMBIGUOUS) {
      expect(ALPHABET).not.toContain(character)
    }
    expect(ALPHABET).toHaveLength(31)
  })
})

describe('uniqueness', () => {
  // Not a proof of randomness — nothing here could be. It is a smoke test that
  // the generator is not seeded from a constant or returning a cached value,
  // which is the failure mode that would hand every team the same code.
  it('does not repeat a code across a large sample', () => {
    const codes = new Set(sample(generateCode, SAMPLE))
    expect(codes.size).toBe(SAMPLE)
  })

  it('does not repeat a slug across a large sample', () => {
    const slugs = new Set(sample(generateSlug, SAMPLE))
    expect(slugs.size).toBe(SAMPLE)
  })
})
