/**
 * The submission write path.
 *
 * Deliberately not an `actions.js` file. A `'use server'` module turns *every*
 * export into a publicly callable endpoint, so keeping the logic here means the
 * action file's callable surface is exactly one function and this one stays
 * importable by a test without that rule applying to it.
 *
 * The code is read in this file and compared in this file. It is never returned
 * to a caller and never attached to the result object — see the note on
 * `recordSubmission` for why that is a property of the shape rather than a
 * promise.
 */
import { timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { event, submissions, suits } from '../db/schema.js'
import { parseTeamName } from './team.js'

/**
 * @typedef {(
 *   | { ok: true, duplicate: boolean, submittedAt: Date, elapsedMs: number }
 *   | { ok: false, reason: 'bad_code' | 'closed' | 'invalid' }
 * )} SubmitResult
 */

/**
 * Compares two codes without leaking how much of a prefix matched.
 *
 * This is not the same judgement as the rest of §7, and it is worth being
 * explicit about why it is here when rate limiting is not. §7 argues that no
 * rate limiting is needed because 31⁸ ≈ 8.5 × 10¹¹ is unguessable. That
 * argument is only true if there is no cheaper oracle, and `a === b` on strings
 * short-circuits at the first differing character — so a comparison timed from
 * the outside leaks the length of the matching prefix and turns 31⁸ guesses
 * into 8 × 31.
 *
 * A nanosecond-scale difference is not measurable across a network, so this is
 * closing a theoretical hole rather than a practical one. It is three lines, and
 * without it the number §7 quotes is not the number that applies.
 */
function codesMatch(stored, provided) {
  const a = Buffer.from(stored, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  // Length is not a secret: every code is 8 characters from a published
  // alphabet. `timingSafeEqual` throws on a length mismatch, so this has to be
  // its own check rather than relying on the comparison below.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Milliseconds between the event's zero-point and a solve.
 *
 * Both values arrive from the driver as Date objects; the `new Date(...)` calls
 * are a no-op normalisation that keeps this working if a driver hands back an
 * ISO string instead, rather than throwing on `.getTime` mid-event.
 *
 * This can be negative. Submissions are accepted whenever, so a solve recorded
 * before the start time is set reads as negative elapsed and sorts to the top of
 * the board. That is a consequence of start time being display-only (§1.4), and
 * the fix is to set the start time before the chambers open — not to clamp here,
 * where a zero would hide the mistake instead of showing it.
 */
function elapsedMsBetween(startTime, submittedAt) {
  return new Date(submittedAt).getTime() - new Date(startTime).getTime()
}

/**
 * Records a team's solve of one chamber.
 *
 * Takes a slug rather than a resolved chamber on purpose. The caller is a Server
 * Action reached from a page that resolved the slug some time ago, and the
 * chamber could have been retired in between — so this resolves independently
 * and trusts nothing the page already knew.
 *
 * @param {{ slug: unknown, teamName: unknown, code: unknown }} input
 * @returns {Promise<SubmitResult>}
 */
export async function recordSubmission({ slug, teamName, code }) {
  // `FormData.get` returns `File` for a file input and `null` for a field that
  // was never sent, and either one bound straight into the query would throw
  // rather than miss. An empty string is a slug that matches nothing, which
  // falls through to 'closed' below — the right answer for a request that never
  // named a real chamber.
  const requestedSlug = typeof slug === 'string' ? slug : ''

  const parsedName = parseTeamName(teamName)
  if (!parsedName) return { ok: false, reason: 'invalid' }

  // Codes are generated uppercase from an alphabet with no lowercase in it, but
  // they arrive typed by hand on a phone whose keyboard has its own opinions.
  // Trimming and uppercasing is not leniency: to the team holding a correct
  // code, a rejection for its case is indistinguishable from a wrong one.
  const providedCode = typeof code === 'string' ? code.trim().toUpperCase() : ''
  if (providedCode === '') return { ok: false, reason: 'invalid' }

  // One round trip, as in lib/chambers.js — but this query does select the code,
  // because this is the one place in the project allowed to read it. It stays
  // inside the `codesMatch` call below and never leaves this function.
  const [chamberRows, eventRows] = await db.batch([
    db
      .select({ suit: suits.suit, code: suits.code, isActive: suits.isActive })
      .from(suits)
      .where(eq(suits.slug, requestedSlug))
      .limit(1),
    db.select({ startTime: event.startTime, submissionsOpen: event.submissionsOpen }).from(event).limit(1),
  ])

  const chamber = chamberRows[0]
  const currentEvent = eventRows[0]

  // Three different situations, one reason code, because they are one sentence
  // to the person holding the phone: this chamber is not taking submissions.
  // A slug that stopped resolving, a chamber retired mid-event, and the global
  // kill switch are not distinctions a participant can act on (C8).
  if (!chamber || !chamber.isActive) return { ok: false, reason: 'closed' }

  if (!currentEvent) {
    throw new Error('The event row is missing, so the leaderboard has no zero-point. Run `npm run seed`.')
  }
  if (!currentEvent.submissionsOpen) return { ok: false, reason: 'closed' }

  if (!codesMatch(chamber.code, providedCode)) return { ok: false, reason: 'bad_code' }

  const inserted = await db
    .insert(submissions)
    .values({
      suit: chamber.suit,
      teamName: parsedName.displayName,
      teamSlug: parsedName.slug,
    })
    // Targeted rather than bare `onConflictDoNothing()`: this names the
    // constraint the whole design rests on, so a conflict on anything else
    // surfaces as an error instead of being silently swallowed.
    .onConflictDoNothing({ target: [submissions.suit, submissions.teamSlug] })
    .returning({ submittedAt: submissions.submittedAt })

  if (inserted.length > 0) {
    const { submittedAt } = inserted[0]
    return { ok: true, duplicate: false, submittedAt, elapsedMs: elapsedMsBetween(currentEvent.startTime, submittedAt) }
  }

  // The row already existed, so this is the double-tap path — and it is not an
  // error. The team solved this chamber already and is entitled to see the time
  // they actually earned rather than a complaint about asking twice. Re-reading
  // the original row is what gets them that, and it is why the unique constraint
  // can be the backstop instead of the plan (C8).
  const [existing] = await db
    .select({ submittedAt: submissions.submittedAt })
    .from(submissions)
    .where(and(eq(submissions.suit, chamber.suit), eq(submissions.teamSlug, parsedName.slug)))
    .limit(1)

  // Unreachable in practice: `onConflictDoNothing` only does nothing when a
  // conflicting row exists, and with a concurrent insert Postgres waits for that
  // transaction to commit before this statement returns. Thrown rather than
  // returned because a silent `ok: true` would hand the team a timestamp that
  // does not exist anywhere.
  if (!existing) {
    throw new Error(
      `Conflict on ${chamber.suit}/${parsedName.slug} but the existing row could not be re-read.`,
    )
  }

  return {
    ok: true,
    duplicate: true,
    submittedAt: existing.submittedAt,
    elapsedMs: elapsedMsBetween(currentEvent.startTime, existing.submittedAt),
  }
}
