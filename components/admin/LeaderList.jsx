import { ClockTime } from '@/components/admin/ClockTime'
import { formatElapsed } from '@/lib/format'

/**
 * One chamber's board: rank, team, when they solved it, how long it took.
 *
 * A SERVER COMPONENT, and it renders two layouts rather than one that reflows.
 * A real `<table>` on a desktop is worth the duplication — it is what makes the
 * board sortable-looking, copy-pasteable into a spreadsheet and correct to a
 * screen reader, and neither of those is true of a grid of divs dressed up with
 * header cells. On a phone the same five columns are unreadable at any font size
 * that fits, so the card list is not a fallback, it is the layout that is
 * actually used. Both are in the DOM and CSS hides one; at a few dozen teams that
 * is a rounding error, and it is the price of not having the phone and the laptop
 * disagree about what a board is.
 *
 * The one thing it cannot render itself is the wall clock, which is device-local
 * and therefore belongs to `<ClockTime>`. Elapsed is not: `formatElapsed` is pure
 * arithmetic on a duration and renders identically on both sides, which is why
 * the number this board ranks by is the one that never flickers.
 *
 * Rendering both layouts means rendering `<ClockTime>` twice per row — two client
 * islands where one would do if only the visible layout existed. That is the
 * honest price of not choosing the layout on the server, which would mean reading
 * a breakpoint out of a user-agent string and being wrong on every tablet. Two
 * cheap islands per row is affordable at the scale this board is read at; a
 * layout guessed from a UA string is wrong where it matters.
 */

/**
 * Ranks 1–3, in the accent. A colour rather than a medal glyph, because the
 * glyph would need a second word for fourth place and there is nothing to say
 * about fourth place.
 */
const TOP_RANK = 'text-accent-text'
const RANK = 'font-mono tabular-nums'

/**
 * @param {{
 *   rows: Array<{ rank: number, teamName: string, submittedAt: Date, elapsedMs: number }>,
 *   emptyText: string,
 * }} props
 */
export function LeaderList({ rows, emptyText }) {
  // Said in words rather than rendered as an empty list. An empty board and a
  // broken query look identical on a phone, and this page is only ever read
  // during the one evening when "is it broken or is nobody playing" is a real
  // question with different answers.
  if (rows.length === 0) {
    return <p className="border border-rule p-4 text-muted">{emptyText}</p>
  }

  return (
    <>
      {/* `ol`, not `ul`: this is an ordered list with a rank on every row, and
          the rank is in the data rather than in the markup's opinion. */}
      <ol className="flex list-none flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.teamSlug} className="flex items-baseline gap-4 border border-rule p-3">
            <span className={`${RANK} w-6 shrink-0 text-sm ${row.rank <= 3 ? TOP_RANK : 'text-muted'}`}>
              {row.rank}
            </span>

            <span className="min-w-0 flex-1">
              {/* `break-words`: team names are up to 40 characters of whatever
                  someone typed, and one long unbroken name would otherwise push
                  the elapsed time off the right edge of the card. */}
              <span className="block break-words">{row.teamName}</span>
              <ClockTime iso={row.submittedAt} className="font-mono text-xs text-muted" />
            </span>

            <span
              className={`${RANK} shrink-0 text-sm ${row.rank <= 3 ? TOP_RANK : 'text-fg'}`}
            >
              {formatElapsed(row.elapsedMs)}
            </span>
          </li>
        ))}
      </ol>

      <table className="hidden w-full border-collapse text-left md:table">
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className="w-12 py-2 font-mono text-xs font-normal tracking-[0.25em] text-muted uppercase">
              #
            </th>
            <th scope="col" className="py-2 font-mono text-xs font-normal tracking-[0.25em] text-muted uppercase">
              Team
            </th>
            <th scope="col" className="py-2 font-mono text-xs font-normal tracking-[0.25em] text-muted uppercase">
              Solved at
            </th>
            <th scope="col" className="py-2 text-right font-mono text-xs font-normal tracking-[0.25em] text-muted uppercase">
              Elapsed
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.teamSlug} className="border-b border-rule">
              <td className={`${RANK} py-2 text-sm ${row.rank <= 3 ? TOP_RANK : 'text-muted'}`}>
                {row.rank}
              </td>
              <td className="py-2 break-words">{row.teamName}</td>
              <td className="py-2 font-mono text-sm text-muted">
                <ClockTime iso={row.submittedAt} />
              </td>
              <td className={`${RANK} py-2 text-right text-sm ${row.rank <= 3 ? TOP_RANK : 'text-fg'}`}>
                {formatElapsed(row.elapsedMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
