import { describe, expect, it } from 'vitest'
import { generateSlug } from './code.js'
import {
  RESERVED_SLUGS,
  SLUG_PATTERN,
  SLUG_PROBLEMS,
  isValidSlug,
  normalizeSlug,
  slugProblem,
  slugProblemText,
} from './slug.js'

// Relative imports above, not `@/lib/...`, matching lib/glitch.test.js.
//
// `generateSlug` is imported from lib/code.js on purpose rather than to test it —
// the two modules are coupled and nothing else says so. The seed writes
// `generateSlug()` straight into the `slug` column, and lib/chambers.js serves it
// back through `SLUG_PATTERN`. If a later edit widened the alphabet or changed the
// length, the seed would keep succeeding and the chambers it created would 404.
// The invariant is asserted below instead of being left in a comment in two files.

/**
 * Everything these predicates are allowed to say about a string, and the corpus
 * they are asked about. Collected once because most of the cases below are the
 * same question — "which of these is which" — asked of a different value.
 */
const LEGAL = [
  'a', //          the shortest slug the pattern allows
  'a1',
  'k3m9xq2p7w', //  what lib/code.js actually generates
  'the-mirror', //  the hand-typed kind C13 introduced
  'a--b', //        a doubled interior hyphen, which the pattern permits
  'a'.repeat(64), // the longest slug the pattern allows
]

const WRONG_SHAPE = [
  'A', //           uppercase — normalizeSlug's job, and slugProblem is given it normalised
  '-a', //          leading hyphen
  'a-', //          trailing hyphen
  'a_b', //         underscore
  'a b', //         the interior space autocorrect leaves behind
  'a!b',
  'é',
  'a'.repeat(65), // one past the limit
]

const NOT_A_STRING = [null, undefined, 42, {}, [], true]

describe('normalizeSlug — the one normalisation a slug gets', () => {
  it('lowercases and trims', () => {
    expect(normalizeSlug('  The-Mirror  ')).toBe('the-mirror')
    expect(normalizeSlug('K3M9XQ2P7W')).toBe('k3m9xq2p7w')
  })

  it('leaves an already-normal slug alone', () => {
    expect(normalizeSlug('the-mirror')).toBe('the-mirror')
    expect(normalizeSlug('a')).toBe('a')
  })

  // It does not go further than lowercase-and-trim: an interior space is still
  // there afterwards, and still fails the shape rule. That is the point — the
  // card shows the normalised value it is going to save, and a function that
  // quietly stripped punctuation would be editing someone's slug for them.
  it('does not strip anything else', () => {
    expect(normalizeSlug('the mirror')).toBe('the mirror')
    expect(normalizeSlug('the_mirror')).toBe('the_mirror')
  })

  it('turns anything that is not a string into an empty one', () => {
    for (const value of NOT_A_STRING) expect(normalizeSlug(value)).toBe('')
  })
})

describe('slugProblem — the first rule a slug breaks', () => {
  it('accepts a legal slug', () => {
    for (const slug of LEGAL) expect(slugProblem(slug)).toBeNull()
  })

  it('reports a bad shape', () => {
    for (const slug of WRONG_SHAPE) expect(slugProblem(slug)).toBe('shape')
  })

  it('reports empty for the empty string and for anything that is not one', () => {
    expect(slugProblem('')).toBe('empty')
    for (const value of NOT_A_STRING) expect(slugProblem(value)).toBe('empty')
  })

  // Only reachable with `normalizeSlug` applied first, which is how both callers
  // use it: the admin normalises as you type, and lib/chambers.js only ever sees
  // a URL segment, which is already lowercase.
  it('reports a reserved word as reserved', () => {
    for (const slug of RESERVED_SLUGS) {
      if (SLUG_PATTERN.test(slug)) expect(slugProblem(slug)).toBe('reserved')
    }
  })

  // `_next` is in the set and can never be reported from it: the underscore fails
  // the shape rule first. It is there because the set is documentation as much as
  // it is a check — it is the list of what already lives at the root — and the
  // test pins that reading down so a later edit cannot quietly reorder the checks
  // and start calling it reserved.
  it('catches `_next` by its shape, not by its reservation', () => {
    expect(RESERVED_SLUGS.has('_next')).toBe(true)
    expect(SLUG_PATTERN.test('_next')).toBe(false)
    expect(slugProblem('_next')).toBe('shape')
  })

  // The card switches on this value and the action returns it across the wire, so
  // a fourth problem code invented in one place and not the other would be a
  // sentence that never renders. Stated as a property rather than as a list of
  // cases so it keeps holding for a code that does not exist yet.
  it('never answers with anything outside SLUG_PROBLEMS', () => {
    const corpus = [...LEGAL, ...WRONG_SHAPE, '', ...NOT_A_STRING, ...RESERVED_SLUGS]
    for (const value of corpus) {
      const problem = slugProblem(value)
      expect(problem === null || SLUG_PROBLEMS.includes(problem)).toBe(true)
    }
  })
})

describe('isValidSlug — the same answer, without the reason', () => {
  it('agrees with slugProblem on every case', () => {
    const corpus = [...LEGAL, ...WRONG_SHAPE, '', ...NOT_A_STRING, ...RESERVED_SLUGS]
    for (const value of corpus) expect(isValidSlug(value)).toBe(slugProblem(value) === null)
  })

  it('is true for the legal set and false for everything else', () => {
    for (const slug of LEGAL) expect(isValidSlug(slug)).toBe(true)
    for (const slug of [...WRONG_SHAPE, ...RESERVED_SLUGS]) expect(isValidSlug(slug)).toBe(false)
  })

  // The property the card depends on. It normalises on every keystroke and tests
  // what it is holding, so if normalising could change a valid slug, the value
  // validated and the value saved would be two different strings. They cannot
  // differ: a slug that passes the pattern is already lowercase and already has
  // no leading or trailing whitespace, so normalising it is the identity.
  it('leaves a valid slug unchanged when normalised', () => {
    for (const slug of LEGAL) expect(normalizeSlug(slug)).toBe(slug)
  })
})

describe('slugProblemText — the sentence for a code', () => {
  it('has wording for every problem in SLUG_PROBLEMS', () => {
    for (const problem of SLUG_PROBLEMS) {
      const text = slugProblemText(problem)
      expect(typeof text).toBe('string')
      expect(text.length).toBeGreaterThan(0)
    }
  })

  it('has nothing to say about a slug with no problem', () => {
    expect(slugProblemText(null)).toBeNull()
    expect(slugProblemText(undefined)).toBeNull()
  })

  // An unknown code is not an error here — `slugProblemText` is called with
  // whatever the action returned, and the card falls back to a generic sentence
  // when this gives it null.
  it('has nothing to say about a code it does not know', () => {
    expect(slugProblemText('nonsense')).toBeNull()
  })
})

describe('the generator and the rule agree', () => {
  it('produces a slug that is always valid', () => {
    // A sample rather than one call: the failure this guards against is an
    // alphabet edit, and a single draw could miss a character that only appears
    // one time in thirty-one.
    for (let i = 0; i < 500; i += 1) {
      const slug = generateSlug()
      expect(slugProblem(slug)).toBeNull()
      expect(slug).toBe(normalizeSlug(slug))
    }
  })

  it('never produces a reserved word', () => {
    for (let i = 0; i < 500; i += 1) expect(RESERVED_SLUGS.has(generateSlug())).toBe(false)
  })
})
