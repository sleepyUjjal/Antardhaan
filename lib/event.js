/**
 * The event row — the singleton everything on the site measures from.
 *
 * Its two writable fields are the ones that can change the whole board without
 * touching a submission: `startTime`, which every elapsed time is computed
 * against at read time, and `submissionsOpen`, the kill switch.
 *
 * That start time is display-only is the design (§1.4, §3): elapsed is
 * `submitted_at - start_time` computed in SQL, so a start time corrected at 2
 * a.m. re-ranks five chambers with no data migration and no writes to the
 * submissions table. The C11 done-when — "changing the start time updates every
 * elapsed time on the board without touching a submission row" — is a
 * consequence of the schema rather than something this file has to arrange, and
 * the reason it is worth stating in the plan is that the alternative (storing an
 * elapsed per row) is what most people build first.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { event, submissions } from '../db/schema.js'
import { sanitizeTuning } from './glitch.js'

/**
 * The row's id. `event_singleton` in db/schema.js constrains it to 1, so this is
 * a named constant rather than a magic number at each call site.
 */
const EVENT_ID = 1

/**
 * Everything the dashboard needs, in one round trip.
 *
 * The counts and the event row go in a single `db.batch` because the dashboard
 * is refreshed by hand at the venue and a page that costs two trips to Singapore
 * is a page you stop refreshing (§9.2). The same reason lib/chambers.js batches.
 *
 * `::int` on the counts is not decoration. Postgres `count()` returns bigint, and
 * the driver's bigint handling is a string — so without the cast the dashboard
 * renders `"3"` where it means `3`, and `total + 1` becomes `"31"`. The `Number()`
 * on the way out is the same defence a second time, because a wrong-looking
 * number on the one screen nobody double-checks is worse than a redundant cast.
 *
 * `leaderSubmittedAt` is the earliest submission, which is the smallest elapsed
 * and therefore the current leader on the strictest board — it is what the
 * start-time control previews against. Read with no `min` filter, so a
 * submissions table with a single row answers it too.
 *
 * @returns {Promise<{
 *   startTime: Date,
 *   submissionsOpen: boolean,
 *   hold: 'good' | 'bad' | null,
 *   stats: { total: number, teams: number, suitsSolved: number, leaderSubmittedAt: Date | null },
 * }>}
 */
export async function getDashboard() {
  const [eventRows, statRows] = await db.batch([
    db
      .select({
        startTime: event.startTime,
        submissionsOpen: event.submissionsOpen,
        // Read for one derived value — whether a freeze is active — which is why
        // the console can show the banner without a second query. `glitch` is a
        // partial override, so this is small.
        glitch: event.glitch,
      })
      .from(event)
      .limit(1),
    db
      .select({
        total: sql`count(*)::int`,
        teams: sql`count(distinct ${submissions.teamSlug})::int`,
        suitsSolved: sql`count(distinct ${submissions.suit})::int`,
        leaderSubmittedAt: sql`min(${submissions.submittedAt})`,
      })
      .from(submissions),
  ])

  const current = eventRows[0]
  // A missing event row is not an empty dashboard, it is an unseeded database.
  // The same throw as lib/chambers.js: the failure mode of defaulting to `now()`
  // is a board that looks plausible and is wrong.
  if (!current) {
    throw new Error('The event row is missing, so nothing has a zero-point. Run `npm run seed`.')
  }

  const stats = statRows[0] ?? {}

  return {
    startTime: current.startTime,
    submissionsOpen: current.submissionsOpen,
    // Sanitised on the way out even though it was sanitised on the way in, so the
    // banner is driven by a value that went through the same door as everything
    // else. Undefined here means no freeze, which is the common case.
    hold: sanitizeTuning(current.glitch).hold ?? null,
    stats: {
      total: Number(stats.total ?? 0),
      teams: Number(stats.teams ?? 0),
      suitsSolved: Number(stats.suitsSolved ?? 0),
      // Normalised through `new Date` for the reason in lib/submissions.js: a
      // driver handing back an ISO string instead of a Date should not throw
      // here, and an aggregate column is exactly where the drivers differ.
      leaderSubmittedAt: stats.leaderSubmittedAt ? new Date(stats.leaderSubmittedAt) : null,
    },
  }
}

/**
 * Moves the event's zero-point.
 *
 * `updated_at` is set here rather than by a trigger, because the schema has no
 * triggers and one field is not worth introducing them for. Note that it is *not*
 * the start time — a dashboard that showed `updated_at` as "when the event
 * started" would be wrong by however long ago you last fixed a typo.
 *
 * @param {Date} startTime an absolute instant; the caller owns the timezone
 */
export async function setStartTime(startTime) {
  await db
    .update(event)
    .set({ startTime, updatedAt: new Date() })
    .where(eq(event.id, EVENT_ID))
}

/**
 * The kill switch.
 *
 * Closing it is not a pause: lib/submissions.js refuses every submission while
 * it is closed, and lib/chambers.js renders the closed state on every chamber —
 * so this is the thing you flip when a slug leaks or something breaks, and it
 * takes effect on the next request rather than on the next deploy.
 */
export async function setSubmissionsOpen(open) {
  await db
    .update(event)
    .set({ submissionsOpen: open, updatedAt: new Date() })
    .where(eq(event.id, EVENT_ID))
}

/**
 * The stored glitch override, as a partial — only the keys someone has actually
 * moved. `{}` therefore means "the build defaults", which is the state the site
 * is in until the first publish, and the state Reset returns it to.
 *
 * Sanitised here rather than at the call site, and the call site sanitises too.
 * This is the one that matters: every reader of this column goes through this
 * function, so a value that got into the row some other way — a manual edit, a
 * restored backup, a bug in a future writer — is still clamped before it can
 * become a CSS custom property on five hundred phones.
 *
 * @returns {Promise<ReturnType<typeof sanitizeTuning>>}
 */
export async function getGlitchTuning() {
  const rows = await db.select({ glitch: event.glitch }).from(event).limit(1)

  if (!rows[0]) {
    throw new Error('The event row is missing, so there is no glitch config. Run `npm run seed`.')
  }

  return sanitizeTuning(rows[0].glitch)
}

/**
 * Publishes a tuning override. Replaces the whole blob — this is the Publish
 * button, so what you see on the panel is what everyone gets, including the
 * knobs you moved back to their default.
 *
 * Sanitised *here*, at the last gate before the write, rather than trusting the
 * Server Action to have done it. A `'use server'` module is a public endpoint, so
 * the action is one caller among possible others, and the place that cannot be
 * bypassed is the place to put the check.
 *
 * @param {unknown} override
 */
export async function setGlitchTuning(override) {
  await db
    .update(event)
    .set({ glitch: sanitizeTuning(override), updatedAt: new Date() })
    .where(eq(event.id, EVENT_ID))
}

/**
 * Freezes or releases the flip, without touching the knobs.
 *
 * A jsonb patch rather than a read-modify-write, and that is not an optimisation.
 * The read-modify-write version would carry whatever is in the caller's hands back
 * into the row, so tapping "Freeze" on the panel mid-drag would publish the half-
 * finished knob positions you had not decided on yet. `||` merges one key; `-`
 * removes it. The freeze is the one control that has to be right on the first tap.
 *
 * The `hold` key is removed rather than set to null on release, so "released" is a
 * missing key and `{}` stays the single representation of "nothing overridden".
 *
 * @param {'good' | 'bad' | null} hold null releases
 */
export async function setGlitchHold(hold) {
  const patch =
    hold === null
      ? sql`${event.glitch} - 'hold'`
      : sql`${event.glitch} || ${JSON.stringify({ hold })}::jsonb`

  await db
    .update(event)
    .set({ glitch: patch, updatedAt: new Date() })
    .where(eq(event.id, EVENT_ID))
}
