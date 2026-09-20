import { SUIT_KEYS } from '@/lib/suits'
import { formatElapsed } from '@/lib/format'

/**
 * Four numbers, two-up on a phone.
 *
 * `formatElapsed` is the one formatter in lib/format.js that is safe to run
 * during server rendering — it is pure arithmetic on a millisecond count and
 * never touches a locale or a timezone — so unlike `formatClockTime` it can be
 * called here in a server component. That is not an accident of this file: it is
 * the reason elapsed times are stored as nothing at all and formatted this way,
 * and it is what makes the C11 done-when hold.
 *
 * "Running for" is the one value here that is stale the moment it is sent. That
 * is deliberate and correct: this page is `force-dynamic`, so every load
 * recomputes it, and a server-rendered tick would need a client island keeping a
 * clock for a number the person reading it can round in their head. The live
 * board is C15's job.
 */

const LABEL = 'font-mono text-xs uppercase tracking-[0.25em] text-muted'

function Card({ label, value, note, tone = 'fg' }) {
  return (
    <div className="border border-rule p-4">
      <p className={LABEL}>{label}</p>
      <p
        className={`mt-2 font-display text-3xl leading-none tracking-tight tabular-nums ${
          tone === 'accent' ? 'text-accent-text' : 'text-fg'
        }`}
      >
        {value}
      </p>
      {/* Reserved height rather than conditional: three of the four cards carry a
          note and one does not, and an empty row here would make that one card
          shorter than its neighbour in a two-up grid. */}
      <p className="mt-2 min-h-[1rem] font-mono text-xs text-muted">{note ?? ''}</p>
    </div>
  )
}

/**
 * @param {{
 *   total: number,
 *   teams: number,
 *   suitsSolved: number,
 *   leaderSubmittedAt: Date | null,
 *   startTime: Date,
 *   now: Date,
 * }} props
 */
export function StatCards({ total, teams, suitsSolved, leaderSubmittedAt, startTime, now }) {
  const running = now.getTime() - startTime.getTime()
  const leaderMs = leaderSubmittedAt ? leaderSubmittedAt.getTime() - startTime.getTime() : null

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Not "37 entries" — that is the number above restated. The useful second
          line is the denominator: one solve per team per chamber, so this is how
          much of the board is still blank. */}
      <Card
        label="Submissions"
        value={total}
        note={teams === 0 ? 'nothing yet' : `of ${teams * SUIT_KEYS.length} possible`}
      />

      <Card label="Teams" value={teams} note="distinct team names" />

      <Card
        label="Suits solved"
        value={`${suitsSolved}/${SUIT_KEYS.length}`}
        note={suitsSolved === SUIT_KEYS.length ? 'every chamber' : 'chambers with a solve'}
      />

      {/* A negative running time is not an error state — setting the start time
          for later in the evening is a thing you do on purpose before doors — so
          it flips the label rather than showing a minus sign under a heading that
          says "running for". Which means the sign has to come off the value too:
          `formatElapsed` renders its own minus for a negative duration, so
          "Starts in -1h 04m" is one un-abs'd call away. */}
      <Card
        label={running < 0 ? 'Starts in' : 'Running for'}
        value={formatElapsed(running < 0 ? -running : running)}
        note={leaderMs === null ? 'no solves yet' : `fastest ${formatElapsed(leaderMs)}`}
      />
    </div>
  )
}
