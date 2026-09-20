import { LeaderList } from '@/components/admin/LeaderList'
import { SuitTabs } from '@/components/admin/SuitTabs'
import { TeamTimeline } from '@/components/admin/TeamTimeline'
import { Rule } from '@/components/ui/Rule'
import { defaultSuit, overallStandings, suitBoard } from '@/lib/board'
import { getBoardData } from '@/lib/leaderboard'
import { SUIT_KEYS, SUITS } from '@/lib/suits'

/**
 * The boards: one chamber at a time, and the overall standings under them.
 *
 * WHICH CHAMBER IS IN THE URL, NOT IN STATE. `?suit=SPADES` is what makes a tab a
 * `<Link>`, and that is worth more than it looks: the board survives a refresh, a
 * back button and a shared link, and it works with JavaScript off. The page is
 * `force-dynamic` through the route group's layout, so every switch re-reads —
 * a tab you have not opened in ten minutes is never showing you a stale board.
 *
 * THE OVERALL STANDINGS ARE ALWAYS VISIBLE, below the tabs rather than behind
 * one. They answer a different question ("who is winning the event") from the tab
 * ("who won this chamber"), and the person asking the first one is usually
 * holding a phone in one hand while someone reads them a team name.
 *
 * The export links are plain anchors, not `<Link>`. Next's `<Link>` is for
 * client-side navigation between pages; these are file downloads from a route
 * handler, and prefetching them would download the whole CSV on every visit to
 * this page for a button that is pressed once.
 */
export const metadata = { title: 'Boards' }

const SECTION = 'font-mono text-xs tracking-[0.25em] text-muted uppercase'

/**
 * The export anchors, in one place because they are the same shape twice and the
 * reason they are not `<Link>`s is stated once, above.
 */
function ExportLinks() {
  const link = 'font-mono text-xs tracking-[0.15em] text-muted uppercase underline underline-offset-4'

  return (
    <p className="flex flex-wrap gap-x-5 gap-y-2">
      {/* `download` is a hint, not the mechanism — both routes send
          `Content-Disposition: attachment`, which is what actually decides. The
          attribute is here so the intent is visible in the markup rather than
          only in a route file two directories away. */}
      <a href="/admin/export.csv" download className={link}>
        Export CSV
      </a>
      <a href="/admin/export.json" download className={link}>
        Export JSON
      </a>
    </p>
  )
}

export default async function LeaderboardsPage({ searchParams }) {
  // `searchParams` is a Promise in Next 15+, the same as `params` in
  // app/[slug]/page.jsx.
  const params = await searchParams

  const { rows } = await getBoardData()

  // `SUIT_KEYS.includes` rather than trusting the query string. A Server
  // Component reading `searchParams` is reading a URL a person can type, and
  // anything not one of the five enum values falls back to the default instead
  // of producing an empty board that looks like a database problem. Repeating a
  // parameter (`?suit=A&suit=B`) yields an array here and fails the same check,
  // which is the right answer for a URL nothing links to.
  const requested = typeof params?.suit === 'string' ? params.suit : null
  const suit = requested && SUIT_KEYS.includes(requested) ? requested : defaultSuit(rows)

  const board = suitBoard(rows, suit)
  const standings = overallStandings(rows)

  // Counted from the same rows the board is built from, so a tab's number can
  // never disagree with the length of the list it opens.
  const counts = Object.fromEntries(SUIT_KEYS.map((key) => [key, suitBoard(rows, key).length]))

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="font-display text-2xl uppercase leading-none tracking-tight">Boards</h1>
        <ExportLinks />
      </div>

      <div className="mt-4">
        <Rule tone="accent" />
      </div>

      <div className="mt-6">
        <SuitTabs current={suit} counts={counts} />
      </div>

      <section className="mt-10">
        <h2 className={SECTION}>{SUITS[suit]?.label ?? suit}</h2>
        <p className="mt-3 max-w-prose text-muted">
          Every solve of this chamber, fastest first. A team appears once — the first code they
          enter is the one that counts.
        </p>

        <div className="mt-5">
          <LeaderList rows={board} emptyText="No submissions for this chamber yet." />
        </div>
      </section>

      <section className="mt-10">
        <h2 className={SECTION}>Overall standings</h2>
        <p className="mt-3 max-w-prose text-muted">
          Most chambers solved, then least total time. Tied teams share a rank. Open a team to see
          which chambers it has left.
        </p>

        {standings.length === 0 ? (
          <p className="mt-5 border border-rule p-4 text-muted">
            No submissions yet. Nothing has been solved, so there is nothing to rank.
          </p>
        ) : (
          <ol className="mt-5 flex list-none flex-col gap-2">
            {standings.map((team) => (
              <TeamTimeline key={team.teamSlug} team={team} totalSuits={SUIT_KEYS.length} />
            ))}
          </ol>
        )}
      </section>
    </>
  )
}
