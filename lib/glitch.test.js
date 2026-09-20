import { describe, expect, it } from 'vitest'
import {
  HOLDS,
  PRESETS,
  RANGE_PAIRS,
  TIMING,
  TUNING_DEFAULTS,
  TUNING_RANGES,
  isStillRoute,
  mergeTuning,
  nextSignalLossDelay,
  sanitizeTuning,
} from './glitch.js'

// Relative import above, not `@/lib/glitch.js`, matching lib/team.test.js.

/**
 * The first block came in with C10 and the rest with C12, which is when
 * `sanitizeTuning` was written.
 *
 * Both subjects are here for the same reason: they are the two things in
 * lib/glitch.js whose failure is silent. A predicate that returns the wrong answer
 * does not throw — the admin either keeps flipping colour under a form you are
 * typing into, or the tuning page stops showing the effect you are tuning. And a
 * sanitiser that is wrong does not throw either: it is the boundary between a
 * jsonb column and a CSS custom property on five hundred phones, where every
 * mistake is a value that was applied instead of dropped, or dropped instead of
 * applied, and neither shows up as an error anywhere.
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

describe('sanitizeTuning — the boundary between the column and every screen', () => {
  const LEGAL = {
    minFlipMs: 5000,
    maxFlipMs: 12000,
    tearMs: 300,
    grainOpacity: 0.2,
    scanlineOpacity: 0.4,
  }

  it('passes a legal override through unchanged', () => {
    expect(sanitizeTuning(LEGAL)).toEqual(LEGAL)
  })

  it('clamps to the range at both ends', () => {
    expect(sanitizeTuning({ minFlipMs: 5 }).minFlipMs).toBe(TUNING_RANGES.minFlipMs.min)
    expect(sanitizeTuning({ minFlipMs: 999999 }).minFlipMs).toBe(TUNING_RANGES.minFlipMs.max)
    expect(sanitizeTuning({ grainOpacity: -1 }).grainOpacity).toBe(0)
    expect(sanitizeTuning({ grainOpacity: 50 }).grainOpacity).toBe(0.6)
  })

  // The seconds-scale knobs clamp by the same rule as the milliseconds ones. It is
  // worth a case of its own because the numbers are three orders of magnitude
  // apart, so a clamp that was accidentally written against TIMING's 30000/60000
  // rather than against the range table would still look plausible.
  it('clamps the signal-loss gap to its own range', () => {
    expect(sanitizeTuning({ signalLossMinMs: 1000 }).signalLossMinMs).toBe(
      TUNING_RANGES.signalLossMinMs.min,
    )
    expect(sanitizeTuning({ signalLossMaxMs: 99999999 }).signalLossMaxMs).toBe(
      TUNING_RANGES.signalLossMaxMs.max,
    )
  })

  // The endpoints are legal, which is the difference between a clamp written with
  // Math.min/Math.max and one written with `>`.
  it('keeps a value sitting exactly on the boundary', () => {
    expect(sanitizeTuning({ tearMs: 60 }).tearMs).toBe(60)
    expect(sanitizeTuning({ tearMs: 900 }).tearMs).toBe(900)
  })

  it('drops every key that is not on the allowlist', () => {
    const smuggled = { minFlipMs: 5000, mode: 'good', className: 'x', tearMs: 100, danger: true }
    expect(sanitizeTuning(smuggled)).toEqual({ minFlipMs: 5000, tearMs: 100 })
  })

  // Values that are the right *idea* and the wrong type. `"5000"` is the one that
  // matters — a coercion would accept it silently and the failure it hides is
  // upstream of here.
  it('rejects anything that is not a finite number', () => {
    for (const value of ['5000', null, undefined, true, {}, [], NaN, Infinity, -Infinity]) {
      expect(sanitizeTuning({ tearMs: value })).toEqual({})
    }
  })

  it('returns an empty override for input that is not an object', () => {
    for (const value of [null, undefined, 'tuning', 42, true, []]) {
      expect(sanitizeTuning(value)).toEqual({})
    }
  })

  // The database's own values are always own properties — this is about a caller
  // passing a hand-built object. Nothing is written back to the input, so the
  // pollution cannot spread; the point is only that an inherited number is not a
  // knob.
  it('reads own properties only', () => {
    const inherited = Object.create({ grainOpacity: 0.5 })
    inherited.tearMs = 200
    expect(sanitizeTuning(inherited)).toEqual({ tearMs: 200 })
  })
})

describe('sanitizeTuning — the flip pair', () => {
  it('raises the max when the min is published above it', () => {
    expect(sanitizeTuning({ minFlipMs: 15000, maxFlipMs: 2000 })).toEqual({
      minFlipMs: 15000,
      maxFlipMs: 15000,
    })
  })

  // A single knob cannot be checked against the other one here, because the other
  // one is not present — it is a default, and the sanitiser has never heard of it.
  it('leaves a lone knob alone', () => {
    expect(sanitizeTuning({ minFlipMs: 15000 })).toEqual({ minFlipMs: 15000 })
  })
})

// The second pair, and the reason RANGE_PAIRS is a list rather than two special
// cases. Everything the flip pair does, this pair has to do too — and the failure
// of forgetting it is not an exception, it is a flash that fires on an interval
// running backwards.
describe('sanitizeTuning — the signal-loss pair', () => {
  it('raises the max when the min is published above it', () => {
    expect(sanitizeTuning({ signalLossMinMs: 120000, signalLossMaxMs: 20000 })).toEqual({
      signalLossMinMs: 120000,
      signalLossMaxMs: 120000,
    })
  })

  it('leaves a lone knob alone', () => {
    expect(sanitizeTuning({ signalLossMinMs: 120000 })).toEqual({ signalLossMinMs: 120000 })
  })

  // The pairs are independent. A single loop over RANGE_PAIRS that keyed off the
  // wrong column — or an early return after the first pair — would show up here
  // and nowhere else.
  it('repairs both pairs in one call, independently', () => {
    expect(
      sanitizeTuning({
        minFlipMs: 15000,
        maxFlipMs: 2000,
        signalLossMinMs: 200000,
        signalLossMaxMs: 10000,
      }),
    ).toEqual({
      minFlipMs: 15000,
      maxFlipMs: 15000,
      signalLossMinMs: 200000,
      signalLossMaxMs: 200000,
    })
  })
})

describe('sanitizeTuning — the freeze', () => {
  it('keeps the two legal frames', () => {
    for (const hold of HOLDS) expect(sanitizeTuning({ hold })).toEqual({ hold })
  })

  it('drops anything else, including null', () => {
    for (const hold of ['good-ish', 'GOOD', '', 0, null, true, {}]) {
      expect(sanitizeTuning({ hold })).toEqual({})
    }
  })

  it('carries the freeze alongside the knobs', () => {
    expect(sanitizeTuning({ tearMs: 400, hold: 'bad' })).toEqual({ tearMs: 400, hold: 'bad' })
  })
})

describe('mergeTuning — what a device actually paints with', () => {
  it('fills in every knob from the defaults', () => {
    expect(mergeTuning({})).toEqual(TUNING_DEFAULTS)
  })

  it('lets the stored value win over the default', () => {
    expect(mergeTuning({ tearMs: 800 }).tearMs).toBe(800)
  })

  // The bug this case exists for: `{ minFlipMs: 15000 }` is in range, so the
  // sanitiser passes it, and it only becomes an inverted interval once it meets
  // the default max of 10000. This is the first place both numbers exist.
  it('repairs a lone min that is above the default max', () => {
    const merged = mergeTuning({ minFlipMs: 15000 })
    expect(merged.minFlipMs).toBe(15000)
    expect(merged.maxFlipMs).toBe(15000)
  })

  // Same bug, second pair, and it is easier to hit here: the default max is a
  // whole minute, so any stored min above sixty seconds inverts — and a knob
  // pushed out to two or three minutes is a perfectly ordinary thing to want.
  it('repairs a lone signal-loss min that is above the default max', () => {
    const merged = mergeTuning({ signalLossMinMs: 120000 })
    expect(merged.signalLossMinMs).toBe(120000)
    expect(merged.signalLossMaxMs).toBe(120000)
  })

  it('never invents a freeze', () => {
    expect(mergeTuning({}).hold).toBeUndefined()
    expect(mergeTuning({ hold: 'nonsense' }).hold).toBeUndefined()
  })

  it('survives a null, a string, or a garbage blob', () => {
    for (const value of [null, undefined, 'x', 7, []]) {
      expect(mergeTuning(value)).toEqual(TUNING_DEFAULTS)
    }
  })
})

describe('the shipped numbers are inside the ranges', () => {
  // Catches the mistake this file is really here for: a preset typed by hand into
  // a table nothing else reads. A typo there does not throw anywhere — it is a
  // knob that silently clamps the moment it is published, so the panel shows one
  // number and the room gets another.
  it('every default is within its own clamp', () => {
    for (const [key, range] of Object.entries(TUNING_RANGES)) {
      expect(TUNING_DEFAULTS[key], `${key} default`).toBeGreaterThanOrEqual(range.min)
      expect(TUNING_DEFAULTS[key], `${key} default`).toBeLessThanOrEqual(range.max)
    }
  })

  it('every preset is complete and within its own clamp', () => {
    for (const preset of PRESETS) {
      for (const [key, range] of Object.entries(TUNING_RANGES)) {
        const value = preset.values[key]
        expect(typeof value, `${preset.key}.${key}`).toBe('number')
        expect(value, `${preset.key}.${key}`).toBeGreaterThanOrEqual(range.min)
        expect(value, `${preset.key}.${key}`).toBeLessThanOrEqual(range.max)
      }
    }
  })

  it('every preset has a distinct key and a label to show', () => {
    const keys = PRESETS.map((preset) => preset.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const preset of PRESETS) expect(preset.label).toBeTruthy()
  })

  // Spread rather than referenced, so a preset cannot be mutated into changing
  // the build defaults — and `toEqual` rather than `toBe` for that reason: the
  // claim being tested is that the *numbers* are the same, not that the object is.
  // What the source avoids is a second hand-written copy of them, which no test
  // can catch.
  it('rehearsal is the defaults', () => {
    const [rehearsal] = PRESETS
    expect(rehearsal.key).toBe('rehearsal')
    expect(rehearsal.values).toEqual(TUNING_DEFAULTS)
  })

  // RANGE_PAIRS is now read by three callers — the sanitiser, the merge, and the
  // tuning panel's slider handler — so a typo in it is a pairing rule that has
  // stopped applying everywhere at once, silently, in three places.
  it('every range pair names two keys that are real knobs', () => {
    for (const [low, high] of RANGE_PAIRS) {
      expect(low, 'the pairs are ordered low then high').not.toBe(high)
      for (const key of [low, high]) {
        expect(TUNING_RANGES[key], `${key} in TUNING_RANGES`).toBeDefined()
        expect(typeof TUNING_DEFAULTS[key], `${key} in TUNING_DEFAULTS`).toBe('number')
      }
      expect(TUNING_DEFAULTS[low], `${low} default vs ${high}`).toBeLessThanOrEqual(
        TUNING_DEFAULTS[high],
      )
    }
  })
})

describe('nextSignalLossDelay — the flash gap follows the tuning', () => {
  it('draws from the interval it is given', () => {
    const tuning = { ...TUNING_DEFAULTS, signalLossMinMs: 10000, signalLossMaxMs: 20000 }
    expect(nextSignalLossDelay(tuning, () => 0)).toBe(10000)
    expect(nextSignalLossDelay(tuning, () => 1)).toBe(20000)
  })

  // The regression this case exists for, and the reason the function's signature
  // changed at all. It read TIMING directly while the gap was fixed, and when the
  // gap became a knob the failure of leaving it that way was not a crash: the
  // slider would save to the row, the panel would show the new number, and every
  // device would go on flashing on the old schedule. That looks exactly like a
  // cache that has not expired yet, so the first instinct is to wait.
  it('ignores TIMING once the tuning says otherwise', () => {
    const tuning = { ...TUNING_DEFAULTS, signalLossMinMs: 5000, signalLossMaxMs: 5000 }
    expect(nextSignalLossDelay(tuning, () => 0.5)).toBe(5000)
    expect(tuning.signalLossMinMs).not.toBe(TIMING.signalLossMinMs)
  })

  it('lands inside the clamped range at the build defaults', () => {
    for (const random of [0, 0.5, 1]) {
      const delay = nextSignalLossDelay(TUNING_DEFAULTS, () => random)
      expect(delay).toBeGreaterThanOrEqual(TUNING_RANGES.signalLossMinMs.min)
      expect(delay).toBeLessThanOrEqual(TUNING_RANGES.signalLossMaxMs.max)
    }
  })

  it('does not go backwards through an inverted interval', () => {
    // Still a number either way — which is the whole reason the pairing rule
    // exists rather than a validation error. This asserts the repair reached the
    // value the delay function actually reads, not just the sanitiser's output.
    const tuning = mergeTuning({ signalLossMinMs: 120000 })
    expect(nextSignalLossDelay(tuning, () => 0)).toBeLessThanOrEqual(
      nextSignalLossDelay(tuning, () => 1),
    )
  })
})
