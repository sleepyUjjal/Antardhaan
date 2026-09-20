import { describe, expect, it } from 'vitest'
import { isStillRoute } from './glitch.js'

// Relative import above, not `@/lib/glitch.js`, matching lib/team.test.js.

/**
 * C10 only. This file belongs to C12, which adds the tuning-sanitising tests —
 * it is started here rather than there because `isStillRoute` is the first thing
 * in lib/glitch.js whose failure is silent. A predicate that returns the wrong
 * answer does not throw: the admin either keeps flipping colour under a form you
 * are typing into, or the tuning page stops showing the effect you are tuning.
 */
describe('isStillRoute — where the oscillator is held', () => {
  it('holds the admin, including the bare prefix and its login page', () => {
    expect(isStillRoute('/admin')).toBe(true)
    expect(isStillRoute('/admin/login')).toBe(true)
    expect(isStillRoute('/admin/leaderboards')).toBe(true)
  })

  it('leaves the tuning page live, because a held one cannot be tuned', () => {
    expect(isStillRoute('/admin/glitch')).toBe(false)
    expect(isStillRoute('/admin/glitch/anything')).toBe(false)
  })

  // The prefix-boundary case, and the reason `under` compares the whole segment
  // instead of calling startsWith('/admin'). Without it, `/administrator` is held
  // — and so is any chamber slug that happens to begin with the word.
  it('does not hold a route that merely starts with the prefix', () => {
    expect(isStillRoute('/administrator')).toBe(false)
    expect(isStillRoute('/admin-ish')).toBe(false)
    expect(isStillRoute('/adbmin')).toBe(false)
  })

  it('leaves every participant-facing route live', () => {
    expect(isStillRoute('/')).toBe(false)
    expect(isStillRoute('/k3m9xq2p7w')).toBe(false)
    expect(isStillRoute('/standings')).toBe(false)
    expect(isStillRoute('/dev/glitch')).toBe(false)
  })

  // usePathname returns a string in the app router, so this is belt and braces —
  // but a falsy pathname that held would freeze the whole participant site.
  it('fails open on anything that is not a pathname', () => {
    expect(isStillRoute(null)).toBe(false)
    expect(isStillRoute(undefined)).toBe(false)
  })
})
