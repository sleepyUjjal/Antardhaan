/**
 * Chamber resolution.
 *
 * A chamber is a suit row reached through its slug. This module is the only
 * place that turns a URL segment into a suit, and — more importantly — the only
 * place that decides what a caller is allowed to learn about one.
 */
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db } from '../db/client.js'
import { event, suits } from '../db/schema.js'

/**
 * The shape a slug is allowed to have.
 *
 * This exists because chambers live at the root (`/k3m9xq2p7w`, not
 * `/c/k3m9xq2p7w`). Every junk URL on the internet now arrives at this route —
 * `/.env`, `/wp-login.php`, `/phpmyadmin` — and without a shape check every one
 * of them is a query against Neon in Singapore. Next serves static route
 * segments first, so `/admin` and `/standings` never reach here, but nothing
 * else is filtered for us. Rejecting the impossible before the query costs
 * nothing and keeps a scanner off the database.
 *
 * Loose on purpose: 1–64 characters, lowercase letters, digits, interior
 * hyphens. The generated slugs (lib/code.js) are 10 characters from a
 * 31-character alphabet and fit easily, but C13 also allows a slug to be typed
 * by hand, so a thematic one like `the-mirror` has to fit too. A tighter pattern
 * would let the admin save a slug that its own route then refuses to serve.
 */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

/**
 * Segments that already mean something at the root.
 *
 * This is the cost of `/k3m9xq2p7w` over `/c/k3m9xq2p7w`, and it fails silently
 * rather than loudly: a chamber slugged `admin` does not error, it simply
 * becomes unreachable, because Next matches the static `app/admin/` route first
 * and this file never sees it. C13 has to refuse these where a slug is set —
 * `isValidSlug` is what it calls.
 */
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'standings',
  'dev',
  // Not routes yet. Reserving a word costs nothing; discovering the collision
  // mid-event costs a chamber.
  'robots',
  'sitemap',
  'manifest',
  'icon',
  'favicon',
  'opengraph-image',
  '_next',
])

/**
 * Whether a slug can be served *and* can safely be stored. C13 validates with
 * this so the admin cannot save one that the route would then 404.
 */
export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug)
}

/**
 * Resolves a slug to its chamber, plus the current event row.
 *
 * ONE ROUND TRIP. A chamber page needs the suit row *and* the event row, and on
 * venue wifi a second trip to Singapore is ~80ms of visible latency for someone
 * standing in a corridor (§9.2). `db.batch` sends both statements in a single
 * HTTP request.
 *
 * THE CODE IS NOT SELECTED. Not fetched and then filtered out — never read.
 * §7's first rule is that a code never reaches a client, and the way that rule
 * actually breaks is a `select()` with no column list whose result gets spread
 * into a client component's props. A column that was never fetched cannot leak
 * through a careless prop, a `<Link>`, or an RSC payload, so the guarantee is
 * made structural here instead of resting on discipline at every call site.
 *
 * @param {string} slug
 * @returns {Promise<{
 *   chamber: { suit: string, slug: string, isActive: boolean },
 *   event: { startTime: Date, submissionsOpen: boolean },
 * }>}
 */
export async function getChamberData(slug) {
  // Reject the impossible before the query. `SLUG_PATTERN` rather than
  // `isValidSlug` because the reserved set is enforced where a slug is *set*,
  // not where it is read: generated slugs (lib/code.js) are exactly ten letters
  // from a 31-character alphabet and can never spell a reserved word, and C13
  // refuses to save a hand-typed one. So a reserved slug cannot be in the table,
  // and re-checking here would only fire for a row that predates the rule — at
  // which point a 404 is the right answer anyway, just a slower one. See the
  // constant above for why the set exists at all.
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) notFound()

  const [chamberRows, eventRows] = await db.batch([
    db
      .select({ suit: suits.suit, slug: suits.slug, isActive: suits.isActive })
      .from(suits)
      .where(eq(suits.slug, slug))
      .limit(1),
    db.select({ startTime: event.startTime, submissionsOpen: event.submissionsOpen }).from(event).limit(1),
  ])

  const chamber = chamberRows[0]
  const currentEvent = eventRows[0]

  // An unknown slug and a retired chamber are the same response on purpose. A
  // page that says "this chamber has been deactivated" confirms the slug was
  // real, and that is the one thing a leaked URL must never do — so a retired
  // chamber has to be indistinguishable from a typo (§4).
  if (!chamber || !chamber.isActive) notFound()

  // A missing event row is not a 404, it is an unseeded database. Every elapsed
  // time on the site is measured from this row, and the failure mode of
  // defaulting to `now()` is a leaderboard that looks plausible and is wrong.
  if (!currentEvent) {
    throw new Error('The event row is missing, so the leaderboard has no zero-point. Run `npm run seed`.')
  }

  return { chamber, event: currentEvent }
}
