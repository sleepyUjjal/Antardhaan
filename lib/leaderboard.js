/**
 * The board's read path: every submission, plus the start time they are all
 * measured against.
 *
 * WHY THIS IS ONE QUERY AND NOT §6's TWO. §6 gives a per-suit aggregate and an
 * overall aggregate as separate statements, and this commit fetches the rows
 * once and derives both in lib/board.js. The reason is the per-team timeline
 * C14 asks for: "showing all five chambers and where that team stands on each"
 * needs every row anyway, so the aggregates would have been computed over rows
 * already in hand, one round trip later. Fetching once also means the suit board
 * and the standings are guaranteed to be the same snapshot — two statements in a
 * batch are not one transaction, and a solve landing between them would put a
 * team on the board and not in the standings.
 *
 * The cost is stated in lib/board.js: every submission is in memory at once.
 * 2,500 rows at the top end, which is nothing. This is the trade this commit
 * makes and it is bounded by the event's size, not by a guess about it.
 *
 * Still one round trip, which is §9.2's rule and the reason `db.batch` is here
 * at all — the event row and the submissions ride in the same HTTP request.
 */
import { asc } from 'drizzle-orm'
import { db } from '../db/client.js'
import { event, submissions } from '../db/schema.js'
import { withElapsed } from './board.js'

/**
 * Every submission, with its elapsed time attached, and the event's start time.
 *
 * Ordered by `submitted_at` ascending in SQL rather than in JavaScript, because
 * two things depend on that order being the driver's rather than this file's:
 * `withElapsed` preserves it, and `overallStandings` takes a team's *last* row
 * as its display name. Sorting here makes that deterministic instead of
 * dependent on whatever order Postgres happened to return.
 *
 * No `limit`. The board is the whole board — a paginated leaderboard is a
 * leaderboard that lies about who is winning.
 *
 * @returns {Promise<{
 *   startTime: Date,
 *   rows: ReturnType<typeof withElapsed>,
 * }>}
 */
export async function getBoardData() {
  const [submissionRows, eventRows] = await db.batch([
    db
      .select({
        suit: submissions.suit,
        teamName: submissions.teamName,
        teamSlug: submissions.teamSlug,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .orderBy(asc(submissions.submittedAt)),
    db.select({ startTime: event.startTime }).from(event).limit(1),
  ])

  const current = eventRows[0]

  // A missing event row is not an empty board, it is an unseeded database. Every
  // elapsed time on this page is measured from this row, and defaulting to
  // `now()` would render a board of negative times that looks like a bug in the
  // ranking rather than a missing row. Same throw as lib/event.js and
  // lib/chambers.js.
  if (!current) {
    throw new Error('The event row is missing, so the board has no zero-point. Run `npm run seed`.')
  }

  return {
    startTime: new Date(current.startTime),
    rows: withElapsed(submissionRows, current.startTime),
  }
}
