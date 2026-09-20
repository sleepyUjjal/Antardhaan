'use client'

import { useId, useState } from 'react'
import { ClockTime } from '@/components/admin/ClockTime'
import { SUITS } from '@/lib/suits'
import { formatElapsed } from '@/lib/format'

/**
 * One team in the overall standings, and the five chambers behind the number.
 *
 * THE TIMELINE IS THE POINT OF THIS COMPONENT, not decoration on a row. "3/5" is
 * the answer to "how is this team doing" and it is also the question you cannot
 * act on: the thing you need at the venue is *which* two chambers a team has not
 * found, because that is how you work out whether a chamber's slug stopped
 * reaching people. So the row collapses to a summary and opens onto all five, in
 * display order, with the unsolved ones shown as gaps rather than omitted — a
 * team that has done three chambers needs to see that there are two left.
 *
 * A client component for `useState` and nothing else. The disclosure is the one
 * interaction on this page that cannot be a link: it does not change what is
 * fetched, and putting it in the URL would mean five chambers times every team.
 *
 * `useId` for the panel's id rather than the team slug. A slug is normalised but
 * not id-safe — lib/team.js turns punctuation into spaces, so "Team Vortex" has a
 * slug with a space in it, and an id with a space breaks `aria-controls` and
 * `getElementById`. The generated id is stable across server and client, which is
 * what lets the markup hydrate without a mismatch.
 */

/**
 * @param {{
 *   team: {
 *     rank: number,
 *     displayName: string,
 *     suitsSolved: number,
 *     totalElapsedMs: number,
 *     lastSubmittedAt: Date,
 *     chambers: Array<{ suit: string, elapsedMs: number | null }>,
 *   },
 *   totalSuits: number,
 * }} props
 */
export function TeamTimeline({ team, totalSuits }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const top = team.rank <= 3

  return (
    <li className="border border-rule">
      <div className="flex items-baseline gap-4 p-3">
        <span
          className={`w-6 shrink-0 font-mono text-sm tabular-nums ${
            top ? 'text-accent-text' : 'text-muted'
          }`}
        >
          {team.rank}
        </span>

        <div className="min-w-0 flex-1">
          <p className="break-words">{team.displayName}</p>

          <p className="mt-1 font-mono text-xs text-muted">
            <span className="tabular-nums">
              {team.suitsSolved}/{totalSuits}
            </span>{' '}
            chambers · total{' '}
            <span className="tabular-nums">{formatElapsed(team.totalElapsedMs)}</span> · last{' '}
            <ClockTime iso={team.lastSubmittedAt} />
          </p>
        </div>

        {/* The whole row is not clickable, and the button says what it does
            rather than being an icon. A chevron is one more thing to learn at
            1 a.m.; "Chambers" is the word for what opens. */}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          // -my-2 py-2 widens the tap target to 44px without pushing the row
          // taller: the padding is inside a negative margin of the same size.
          className="-my-2 min-h-[44px] shrink-0 touch-manipulation px-2 font-mono text-xs tracking-[0.15em] text-muted uppercase transition-colors duration-150 select-none active:text-accent-text"
        >
          {open ? 'Hide' : 'Chambers'}
        </button>
      </div>

      {open ? (
        <ul id={panelId} className="list-none border-t border-rule">
          {team.chambers.map(({ suit, elapsedMs }) => (
            <li
              key={suit}
              className="flex items-baseline gap-3 border-b border-rule px-3 py-2 last:border-b-0"
            >
              <span aria-hidden="true" className="w-4 shrink-0 text-center text-base leading-none">
                {SUITS[suit]?.glyph}
              </span>
              <span className="min-w-0 flex-1 font-mono text-xs tracking-[0.15em] text-muted uppercase">
                {SUITS[suit]?.label ?? suit}
              </span>
              {/* A gap, not a zero and not a blank. Zero would read as "solved
                  instantly" and a blank as "not loaded"; an em dash is the
                  ordinary typographic answer for "no value here". */}
              <span
                className={`shrink-0 font-mono text-sm tabular-nums ${
                  elapsedMs === null ? 'text-muted' : 'text-fg'
                }`}
              >
                {elapsedMs === null ? '—' : formatElapsed(elapsedMs)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
