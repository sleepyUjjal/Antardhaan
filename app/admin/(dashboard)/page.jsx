import { StartTimeForm } from '@/components/admin/StartTimeForm'
import { StatCards } from '@/components/admin/StatCards'
import { Button } from '@/components/ui/Button'
import { Rule } from '@/components/ui/Rule'
import { getDashboard } from '@/lib/event'
import { updateStartTime, updateSubmissionsOpen } from '../actions'

/**
 * The event console.
 *
 * Two controls and four numbers, on one screen, because this is read on a phone
 * in a corridor while something is going wrong. Everything on it is live: the
 * layout above declares `force-dynamic` for the group, so every load re-reads the
 * event row rather than serving anything cached.
 *
 * Both controls are the ones that change the board *without* touching a
 * submission:
 *
 * - the start time, which every elapsed time is measured against at read time,
 *   so moving it re-ranks five chambers with no writes to the submissions table
 *   — the done-when for this commit;
 * - the kill switch, which lib/submissions.js and lib/chambers.js both consult
 *   on the next request, so it takes effect on the next tap rather than the next
 *   deploy.
 *
 * There is deliberately no control for correcting or deleting a submission. A
 * solve is a fact that a team earned; if one is wrong, the start time was wrong,
 * and the fix belongs in the field above rather than in a delete button that
 * quietly rewrites history (§1.4).
 */
export const metadata = { title: 'Console' }

const SECTION = 'font-mono text-xs tracking-[0.25em] text-muted uppercase'

export default async function AdminDashboardPage() {
  const { startTime, submissionsOpen, stats } = await getDashboard()

  // Through `new Date` on the way out for the same reason lib/event.js does it on
  // the way in: a typed column select comes back as a Date, but that is the
  // driver's business, not this page's, and `toISOString` on a string is a
  // TypeError rather than a wrong number. The client component parses both.
  const startIso = new Date(startTime).toISOString()
  const leaderIso = stats.leaderSubmittedAt
    ? new Date(stats.leaderSubmittedAt).toISOString()
    : null

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="font-display text-2xl uppercase leading-none tracking-tight">Console</h1>

        {/* A word, not a colour. "Open" and "Closed" are the two states of the
            thing the switch below flips, and reading them is the entire
            verification that the switch did something. */}
        <p
          className={`font-mono text-xs tracking-[0.25em] uppercase ${
            submissionsOpen ? 'text-muted' : 'text-accent-text'
          }`}
        >
          {submissionsOpen ? 'Submissions open' : 'Submissions closed'}
        </p>
      </div>

      <div className="mt-4">
        <Rule tone={submissionsOpen ? 'rule' : 'accent'} />
      </div>

      <div className="mt-6">
        <StatCards
          total={stats.total}
          teams={stats.teams}
          suitsSolved={stats.suitsSolved}
          leaderSubmittedAt={stats.leaderSubmittedAt}
          startTime={new Date(startTime)}
          now={new Date()}
        />
      </div>

      <section className="mt-10">
        <h2 className={SECTION}>Start time</h2>
        <p className="mt-3 max-w-prose text-muted">
          The zero-point every elapsed time is measured from. Changing it moves every time on every
          board and rewrites none of them — no submission row is touched.
        </p>

        <div className="mt-6 max-w-sm">
          {/* `initialIso` is the saved instant, and the form owns its own draft
              from then on. No `key` here on purpose: a key would remount the form
              when the save revalidates the page and throw away the confirmation
              it just earned. */}
          <StartTimeForm action={updateStartTime} initialIso={startIso} leaderIso={leaderIso} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className={SECTION}>Submissions</h2>
        <p className="mt-3 max-w-prose text-muted">
          Closing refuses every new entry and shows the closed state on all five chambers. It does
          not touch the board — nothing already recorded is hidden or lost, and reopening restores
          service on the next request.
        </p>

        {/* No client component. A plain form posting to a Server Action works
            with JavaScript disabled, which matters for the one control you might
            need to reach on a phone with 2% battery and a flaky connection. */}
        <form action={updateSubmissionsOpen} className="mt-6 max-w-sm">
          {/* The action reads this field and nothing else. It carries the state
              to move *to* rather than the state we are in, so a double submit
              from a stale page is a no-op instead of a flip back. */}
          <input type="hidden" name="open" value={String(!submissionsOpen)} />

          <Button type="submit" variant={submissionsOpen ? 'primary' : 'ghost'}>
            {submissionsOpen ? 'Close submissions' : 'Open submissions'}
          </Button>
        </form>
      </section>
    </>
  )
}
