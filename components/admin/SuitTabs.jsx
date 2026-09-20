import Link from 'next/link'
import { SUIT_LIST } from '@/lib/suits'

/**
 * The five chambers, as a row of links.
 *
 * LINKS, NOT BUTTONS, and that is the whole design rather than an implementation
 * detail. Each tab is `<Link href="?suit=SPADES">`, so the selected chamber lives
 * in the URL. Three things fall out of that and all three matter at a venue: the
 * page works with JavaScript off; a refresh, a back button and a shared link all
 * land on the board you were looking at; and the server component re-reads on
 * every switch, so a tab you have not opened in ten minutes is not showing you a
 * stale board.
 *
 * The cost is a round trip per tab press, which on venue wifi is a few hundred
 * milliseconds. The alternative — one fetch, five boards held in memory — would
 * make the page a client component and its data a snapshot from when you opened
 * it, which is the wrong trade for a board whose entire job is being current.
 *
 * Wraps rather than scrolls. Five tabs with counts do not fit across 375px, and a
 * horizontally scrolling tab bar hides its overflow with no affordance that
 * there is anything to scroll to. Wrapping to two lines is uglier and shows every
 * chamber.
 *
 * The count rides on each tab because it is the one number that tells you which
 * board is worth opening — and because a chamber sitting at 0 while the others
 * are at 12 is a chamber whose slug has not reached anyone, which is the failure
 * you want to see from the tab bar rather than four taps in.
 */

/**
 * @param {{ current: string, counts: Record<string, number> }} props
 */
export function SuitTabs({ current, counts }) {
  return (
    <nav aria-label="Chambers">
      <ul className="flex flex-wrap gap-2">
        {SUIT_LIST.map(({ key, label, glyph }) => {
          const isCurrent = key === current

          return (
            <li key={key}>
              {/* `aria-current="page"` rather than only a border colour. The
                  marking has to survive a screen reader and a colour-blind
                  reader as well as it survives the default one, and the border
                  and the colour say the same thing twice on purpose. */}
              <Link
                href={`/admin/leaderboards?suit=${key}`}
                aria-current={isCurrent ? 'page' : undefined}
                className={`flex min-h-[44px] items-center gap-2 border px-3 font-mono text-xs tracking-[0.15em] uppercase transition-colors duration-150 ${
                  isCurrent
                    ? 'border-accent-text text-accent-text'
                    : 'border-rule text-muted active:border-accent'
                }`}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {glyph}
                </span>
                {label}
                <span className="tabular-nums opacity-70">{counts[key] ?? 0}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
