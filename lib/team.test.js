import { describe, expect, it } from 'vitest'
import { MAX_TEAM_NAME_LENGTH, parseTeamName } from './team.js'

// Relative import above, not `@/lib/team.js`: the file sits next to what it
// tests, so vitest needs no path-alias resolution.

const slugOf = (raw) => parseTeamName(raw)?.slug
const displayOf = (raw) => parseTeamName(raw)?.displayName

describe('parseTeamName — one team, one row', () => {
  // The case C6 is defined by. If this ever fails, the leaderboard splits a team
  // in two in front of everyone, which is the failure §12 rates as embarrassing
  // rather than loud.
  it('gives "Team  Vortex!" and "team vortex" the same slug', () => {
    expect(slugOf('Team  Vortex!')).toBe('team vortex')
    expect(slugOf('team vortex')).toBe('team vortex')
  })

  it('collapses case, spacing and punctuation alike', () => {
    const aliases = [
      'Team Vortex',
      'team vortex',
      'TEAM VORTEX',
      '  Team   Vortex  ',
      'Team-Vortex',
      'Team.Vortex',
      'Team - Vortex',
      'team, vortex',
      'Team (Vortex)',
    ]

    for (const alias of aliases) {
      expect(slugOf(alias), `"${alias}" should normalize to the same slug`).toBe('team vortex')
    }
  })

  // Apostrophes are the one punctuation mark that is deleted rather than spaced.
  // These two are the same team spelling the same name, and the general rule
  // would have separated them.
  it("does not split Bob's Boys from Bobs Boys", () => {
    expect(slugOf("Bob's Boys")).toBe('bobs boys')
    expect(slugOf('Bobs Boys')).toBe('bobs boys')
    expect(slugOf('Bob’s Boys')).toBe('bobs boys') // the curly apostrophe
  })

  it('folds accents onto their base letters', () => {
    expect(slugOf('Café')).toBe('cafe')
    expect(slugOf('Naïve')).toBe('naive')
    expect(slugOf('Ünïcödé')).toBe('unicode')
    expect(slugOf('Café')).toBe(slugOf('Cafe'))
  })
})

// This block exists because the first version of lib/team.js was wrong here.
// It stripped `\p{M}` — every combining mark in Unicode — which takes the matras
// out of "टीम" and leaves "टम", so two Hindi-named teams could never match each
// other at a Hindi college fest. The fix narrows the fold to marks sitting on a
// Latin base, and these are the tests that hold it narrowed.
describe('parseTeamName — scripts that do not fold', () => {
  it('leaves Devanagari matras intact', () => {
    expect(slugOf('टीम वर्टेक्स')).toBe('टीम वर्टेक्स')
  })

  it('keeps Devanagari and Latin apart rather than transliterating', () => {
    // A known limit, asserted so it stays a decision rather than becoming a
    // surprise: there is no transliteration here, so a team that spells its
    // name one way in each script is two rows.
    expect(slugOf('टीम')).not.toBe(slugOf('team'))
  })

  it('still groups a Devanagari name with its own spacing variants', () => {
    expect(slugOf('टीम  वर्टेक्स')).toBe(slugOf('टीम वर्टेक्स'))
    expect(slugOf('  टीम वर्टेक्स!  ')).toBe(slugOf('टीम वर्टेक्स'))
  })
})

describe('parseTeamName — the display value', () => {
  // team_name is what gets shown, so it keeps what someone actually typed —
  // the accent in "Café", the exclamation in "Team Vortex!". Only stray
  // whitespace is cleaned.
  it('keeps accents and punctuation as typed', () => {
    expect(displayOf('Café')).toBe('Café')
    expect(displayOf('Team  Vortex!')).toBe('Team Vortex!')
  })

  it('trims the ends and collapses runs of spaces', () => {
    expect(displayOf('   Team   Vortex   ')).toBe('Team Vortex')
  })
})

describe('parseTeamName — rejection', () => {
  it('rejects anything that is not a string', () => {
    for (const input of [null, undefined, 42, true, {}, [], Symbol('x')]) {
      expect(parseTeamName(input), `${String(input)} should be rejected`).toBeNull()
    }
  })

  it('rejects empty and whitespace-only names', () => {
    expect(parseTeamName('')).toBeNull()
    expect(parseTeamName('   ')).toBeNull()
    expect(parseTeamName('\n\t ')).toBeNull()
  })

  it('rejects names with nothing left after punctuation is stripped', () => {
    expect(parseTeamName('!!!')).toBeNull()
    expect(parseTeamName('---')).toBeNull()
    expect(parseTeamName('...')).toBeNull()
    expect(parseTeamName('🎉🎉')).toBeNull()
  })

  it('accepts a name that has emoji alongside real words', () => {
    // Emoji are dropped from the slug, not treated as fatal — a name is only
    // rejected when nothing at all survives.
    expect(slugOf('🎉 Party Time')).toBe('party time')
  })
})

describe('parseTeamName — length', () => {
  it('accepts a name of exactly the limit', () => {
    const name = 'a'.repeat(MAX_TEAM_NAME_LENGTH)
    expect(parseTeamName(name)?.slug).toBe(name)
  })

  it('rejects a name one character over', () => {
    expect(parseTeamName('a'.repeat(MAX_TEAM_NAME_LENGTH + 1))).toBeNull()
  })

  // The reason the limit counts code points rather than `.length`. This name is
  // 31 characters to the person who typed it and 56 UTF-16 units to `.length`,
  // so a naive check would reject it for being nearly half again too long.
  it('counts an emoji as one character, not two', () => {
    const name = `${'🎉'.repeat(25)} Party`

    expect(name.length).toBeGreaterThan(MAX_TEAM_NAME_LENGTH)
    expect([...name].length).toBeLessThanOrEqual(MAX_TEAM_NAME_LENGTH)
    expect(slugOf(name)).toBe('party')
  })
})
