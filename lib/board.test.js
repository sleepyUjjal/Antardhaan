import { describe, expect, it } from 'vitest'
import {
  csvCell,
  defaultSuit,
  overallStandings,
  rankBy,
  suitBoard,
  toCsv,
  withElapsed,
} from './board.js'
import { SUIT_KEYS } from './suits.js'

// Relative imports above, not `@/lib/…`, matching lib/team.test.js and
// lib/glitch.test.js. vitest resolves neither the alias nor .env, which is also
// why lib/board.js exists as a module separate from lib/leaderboard.js: the
// ranking rules had to be testable without a DATABASE_URL.

const [S0, S1, S2, S3, S4] = SUIT_KEYS

const START = '2026-09-20T12:00:00.000Z'
const START_MS = new Date(START).getTime()

/** The instant `seconds` after the event's zero-point. */
function at(seconds) {
  return new Date(START_MS + seconds * 1000)
}

const NAME = {
  alpha: 'Alpha',
  bravo: 'Bravo',
  charlie: 'Charlie',
  delta: 'Delta',
  echo: 'Echo',
  foxtrot: 'Foxtrot',
  golf: 'Golf',
  hotel: 'Hotel',
}

/**
 * Thirty submissions across five chambers, with every expectation below worked
 * out on paper first. This is C14's done-when: "with 30 seeded submissions across
 * 5 suits the ranking matches hand-computed expectations including the tie case".
 *
 * It is built to contain the cases that are easy to get wrong rather than to
 * look like real play:
 *
 *   - **A tie on a chamber board.** S0 has Alpha and Bravo both at 10s, so the
 *     board must read 1, 2, 2, 4 — with nobody in third, because that is what a
 *     shared second place means.
 *   - **A tie in the standings, on both keys.** Echo and Foxtrot both solve three
 *     chambers in 160s, so they share rank 6 and Golf takes 8 with nobody in 7.
 *   - **A team with more chambers but a worse total.** Charlie solves five in 445s
 *     and sits behind Alpha's five in 350s; Delta's four in 275s beat Hotel's four
 *     in 400s. Ordering by one key or the other alone gets these backwards.
 *   - **Teams missing chambers.** Only Alpha has all five, and the standings have
 *     to show that as four gaps for Golf rather than as a list of two.
 *
 * Timestamps repeat across chambers — 45s appears in S0 and in S1 — because two
 * teams solving two different chambers in the same second is ordinary, and
 * inventing distinct values everywhere would make the fixture describe a tidier
 * event than the one this is for. What matters and what the integrity test at the
 * bottom pins is the weaker property: **no team has two rows at the same
 * instant**, which is what lets `overallStandings` resolve a display name from
 * its last row without falling back on iteration order.
 */
const SEED = [
  // suit, team, elapsed seconds
  [S0, 'hotel', 5],
  [S0, 'alpha', 10],
  [S0, 'bravo', 10],
  [S0, 'charlie', 20],
  [S0, 'delta', 25],
  [S0, 'echo', 30],
  [S0, 'foxtrot', 45],

  [S1, 'foxtrot', 25],
  [S1, 'alpha', 30],
  [S1, 'bravo', 40],
  [S1, 'echo', 45],
  [S1, 'charlie', 50],
  [S1, 'delta', 60],

  [S2, 'delta', 50],
  [S2, 'alpha', 60],
  [S2, 'bravo', 70],
  [S2, 'charlie', 80],
  [S2, 'echo', 85],
  [S2, 'hotel', 120],

  [S3, 'alpha', 100],
  [S3, 'bravo', 120],
  [S3, 'charlie', 130],
  [S3, 'delta', 140],
  [S3, 'hotel', 150],
  [S3, 'golf', 200],

  [S4, 'foxtrot', 90],
  [S4, 'hotel', 125],
  [S4, 'alpha', 150],
  [S4, 'charlie', 165],
  [S4, 'golf', 300],
]

/**
 * What lib/leaderboard.js hands to lib/board.js: every row, oldest first. The
 * sort is not decoration — `overallStandings` resolves a team's display name by
 * last-seen, so the caller's order is part of the contract, and the fixture
 * mirrors the query rather than relying on array-literal order.
 */
const SEEDED = withElapsed(
  SEED.map(([suit, teamSlug, seconds]) => ({
    suit,
    teamName: NAME[teamSlug],
    teamSlug,
    submittedAt: at(seconds),
  })).sort((a, b) => a.submittedAt - b.submittedAt),
  START,
)

/** Boards and standings, projected to the tuples the expectations are written in. */
const boards = (rows) => rows.map((row) => [row.teamSlug, row.rank, row.elapsedMs])
const table = (teams) =>
  teams.map((team) => [team.teamSlug, team.rank, team.suitsSolved, team.totalElapsedMs])

describe('rankBy — competition ranks', () => {
  const elapsed = (rows) => rankBy(rows, (previous, current) => previous.ms === current.ms)
  const ms = (...values) => values.map((value) => ({ ms: value }))

  it('leaves a gap behind a tie instead of numbering by index', () => {
    // A tie in the *middle*: two teams share second, so the next entry is
    // fourth and nobody is third. Indexing would answer 1, 2, 3, 4 and tell the
    // team at 20s it came third.
    expect(elapsed(ms(5, 10, 10, 20)).map((row) => row.rank)).toEqual([1, 2, 2, 4])
  })

  // And the other shape, which is easy to conflate with the one above — I did,
  // and wrote this expectation against the wrong input first. A tie at the *top*
  // shares first place, so there is no second at all: 1, 1, 3, 4.
  it('leaves the same gap behind a tie at the top', () => {
    expect(elapsed(ms(10, 10, 20, 30)).map((row) => row.rank)).toEqual([1, 1, 3, 4])
  })

  it('ranks a three-way tie the same way', () => {
    expect(elapsed(ms(5, 5, 5, 9)).map((row) => row.rank)).toEqual([1, 1, 1, 4])
  })

  it('gives everyone first place when everyone is tied', () => {
    expect(elapsed(ms(7, 7, 7)).map((row) => row.rank)).toEqual([1, 1, 1])
  })

  it('ranks a lone row and an empty list', () => {
    expect(elapsed(ms(3)).map((row) => row.rank)).toEqual([1])
    expect(elapsed([])).toEqual([])
  })

  it('numbers a strictly ordered list 1..n', () => {
    expect(elapsed(ms(1, 2, 3, 4)).map((row) => row.rank)).toEqual([1, 2, 3, 4])
  })

  // The returned rows are copies. Callers pass the same shared `rows` array to
  // four different board builders, and a `rank` written onto those objects would
  // leak one board's numbering into the next.
  it('returns copies rather than annotating the caller’s rows', () => {
    const input = ms(10, 20)
    const ranked = elapsed(input)

    expect(input[0]).not.toHaveProperty('rank')
    expect(ranked[0]).not.toBe(input[0])
    expect(ranked[0]).toEqual({ ms: 10, rank: 1 })
  })
})

describe('withElapsed — elapsed is derived, never stored', () => {
  const submission = (overrides) => ({
    suit: S0,
    teamName: 'Alpha',
    teamSlug: 'alpha',
    submittedAt: at(30),
    ...overrides,
  })

  it('measures each solve from the event’s zero-point', () => {
    const [row] = withElapsed([submission()], START)

    expect(row.elapsedMs).toBe(30_000)
    expect(row.submittedAt).toBeInstanceOf(Date)
  })

  it('takes the start time as a Date or an ISO string', () => {
    expect(withElapsed([submission()], new Date(START))[0].elapsedMs).toBe(30_000)
    expect(withElapsed([submission()], START)[0].elapsedMs).toBe(30_000)
  })

  it('takes submittedAt as a Date or an ISO string', () => {
    const asString = submission({ submittedAt: at(30).toISOString() })

    expect(withElapsed([asString], START)[0].elapsedMs).toBe(30_000)
    expect(withElapsed([asString], START)[0].submittedAt).toBeInstanceOf(Date)
  })

  // Submissions are accepted whenever, so moving the start time forward past a
  // solve is reachable. It should look like the mistake it is rather than being
  // clamped into a suspiciously fast time.
  it('goes negative when a solve predates the start time', () => {
    const early = submission({ submittedAt: at(-30) })

    expect(withElapsed([early], START)[0].elapsedMs).toBe(-30_000)
  })

  it('carries the suit, team and slug through unchanged', () => {
    const [row] = withElapsed([submission()], START)

    expect(row.suit).toBe(S0)
    expect(row.teamName).toBe('Alpha')
    expect(row.teamSlug).toBe('alpha')
  })

  it('does not mutate the rows it is given', () => {
    const input = [submission()]
    withElapsed(input, START)

    expect(input[0]).not.toHaveProperty('elapsedMs')
  })

  it('returns nothing for no submissions', () => {
    expect(withElapsed([], START)).toEqual([])
  })
})

describe('suitBoard — one chamber, fastest first', () => {
  it('ranks a chamber and shares the rank of a tie', () => {
    // Alpha and Bravo both at 10s. Ranks 1, 2, 2, 4 — nothing in third.
    expect(boards(suitBoard(SEEDED, S0))).toEqual([
      ['hotel', 1, 5_000],
      ['alpha', 2, 10_000],
      ['bravo', 2, 10_000],
      ['charlie', 4, 20_000],
      ['delta', 5, 25_000],
      ['echo', 6, 30_000],
      ['foxtrot', 7, 45_000],
    ])
  })

  it('orders a chamber with no ties by elapsed alone', () => {
    expect(boards(suitBoard(SEEDED, S4))).toEqual([
      ['foxtrot', 1, 90_000],
      ['hotel', 2, 125_000],
      ['alpha', 3, 150_000],
      ['charlie', 4, 165_000],
      ['golf', 5, 300_000],
    ])
  })

  it('carries only the chamber it was asked for', () => {
    const rows = suitBoard(SEEDED, S2)

    expect(rows).toHaveLength(6)
    expect(rows.every((row) => row.suit === S2)).toBe(true)
  })

  it('never returns a rank out of order', () => {
    for (const suit of SUIT_KEYS) {
      const ranks = suitBoard(SEEDED, suit).map((row) => row.rank)

      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
      expect(ranks[0]).toBe(1)
    }
  })

  // `filter` copies before the in-place `sort` for exactly this reason: the
  // caller's array is the shared source for all five tabs and the standings, and
  // a sort in place would reorder it under them.
  it('leaves the caller’s array in the order it was given', () => {
    const before = SEEDED.map((row) => row.teamSlug)
    suitBoard(SEEDED, S0)

    expect(SEEDED.map((row) => row.teamSlug)).toEqual(before)
  })

  it('says nothing rather than failing for a chamber nobody has solved', () => {
    expect(suitBoard(SEEDED, 'NOT_A_CHAMBER')).toEqual([])
    expect(suitBoard([], S0)).toEqual([])
  })

  // A board sorted by elapsed with a negative in it puts the negative first,
  // which is the visible symptom of a start time set too late.
  it('sorts a negative elapsed to the top', () => {
    const rows = withElapsed(
      [
        { suit: S0, teamName: 'Alpha', teamSlug: 'alpha', submittedAt: at(60) },
        { suit: S0, teamName: 'Bravo', teamSlug: 'bravo', submittedAt: at(-5) },
      ],
      START,
    )

    expect(boards(suitBoard(rows, S0))).toEqual([
      ['bravo', 1, -5_000],
      ['alpha', 2, 60_000],
    ])
  })
})

describe('overallStandings — the whole event', () => {
  it('ranks by chambers solved, then by total time', () => {
    expect(table(overallStandings(SEEDED))).toEqual([
      ['alpha', 1, 5, 350_000],
      ['charlie', 2, 5, 445_000],
      // Four chambers each, ordered by time: 240s, 275s, 400s.
      ['bravo', 3, 4, 240_000],
      ['delta', 4, 4, 275_000],
      ['hotel', 5, 4, 400_000],
      // Tied on both keys, so they share rank 6 and Golf takes 8 with nobody in 7.
      ['echo', 6, 3, 160_000],
      ['foxtrot', 6, 3, 160_000],
      ['golf', 8, 2, 500_000],
    ])
  })

  it('breaks a two-key tie deterministically rather than by insertion order', () => {
    const forward = overallStandings(SEEDED)
    const backward = overallStandings([...SEEDED].reverse())

    // Same rows, same ranks, same positions — which is the property that makes
    // "read me the fourth line" work over a radio. The sort's third key is the
    // slug, so Echo precedes Foxtrot whoever was inserted first.
    expect(table(backward)).toEqual(table(forward))
    expect(forward[5].teamSlug).toBe('echo')
    expect(forward[6].teamSlug).toBe('foxtrot')
  })

  it('lists all five chambers per team, with the unsolved ones as gaps', () => {
    const bySlug = new Map(overallStandings(SEEDED).map((team) => [team.teamSlug, team]))

    // In display order, not in the order they were solved — the timeline is read
    // against the tabs above it.
    expect(bySlug.get('golf').chambers).toEqual([
      { suit: S0, elapsedMs: null },
      { suit: S1, elapsedMs: null },
      { suit: S2, elapsedMs: null },
      { suit: S3, elapsedMs: 200_000 },
      { suit: S4, elapsedMs: 300_000 },
    ])

    expect(bySlug.get('hotel').chambers.map((chamber) => chamber.elapsedMs)).toEqual([
      5_000, null, 120_000, 150_000, 125_000,
    ])

    expect(bySlug.get('alpha').chambers.every((chamber) => chamber.elapsedMs !== null)).toBe(true)
  })

  it('carries the last solve, which is what the row shows as a wall clock', () => {
    const bySlug = new Map(overallStandings(SEEDED).map((team) => [team.teamSlug, team]))

    expect(bySlug.get('alpha').lastSubmittedAt.getTime()).toBe(at(150).getTime())
    // Hotel's latest is S3 at 150s, not S4 at 125s.
    expect(bySlug.get('hotel').lastSubmittedAt.getTime()).toBe(at(150).getTime())
  })

  it('counts a chamber once even when the array holds it twice', () => {
    // The database forbids this — `unique('submissions_suit_team_idx')` — so it
    // cannot arrive from a query. Counting through a Map means a duplicate would
    // be a wrong elapsed rather than a wrong number of chambers, which is the
    // failure that stays visible.
    const duplicated = withElapsed(
      [
        { suit: S0, teamName: 'Alpha', teamSlug: 'alpha', submittedAt: at(10) },
        { suit: S0, teamName: 'Alpha', teamSlug: 'alpha', submittedAt: at(20) },
      ],
      START,
    )
    const [team] = overallStandings(duplicated)

    expect(team.suitsSolved).toBe(1)
  })

  it('says nothing rather than failing when nothing has been solved', () => {
    expect(overallStandings([])).toEqual([])
  })

  // A team can fix a typo on its fifth chamber, and the standings should follow
  // the team rather than the first thing someone typed. That is why board.js
  // documents the caller's ordering as part of its contract.
  it('shows the team’s most recent spelling, whichever order the rows arrive in', () => {
    const rows = [
      { suit: S0, teamName: 'Team  Vortex', teamSlug: 'team-vortex', submittedAt: at(10) },
      { suit: S1, teamName: 'Team Vortex', teamSlug: 'team-vortex', submittedAt: at(20) },
    ]

    for (const order of [rows, [...rows].reverse()]) {
      const [team] = overallStandings(withElapsed(order, START))

      expect(team.displayName).toBe('Team Vortex')
    }
  })
})

describe('defaultSuit — which tab to open on', () => {
  it('opens on the chamber solved most recently', () => {
    // Golf's S4 solve at 300s is the latest thing that happened.
    expect(defaultSuit(SEEDED)).toBe(S4)
  })

  it('falls back to the first chamber before anything has been solved', () => {
    expect(defaultSuit([])).toBe(SUIT_KEYS[0])
  })

  it('still answers when the latest solve is before the start time', () => {
    const early = withElapsed(
      [{ suit: S2, teamName: 'Alpha', teamSlug: 'alpha', submittedAt: at(-10) }],
      START,
    )

    expect(defaultSuit(early)).toBe(S2)
  })

  // Two solves in the same millisecond is reachable — the row's timestamp is
  // Postgres `now()`, not a counter. Either answer is correct; this pins the one
  // the strict comparison produces so that changing it is a decision rather than
  // a diff nobody looked at.
  it('takes the first of two solves sharing the latest timestamp', () => {
    const twin = withElapsed(
      [
        { suit: S1, teamName: 'Alpha', teamSlug: 'alpha', submittedAt: at(10) },
        { suit: S3, teamName: 'Bravo', teamSlug: 'bravo', submittedAt: at(10) },
      ],
      START,
    )

    expect(defaultSuit(twin)).toBe(S1)
  })
})

describe('csvCell — one field, escaped', () => {
  it('writes an absent value as an empty field', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('writes a finite number as itself, zero included', () => {
    expect(csvCell(0)).toBe('0')
    expect(csvCell(42)).toBe('42')
    // A falsy check here would have written 0 as an empty field, which is a
    // silently missing elapsed.
    expect(csvCell(-42)).toBe('-42')
  })

  it('writes a non-finite number as an empty field rather than as NaN', () => {
    expect(csvCell(NaN)).toBe('')
    expect(csvCell(Infinity)).toBe('')
  })

  it('passes an ordinary string through untouched', () => {
    expect(csvCell('Alpha')).toBe('Alpha')
    // Spaces are legal unquoted, so a name someone padded survives as typed.
    expect(csvCell(' Team  Vortex ')).toBe(' Team  Vortex ')
    expect(csvCell('')).toBe('')
  })

  it('quotes a field holding a separator, a quote or a line ending', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
    expect(csvCell('carriage\rreturn')).toBe('"carriage\rreturn"')
    // The degenerate case: the field is nothing but a quote, so it doubles to
    // two and the wrapper adds two more.
    expect(csvCell('"')).toBe('""""')
  })

  it('disarms a field that a spreadsheet would run as a formula', () => {
    for (const lead of ['=', '+', '-', '@', '\t']) {
      expect(csvCell(`${lead}1`)).toBe(`'${lead}1`)
    }

    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('applies the guard before the quoting, so a field can need both', () => {
    expect(csvCell('=a,b')).toBe(`"'=a,b"`)
    // A carriage return is both a formula lead and a character that forces
    // quoting, so this field gets the apostrophe and then the quotes.
    expect(csvCell('\rx')).toBe(`"'\rx"`)
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
  })

  // The asymmetry, stated as a test because it is the one thing about this
  // function that looks like a mistake. A number is never a formula, and a
  // negative number is a legitimate value in this file — prefixing it would turn
  // the elapsed column into text and break every sum over it.
  it('guards strings that lead like a formula but never numbers', () => {
    expect(csvCell(-42)).toBe('-42')
    expect(csvCell('-42')).toBe("'-42")
  })
})

describe('toCsv — a whole document', () => {
  const BOM = String.fromCharCode(0xfeff)

  it('opens with a byte-order mark, for Excel', () => {
    const csv = toCsv(['a'], [['b']])

    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.startsWith(BOM)).toBe(true)
  })

  it('separates records with CRLF and ends the last one', () => {
    const csv = toCsv(['a', 'b'], [
      [1, 'x,y'],
      [2, 'z'],
    ])

    expect(csv.slice(BOM.length)).toBe('a,b\r\n1,"x,y"\r\n2,z\r\n')
  })

  it('writes just the header when there is nothing to write', () => {
    expect(toCsv(['a', 'b'], []).slice(BOM.length)).toBe('a,b\r\n')
  })

  it('writes the seeded board as one line per submission plus a header', () => {
    const csv = toCsv(
      ['suit', 'team_name', 'team_slug', 'elapsed_ms', 'submitted_at'],
      SEEDED.map((row) => [
        row.suit,
        row.teamName,
        row.teamSlug,
        row.elapsedMs,
        row.submittedAt.toISOString(),
      ]),
    )

    // Not a real parser — splitting on CRLF only works because no field in this
    // fixture contains a line ending, which is what the row count is checking.
    const lines = csv.slice(BOM.length).split('\r\n')

    expect(lines).toHaveLength(32) // header + 30 rows + the empty string after the last CRLF
    expect(lines[0]).toBe('suit,team_name,team_slug,elapsed_ms,submitted_at')
    expect(lines[1]).toBe(`${S0},Hotel,hotel,5000,${at(5).toISOString()}`)
    expect(lines.at(-1)).toBe('')
  })
})

/**
 * The fixture's own integrity, not the code's. Every expectation above is
 * arithmetic on this array, so a row added carelessly would not fail anything —
 * it would just quietly move the numbers.
 */
describe('the fixture', () => {
  it('covers all five chambers', () => {
    expect(SUIT_KEYS).toHaveLength(5)
    expect(SEED.every(([suit]) => SUIT_KEYS.includes(suit))).toBe(true)
    expect(new Set(SEED.map(([suit]) => suit)).size).toBe(5)
  })

  it('reads exactly the thirty submissions the done-when asks for', () => {
    expect(SEED).toHaveLength(30)
    expect(SEEDED).toHaveLength(30)
  })

  // Mirrors `unique('submissions_suit_team_idx')`. A duplicate would make the
  // fixture describe a state the database cannot produce.
  it('solves each chamber at most once per team', () => {
    const pairs = SEED.map(([suit, teamSlug]) => `${suit}/${teamSlug}`)

    expect(new Set(pairs).size).toBe(SEED.length)
  })

  // Every expectation above is arithmetic on how many chambers each team has and
  // how far apart its solves are, so both are pinned here rather than left to a
  // reader to recount.
  //
  // The second half is what makes the order-independence assertions above mean
  // something. If a team had two rows sharing a timestamp, `overallStandings`
  // could not tell which was last and would fall back on iteration order — so
  // reversing the array could legitimately change the display name, and the test
  // asserting it does not would be asserting a coincidence instead of a property.
  // A Set of seconds per team is the check: a duplicate makes `size` fall short
  // of the count.
  //
  // Per team, not across the file. Two *different* teams solving two different
  // chambers in the same second is ordinary — six seconds in this fixture are
  // shared by two teams each.
  it('gives each team its chambers, with no team solving twice in the same second', () => {
    const timesByTeam = {}

    for (const [, teamSlug, seconds] of SEED) {
      if (!timesByTeam[teamSlug]) timesByTeam[teamSlug] = new Set()
      timesByTeam[teamSlug].add(seconds)
    }

    const solveCounts = Object.fromEntries(
      Object.entries(timesByTeam).map(([teamSlug, times]) => [teamSlug, times.size]),
    )

    expect(solveCounts).toEqual({
      alpha: 5,
      bravo: 4,
      charlie: 5,
      delta: 4,
      echo: 3,
      foxtrot: 3,
      golf: 2,
      hotel: 4,
    })
  })

  it('is handed to board.js oldest first, as the query does', () => {
    const times = SEEDED.map((row) => row.submittedAt.getTime())

    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})
