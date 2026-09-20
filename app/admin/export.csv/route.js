import { toCsv } from '@/lib/board'
import { formatElapsed } from '@/lib/format'
import { getBoardData } from '@/lib/leaderboard'

/**
 * Every submission, as a CSV an organiser can open in a spreadsheet.
 *
 * A ROUTE HANDLER, NOT A PAGE, and that is what buys the `Content-Disposition`
 * header. The plan's wording is "export: submissions as CSV with
 * `Content-Disposition: attachment`" and the header is the whole feature: the
 * board is also readable as a page, but a file that lands in Downloads is the
 * difference between a result you can hand to someone and a page they have to
 * screenshot. It is also why the links on the boards page are plain `<a>`s.
 *
 * `dynamic` IS SET HERE AND NOT INHERITED. It has to be: route handlers are not
 * wrapped by layouts — they are their own entry points — so the route group's
 * `force-dynamic` covers the boards page and does not reach this file. Without
 * this line a GET handler is a candidate for caching, and a cached export is a
 * result set that silently stops matching the board it claims to be.
 *
 * Guarded by proxy.js like everything else under /admin: the matcher is
 * `/admin/:path*`, and route handlers sit inside the tree the matcher names. An
 * unauthenticated request never reaches this function — which matters more here
 * than anywhere else, because this is the one endpoint that returns every team's
 * name in one response.
 */
export const dynamic = 'force-dynamic'

/**
 * The columns, in the order they appear in the file.
 *
 * Raw and derived side by side on purpose. `elapsed_ms` is the number the board
 * actually ranks by and is the only one worth recomputing from; `elapsed` is
 * `formatElapsed`'s reading of it, for a human opening this in Excel at 1 a.m.
 * If the two ever disagree, the ms column is right and the readable one is a bug
 * — which is exactly the argument for both being here rather than only one.
 *
 * `submitted_at` is ISO 8601 with the offset, straight off the Date. Elapsed is
 * measured from the event's start time, so a reader who has the file but not the
 * console needs an absolute instant to recover the zero point — and they can,
 * because `start_time - elapsed` is the start time for every row.
 */
const HEADERS = ['suit', 'team_name', 'team_slug', 'elapsed_ms', 'elapsed', 'submitted_at']

export async function GET() {
  const { rows } = await getBoardData()

  // In the order the query returned them: oldest first, which is the order the
  // rows were actually written. Deliberately not re-sorted into the board's
  // fastest-first order — a spreadsheet can sort itself, and an archival dump's
  // job is to preserve what cannot be reconstructed, which is insertion order.
  const csv = toCsv(
    HEADERS,
    rows.map((row) => [
      row.suit,
      row.teamName,
      row.teamSlug,
      row.elapsedMs,
      formatElapsed(row.elapsedMs),
      row.submittedAt.toISOString(),
    ]),
  )

  return new Response(csv, {
    headers: {
      // charset is not optional. Team names are Devanagari as often as they are
      // Latin — lib/team.js preserves them — and without it a spreadsheet
      // guessing latin-1 renders every Hindi team name as mojibake.
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="antardhaan-submissions.csv"',
      // The same reason the page is force-dynamic, restated at the other end:
      // a proxy or a browser caching this would serve a stale result to the one
      // person guaranteed to notice, because they are about to compare it with
      // the board they are looking at.
      'Cache-Control': 'no-store',
    },
  })
}
