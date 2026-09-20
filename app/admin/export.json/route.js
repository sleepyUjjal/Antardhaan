import { getBoardData } from '@/lib/leaderboard'

/**
 * The same rows as the CSV, in a shape a script can read.
 *
 * WHY BOTH FORMATS. The CSV is for a person and the JSON is for a machine, and
 * the machine is not hypothetical: the results get posted somewhere after the
 * event, and whoever does that should be reading a file rather than retyping a
 * board off a phone screen. The two routes share `getBoardData`, so they cannot
 * disagree about what happened — the only difference between them is serialising.
 *
 * `start_time` RIDES ALONG BECAUSE `elapsed_ms` IS MEANINGLESS WITHOUT IT. Every
 * elapsed in this file is measured from the event's start time, so an export that
 * carried only the durations could not be used to reconstruct the wall-clock
 * result, and could not be checked against the boards after the console is gone.
 * It costs one field and it is the field without which the file is a set of
 * numbers about nothing.
 *
 * Same `dynamic` reasoning as export.csv: a route handler is its own entry point
 * and is not wrapped by the route group's layout, so the flag that makes the
 * boards page live does not reach this file, and a cached JSON dump is a stale
 * archive served to the person who is about to publish it.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const { startTime, rows } = await getBoardData()

  // Shaped rather than spread. `rows` carry a `Date` and an `elapsedMs` that the
  // board uses internally; a file someone else parses should not inherit the
  // console's convenience fields by accident, and `toISOString` is the only form
  // of a timestamp that survives a round trip through anything.
  const body = {
    exportedAt: new Date().toISOString(),
    startTime: startTime.toISOString(),
    submissions: rows.map((row) => ({
      suit: row.suit,
      teamName: row.teamName,
      teamSlug: row.teamSlug,
      submittedAt: row.submittedAt.toISOString(),
      elapsedMs: row.elapsedMs,
    })),
  }

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="antardhaan-submissions.json"',
      'Cache-Control': 'no-store',
    },
  })
}
