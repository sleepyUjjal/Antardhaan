/**
 * The admin's side of the `suits` table: read the codes, rotate one, move a
 * chamber, retire it.
 *
 * WHY THIS IS NOT IN lib/chambers.js. That module resolves a slug to a chamber
 * for a participant, and its central guarantee — stated in its own header and
 * relied on by §7 — is that it *never selects the code*. Not fetched and
 * filtered, never read. Putting a function here that reads the codes into that
 * file would not break anything, and that is the problem: the guarantee would
 * quietly stop being true, and a rule you cannot check by reading one file is a
 * rule that survives on memory.
 *
 * So the two halves are two files. lib/chambers.js is the participant path and
 * touches no code. This module is the console path and does, and it is only ever
 * reached through a page or an action behind the proxy guard.
 *
 * §7 still holds, and this is the exception the plan names rather than a hole in
 * it: the codes are plain text *so that* they can be re-read here. Rotating a
 * code you have lost is the whole reason they are not hashed, and the admin is
 * the one surface that gets to see them.
 */
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { suits } from '../db/schema.js'
import { SUIT_KEYS } from './suits.js'

/**
 * Postgres's unique-violation code, wherever the driver has put it.
 *
 * Both spellings are checked because the two drivers in play disagree:
 * `@neondatabase/serverless` over HTTP raises its own error and hangs the
 * original off `cause`, while a direct `pg` connection puts the code on the
 * error itself. A check that only knew one of them would turn "that slug is
 * taken" into a 500 on whichever deployment used the other.
 */
function isUniqueViolation(error) {
  return error?.code === '23505' || error?.cause?.code === '23505'
}

/**
 * Every suit, with everything the console needs to show — including the code.
 *
 * No column list is omitted on purpose, unlike every other read in this project.
 * That is the exception described above, and it is worth naming the consequence:
 * the result of this function must not be spread into a *participant* page's
 * props. It is called in exactly one place, app/admin/(dashboard)/suits/page.jsx.
 *
 * Throws unless all five are present, matching lib/event.js and lib/chambers.js.
 * Five missing rows is not "no suits configured", it is a database that has not
 * been seeded — and four rows is worse, because a console that lists four
 * chambers looks like it is working. A page that silently dropped a suit would
 * be a page where the missing one is invisible until a team cannot play it.
 *
 * @returns {Promise<Array<{
 *   suit: string, slug: string, code: string, isActive: boolean, updatedAt: Date,
 * }>>}
 */
export async function getSuitConfig() {
  const rows = await db
    .select({
      suit: suits.suit,
      slug: suits.slug,
      code: suits.code,
      isActive: suits.isActive,
      updatedAt: suits.updatedAt,
    })
    .from(suits)

  // Against SUIT_KEYS rather than a literal 5, so adding a suit to lib/suits.js
  // and to the schema without seeding it is caught here.
  if (rows.length !== SUIT_KEYS.length) {
    throw new Error(
      `Found ${rows.length} of ${SUIT_KEYS.length} suit rows. The database is not seeded — run \`npm run seed\`.`,
    )
  }

  return rows
}

/**
 * Replaces one chamber's code. The old one stops working on the next request —
 * there is no grace period and no second column holding the previous value,
 * because a code that still works after you rotated it is a code you did not
 * rotate.
 *
 * `updatedAt` is set here rather than by a trigger, the same as lib/event.js:
 * the schema has no triggers and one field is not worth introducing them for.
 */
export async function setSuitCode(suit, code) {
  await db.update(suits).set({ code, updatedAt: new Date() }).where(eq(suits.suit, suit))
}

/**
 * Moves a chamber to a new slug.
 *
 * Returns a discriminated result rather than throwing, following
 * lib/submissions.js: a collision here is not a fault, it is an ordinary thing
 * for a person to do — type a slug another chamber already has — and the caller
 * has a sentence for it. The unique index on `suits.slug` is the check; there is
 * no read first, because a read-then-write would still race with the write it
 * was checking for.
 *
 * @param {string} suit
 * @param {string} slug already normalised and validated by the caller
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'taken' }>}
 */
export async function setSuitSlug(suit, slug) {
  try {
    await db.update(suits).set({ slug, updatedAt: new Date() }).where(eq(suits.suit, suit))
    return { ok: true }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'taken' }
    throw error
  }
}

/**
 * Retires a chamber, or puts it back.
 *
 * Retiring is not deleting. The submissions stay — a team that solved this
 * chamber keeps its time on the board, because the board is a record of what
 * happened and retiring a slug is something you do *after* it leaked, not a
 * reason to rewrite the results.
 *
 * On the participant side the effect is a 404 identical to a slug that never
 * existed: lib/chambers.js compares the two cases to one branch deliberately, so
 * a retired chamber cannot confirm that it was ever real (§4).
 */
export async function setSuitActive(suit, isActive) {
  await db.update(suits).set({ isActive, updatedAt: new Date() }).where(eq(suits.suit, suit))
}
