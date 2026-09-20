'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The console's page switcher.
 *
 * Added at C13, when this became the third page under `/admin` and typing URLs
 * stopped being a reasonable way to move between them — the whole point of this
 * console is that it is used one-handed on a phone, at a venue, and a phone has
 * no address bar you would want to type into twice.
 *
 * A client component for one reason: `usePathname`. The server layout cannot know
 * the pathname, and the alternative — a `layout.jsx` per route so each can pass
 * down its own label — is three files to express one word.
 *
 * `aria-current="page"` rather than only a colour, because the marking has to
 * survive a screen reader and a colour-blind reader as well as it survives the
 * default one. The underline and the colour say the same thing twice on purpose.
 *
 * No rule of its own. The `border-b` that closes this off is on the wrapper the
 * layout puts around it, so the line is full-bleed and matches the header's —
 * a rule drawn in here would be inset by Container's padding instead.
 *
 * Not in the plan's file list for C13; it is here because three pages with no way
 * between them is a defect on the surface the plan insists is mobile-first.
 */

const PAGES = [
  { href: '/admin', label: 'Console', exact: true },
  { href: '/admin/suits', label: 'Suits' },
  { href: '/admin/glitch', label: 'Glitch' },
]

/**
 * `exact` is on the first entry and it is load-bearing, not tidiness.
 *
 * The rule is "a page is current if the pathname is it, or is beneath it", which
 * is right for a section and wrong for `/admin`, because `/admin` is a prefix of
 * the other two — so the plain rule lights **Console** up on `/admin/suits` and
 * on `/admin/glitch`, i.e. everywhere in the console, including the two pages it
 * is there to distinguish between. The three are siblings, not a section with two
 * children, and the flag is what says so.
 *
 * The prefix half still matters for the entries without it: C14 puts boards under
 * `/admin/leaderboards/…` and this should light up for all of them without a row
 * per sub-route.
 */
function isCurrent(pathname, { href, exact }) {
  if (pathname === href) return true
  return !exact && pathname.startsWith(`${href}/`)
}

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Console">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 py-1">
        {PAGES.map((page) => {
          const current = isCurrent(pathname, page)

          return (
            <li key={page.href}>
              <Link
                href={page.href}
                aria-current={current ? 'page' : undefined}
                // min-h-[44px] is the touch target, not the visible box — the
                // same trick the header's logout button uses.
                className={`inline-flex min-h-[44px] items-center font-mono text-xs tracking-[0.2em] uppercase transition-colors duration-150 ${
                  current ? 'text-accent-text underline underline-offset-8' : 'text-muted'
                }`}
              >
                {page.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
