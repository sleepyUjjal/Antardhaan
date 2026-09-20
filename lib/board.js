/**
 * The board, derived. Every function here is pure — submission rows and a start
 * time in, ranked rows and CSV out.
 *
 * WHY THIS IS NOT lib/leaderboard.js. That module imports db/client.js, which
 * reads DATABASE_URL at import time by design, so anything importing it cannot
 * be loaded without a database. The ranking rules are precisely what C14's
 * done-when asks to check against hand-computed expectations, ties included —
 * and a rule you can only verify against a live Neon branch is a rule nobody
 * verifies. Same split as lib/slug.js out of lib/chambers.js, one commit back,
 * for the same kind of reason.
 *
 * §6's design property is preserved exactly: elapsed is `submitted_at -
 * start_time`, computed at read time, never stored. What moved is *where* the
 * arithmetic happens. §6 writes it as `submitted_at - start_time` in SQL with
 * an interval, an `array_agg(... order by ...)` for the display name and a
 * window-free `order by` over two aggregates; all of that is stated below in
 * JavaScript instead. Three reasons, in order of weight:
 *
 *   1. The tie rule is a ranking, and SQL has no `RANK()` that gives competition
 *      ranks without a window function — which is one more thing to get right
 *      and cannot be unit-tested. `rankBy` is four lines and has a test.
 *   2. The aggregate form needs `sum(interval)` and `extract(epoch from ...)`,
 *      and interval across the neon-http driver is a string that has to be
 *      cast and re-parsed. Rewriting §6's SQL faithfully would have meant three
 *      casts whose failure mode is a plausible-looking wrong number.
 *   3. The whole table is fetched anyway for the per-team timeline, so the rows
 *      are already in hand and the aggregates are over a few thousand objects.
 *
 * The cost is real and worth naming: this holds every submission in memory at
 * once. At 500 teams × 5 chambers that is 2,500 rows — trivial — and it stops
 * being trivial somewhere in the tens of thousands, which this event will not
 * reach. If it ever does, §6's SQL is the shape to go back to.
 */
import { SUIT_KEYS } from './suits.js'

/**
 * U+FEFF, built from its code point rather than written literally.
 *
 * A literal one is correct and unusable: it is invisible in a diff, in an editor
 * and in review, and any tool that trims whitespace off a line deletes it without
 * saying so. Writing it as a backslash-u escape in a string literal has the same
 * problem one level down — whether the file holds the character or the six
 * characters that spell it is not something you can see by looking. A code point
 * cannot be misread either way.
 */
const BOM = String.fromCharCode(0xfeff)

/**
 * Competition ranking: 1, 2, 2, 4.
 *
 * `isTied` compares two *adjacent* rows, and the rows must already be in board
 * order — this ranks a list, it does not sort one. Ties share the better rank,
 * and the next distinct row takes the position its index implies, so two teams
 * tied for second leave nobody in third.
 *
 * That is the version to want and not only the conventional one. The
 * alternative — assigning 1, 2, 2, 3 by index — tells the team in fourth place
 * that it came third, and the person who notices is standing in front of the
 * projector.
 *
 * @template T
 * @param {T[]} rows in board order, best first
 * @param {(previous: T, current: T) => boolean} isTied
 * @returns {Array<T & { rank: number }>}
 */
export function rankBy(rows, isTied) {
  let rank = 0

  return rows.map((row, index) => {
    if (index === 0 || !isTied(rows[index - 1], row)) rank = index + 1
    return { ...row, rank }
  })
}

/**
 * Attaches each submission's elapsed time, measured from the event's zero-point.
 *
 * The one place the start time is subtracted, so moving the start time re-times
 * the whole board with no write to the submissions table — the property C11's
 * done-when rests on, carried forward.
 *
 * Elapsed can be negative. Submissions are accepted whenever (§1.4), so a solve
 * recorded before the start time is set reads as negative and sorts to the top
 * of its board. That is a bug in the start time, and it should look like one:
 * clamping to zero here would hide the mistake behind a number that looks like a
 * fast solve. `formatElapsed` renders the sign for the same reason.
 *
 * @param {Array<{ suit: string, teamName: string, teamSlug: string, submittedAt: Date | string }>} submissions
 * @param {Date | string} startTime
 */
export function withElapsed(submissions, startTime) {
  const zero = new Date(startTime).getTime()

  return submissions.map((submission) => {
    // Through `new Date` even though a typed column select already yields a
    // Date: a driver handing back an ISO string should not throw on `.getTime`
    // mid-event. Same defence as lib/event.js and lib/submissions.js.
    const submittedAt = new Date(submission.submittedAt)

    return {
      suit: submission.suit,
      teamName: submission.teamName,
      teamSlug: submission.teamSlug,
      submittedAt,
      elapsedMs: submittedAt.getTime() - zero,
    }
  })
}

/**
 * One chamber's board, ranked.
 *
 * Ordered by elapsed rather than by `submitted_at`. The two orderings are
 * identical — elapsed is a constant offset from the timestamp — so this is
 * presentation: the board reads as stopwatch times rather than as clock times,
 * which is what a leaderboard is for.
 *
 * @param {ReturnType<typeof withElapsed>} rows every submission
 * @param {string} suit
 */
export function suitBoard(rows, suit) {
  // `filter` copies, so the in-place sort below cannot reorder the caller's
  // array. Worth stating because it is the only mutation in this file and it is
  // on a local.
  const board = rows.filter((row) => row.suit === suit)
  board.sort((a, b) => a.elapsedMs - b.elapsedMs)

  return rankBy(board, (previous, current) => previous.elapsedMs === current.elapsedMs)
}

/**
 * The overall board: one row per team, ranked, each carrying its five chambers.
 *
 * Ordering is §6's — most suits solved, then least total elapsed. The display
 * name is the team's *most recent* spelling, so a team that fixes a typo on its
 * fifth chamber is not stuck with the typo in the standings; that requires the
 * caller to have ordered by `submitted_at`, which lib/leaderboard.js does, and
 * the last row seen for a team therefore wins.
 *
 * A third sort key exists that §6 does not have, and it is not a tie-break for
 * ranking: teams tied on both keys still *share a rank*. It is there so the
 * order among them is deterministic. Without it the standings shuffle on every
 * refresh — same ranks, different rows in the same positions — which reads as
 * the page being unstable and makes "read me the fourth line" useless over a
 * radio. `teamSlug` is compared with `<` rather than `localeCompare` because the
 * server's locale should not be able to change the board's order.
 *
 * @param {ReturnType<typeof withElapsed>} rows every submission
 */
export function overallStandings(rows) {
  const teams = new Map()

  for (const row of rows) {
    let team = teams.get(row.teamSlug)

    if (!team) {
      team = { teamSlug: row.teamSlug, displayName: row.teamName, lastSubmittedAt: row.submittedAt, solves: [] }
      teams.set(row.teamSlug, team)
    }

    // Strictly greater, not `>=`, so a team's name is the one they used on the
    // latest solve and an exact tie on the timestamp cannot make the result
    // depend on iteration order.
    if (row.submittedAt > team.lastSubmittedAt) {
      team.displayName = row.teamName
      team.lastSubmittedAt = row.submittedAt
    }

    team.solves.push(row)
  }

  const standings = [...teams.values()].map((team) => {
    const bySuit = new Map(team.solves.map((solve) => [solve.suit, solve.elapsedMs]))

    return {
      teamSlug: team.teamSlug,
      displayName: team.displayName,
      suitsSolved: bySuit.size,
      totalElapsedMs: team.solves.reduce((total, solve) => total + solve.elapsedMs, 0),
      lastSubmittedAt: team.lastSubmittedAt,
      // All five, in display order, with `null` where the team has not solved
      // it — the timeline's whole point is showing the gaps as well as the
      // solves, and a team that has done three chambers needs to see that there
      // are two left rather than a list of three.
      chambers: SUIT_KEYS.map((key) => ({ suit: key, elapsedMs: bySuit.get(key) ?? null })),
    }
  })

  standings.sort(
    (a, b) =>
      b.suitsSolved - a.suitsSolved ||
      a.totalElapsedMs - b.totalElapsedMs ||
      (a.teamSlug < b.teamSlug ? -1 : a.teamSlug > b.teamSlug ? 1 : 0),
  )

  return rankBy(
    standings,
    (previous, current) =>
      previous.suitsSolved === current.suitsSolved &&
      previous.totalElapsedMs === current.totalElapsedMs,
  )
}

/**
 * Which tab to open on: the chamber solved most recently, or the first suit when
 * nothing has been solved at all.
 *
 * "Most recent" rather than "most solves" because of what this page is for. You
 * open it during the event, and the interesting chamber is the one someone just
 * finished — that is the solve you are about to be asked about. A tab that
 * defaulted to the fullest chamber would show you the same board all evening.
 *
 * @param {ReturnType<typeof withElapsed>} rows every submission
 */
export function defaultSuit(rows) {
  let latest = null

  for (const row of rows) {
    if (!latest || row.submittedAt > latest.submittedAt) latest = row
  }

  return latest ? latest.suit : SUIT_KEYS[0]
}

// A cell beginning with one of these is a *formula* to Excel, Sheets and
// Numbers — and every team name in this file was typed by a stranger. `=1+1` is
// the harmless version; the `=HYPERLINK(...)` and DDE forms are not, and the
// person who opens the export is the organiser, on their own laptop.
const FORMULA_LEAD = /^[=+\-@\t\r]/

// The four characters that cannot appear unquoted in a CSV field: the
// separator, the quote character, and the two line endings. A space is legal
// unquoted, so a team called " Team  Vortex " survives as written.
const NEEDS_QUOTING = /[",\r\n]/

/**
 * One CSV field, escaped.
 *
 * The apostrophe guard is applied to strings only, and that asymmetry is the
 * whole design. A number is never a formula risk and a negative number is a
 * legitimate value in this file — `'-42` would turn the elapsed column into text
 * and silently break every sum and sort over it, which is a worse outcome than
 * the one the guard prevents. So the guard reads "strings that start like a
 * formula", not "cells that start like a formula".
 *
 * The cost, stated rather than hidden: some spreadsheets display the leading
 * apostrophe. A team named `=evil` shows as `'=evil`. The alternative is not a
 * cleaner cell, it is one that runs. The JSON export carries the same name
 * unaltered for anyone who needs the byte-for-byte value.
 *
 * @param {unknown} value
 */
export function csvCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''

  let text = String(value)
  // Prefix first, then quote, so a value that needs both gets both in that
  // order: `=a,b` becomes `"'=a,b"`.
  if (FORMULA_LEAD.test(text)) text = `'${text}`
  if (NEEDS_QUOTING.test(text)) text = `"${text.replaceAll('"', '""')}"`

  return text
}

/**
 * A whole CSV document.
 *
 * CRLF between records and a trailing one, per RFC 4180 — the format exists to
 * be opened by a spreadsheet, and the spreadsheet is the thing that cares.
 *
 * `BOM` is there for one concrete reason: team names are allowed to be in
 * Devanagari (lib/team.js is explicit about not stripping them), and Excel on
 * Windows reads a BOM-less UTF-8 CSV as the system codepage, which renders every
 * Hindi team as mojibake. Excel, Numbers and Sheets all skip a BOM when present.
 * A script that does not want it can drop the first three bytes; the JSON export
 * has no such problem.
 *
 * @param {string[]} headers
 * @param {Array<Array<unknown>>} rows
 */
export function toCsv(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','))

  return BOM + lines.join('\r\n') + '\r\n'
}
