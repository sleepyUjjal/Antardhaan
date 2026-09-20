/**
 * What a slug is allowed to be — pure rules, no database and no Next.
 *
 * This is a module of its own rather than a corner of lib/chambers.js for one
 * concrete reason: C13's suit cards validate a slug **in the browser**. The admin
 * should learn that `admin` is reserved while typing it, not after a save that
 * comes back with a sentence — and the copy button has to refuse a URL that would
 * 404 without a round trip at all.
 *
 * lib/chambers.js imports `db/client.js` and `next/navigation`, so a client
 * component importing the rules from there would pull the database client into
 * the browser bundle. Splitting the pure half out is what makes one rule usable
 * from both sides without a second copy of it — and a second copy is the version
 * of this that goes wrong, because the two drift and the browser starts accepting
 * a slug the action then rejects.
 *
 * Nothing in this file is secret. A slug is public by definition: it is the URL.
 * The *code* that opens the chamber is the secret, it lives in the row, and it is
 * never in this file (§7).
 */

/**
 * The shape a slug is allowed to have.
 *
 * This exists because chambers live at the root (`/k3m9xq2p7w`, not
 * `/c/k3m9xq2p7w`). Every junk URL on the internet now arrives at that route —
 * `/.env`, `/wp-login.php`, `/phpmyadmin` — and without a shape check every one
 * of them is a query against Neon in Singapore. Next serves static route
 * segments first, so `/admin` and `/standings` never reach there, but nothing
 * else is filtered for us. Rejecting the impossible before the query costs
 * nothing and keeps a scanner off the database.
 *
 * Loose on purpose: 1–64 characters, lowercase letters, digits, interior
 * hyphens. The generated slugs (lib/code.js) are 10 characters from a
 * 31-character alphabet and fit easily, but C13 also allows a slug to be typed
 * by hand, so a thematic one like `the-mirror` has to fit too. A tighter pattern
 * would let the admin save a slug that its own route then refuses to serve.
 */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

/**
 * Segments that already mean something at the root.
 *
 * This is the cost of `/k3m9xq2p7w` over `/c/k3m9xq2p7w`, and it fails silently
 * rather than loudly: a chamber slugged `admin` does not error, it simply
 * becomes unreachable, because Next matches the static `app/admin/` route first
 * and lib/chambers.js never sees it. C13 is what refuses these where a slug is
 * set, and the failure it is preventing is the one nobody notices until a team
 * is standing in a corridor with a URL that does not work.
 *
 * The last six are not routes yet. Reserving a word costs nothing; discovering
 * the collision mid-event costs a chamber.
 */
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'standings',
  'dev',
  'robots',
  'sitemap',
  'manifest',
  'icon',
  'favicon',
  'opengraph-image',
  '_next',
])

/**
 * The three ways a slug can be wrong, as stable strings rather than sentences.
 *
 * The string is what crosses the wire back from the Server Action, so it is the
 * thing the card switches on; the sentence is looked up from it on this side and
 * never travels. That keeps the wording out of the action's return value, which
 * matters because an action's return value is part of a public endpoint's
 * contract and a message is the part of a contract most likely to be reworded.
 */
export const SLUG_PROBLEMS = ['empty', 'shape', 'reserved']

const PROBLEM_TEXT = {
  empty: 'Type a slug, or press Random.',
  shape:
    'Lowercase letters, digits and hyphens only — 1 to 64 characters, starting and ending with a letter or a digit.',
  reserved: "Reserved for the site's own routes, so a chamber using it would never resolve.",
}

/**
 * Lowercase and trim, which is the only normalisation a slug gets.
 *
 * It happens on the way *in* — as you type, in the card — so that what the field
 * shows is exactly what `slugProblem` tests and exactly what gets saved. A slug
 * normalised after validation is a slug that was validated as something else.
 */
export function normalizeSlug(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

/**
 * The first rule a slug breaks, or `null` if it breaks none.
 *
 * Takes an already-normalised value — call `normalizeSlug` first. It does not
 * trim on its own, deliberately: a function that tidies its input and then
 * reports on it is a function whose answer is about a string the caller never
 * sees, and the caller here is the one that has to store something.
 *
 * @param {unknown} slug
 * @returns {'empty' | 'shape' | 'reserved' | null}
 */
export function slugProblem(slug) {
  if (typeof slug !== 'string' || slug === '') return 'empty'
  if (!SLUG_PATTERN.test(slug)) return 'shape'
  if (RESERVED_SLUGS.has(slug)) return 'reserved'
  return null
}

/**
 * Whether a slug can be served *and* can safely be stored.
 *
 * The whole question as one boolean, which is the form this module's callers
 * mostly want to *read*. Both of the ones that exist today want to *say* why,
 * though — the card has a sentence to render and the action has a reason to
 * return — so both go through `slugProblem` and neither calls this. It is kept
 * because it is the name the plan and §4 use for the rule, and because it is
 * the honest shape of the question: `lib/slug.test.js` asserts that this and
 * `slugProblem` never disagree, which is only a real assertion while both exist.
 */
export function isValidSlug(slug) {
  return slugProblem(slug) === null
}

/** The sentence for a problem code, or `null` for a slug that has none. */
export function slugProblemText(problem) {
  return problem ? (PROBLEM_TEXT[problem] ?? null) : null
}
